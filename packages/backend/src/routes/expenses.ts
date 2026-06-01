import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and, or, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
    expenses,
    expenseParticipants,
    groupMembers,
    groups,
    activities,
    users,
} from "../db/schema.js";
import {
    notifyExpenseAdded,
    notifyExpenseUpdated,
    notifyExpenseDeleted,
} from "../lib/notifications.js";

const participantSchema = z.object({
    userId: z.string(),
    amount: z.number().optional(),
    percentage: z.number().optional(),
    shares: z.number().int().optional(),
});

const categoryEnum = z.enum([
    "GENERAL",
    "FOOD",
    "TRANSPORT",
    "ACCOMMODATION",
    "ENTERTAINMENT",
    "SHOPPING",
    "UTILITIES",
    "HEALTHCARE",
    "OTHER",
]);
const splitTypeEnum = z.enum(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"]);

const createSchema = z.object({
    description: z.string().min(1).max(200),
    amount: z.number().positive(),
    currency: z.string().length(3).default("INR"),
    date: z.string().optional(),
    category: categoryEnum.default("GENERAL"),
    customCategoryId: z.string().optional().nullable(),
    splitType: splitTypeEnum.default("EQUAL"),
    notes: z.string().max(500).optional(),
    groupId: z.string().optional().nullable(),
    paidById: z.string(),
    participants: z.array(participantSchema).min(1),
});

const updateSchema = z.object({
    description: z.string().min(1).max(200).optional(),
    amount: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    date: z.string().optional(),
    category: categoryEnum.optional(),
    customCategoryId: z.string().nullable().optional(),
    splitType: splitTypeEnum.optional(),
    notes: z.string().max(500).nullable().optional(),
    participants: z.array(participantSchema).min(1).optional(),
});

function computeAmounts(
    splitType: string,
    total: number,
    participants: z.infer<typeof participantSchema>[],
) {
    // Work in integer cents throughout to avoid floating-point drift,
    // then distribute any remainder (from floor rounding) to the first N participants.
    const totalCents = Math.round(total * 100);

    if (splitType === "EQUAL") {
        const base = Math.floor(totalCents / participants.length);
        const remainder = totalCents - base * participants.length;
        return participants.map((p, i) => ({
            userId: p.userId,
            amount: (i < remainder ? base + 1 : base) / 100,
        }));
    }

    if (splitType === "EXACT") {
        return participants.map((p) => ({ userId: p.userId, amount: p.amount ?? 0 }));
    }

    if (splitType === "PERCENTAGE") {
        const raw = participants.map((p) => ({
            userId: p.userId,
            cents: Math.floor(((p.percentage ?? 0) / 100) * totalCents),
            percentage: p.percentage,
        }));
        const distributed = raw.reduce((s, p) => s + p.cents, 0);
        const remainder = totalCents - distributed;
        return raw.map((p, i) => ({
            userId: p.userId,
            amount: (i < remainder ? p.cents + 1 : p.cents) / 100,
            percentage: p.percentage,
        }));
    }

    if (splitType === "SHARES") {
        const totalShares = participants.reduce((s, p) => s + (p.shares ?? 1), 0);
        const raw = participants.map((p) => ({
            userId: p.userId,
            cents: Math.floor(((p.shares ?? 1) / totalShares) * totalCents),
            shares: p.shares ?? 1,
        }));
        const distributed = raw.reduce((s, p) => s + p.cents, 0);
        const remainder = totalCents - distributed;
        return raw.map((p, i) => ({
            userId: p.userId,
            amount: (i < remainder ? p.cents + 1 : p.cents) / 100,
            shares: p.shares ?? 1,
        }));
    }

    return [];
}

const WITH_CUSTOM_CAT = { id: true, name: true, icon: true, color: true } as const;

async function fetchFullExpense(id: string) {
    return db.query.expenses.findFirst({
        where: eq(expenses.id, id),
        with: {
            paidBy: { columns: { id: true, name: true, email: true, image: true } },
            customCategory: { columns: WITH_CUSTOM_CAT },
            participants: {
                with: {
                    user: {
                        columns: { id: true, name: true, email: true, image: true, phone: true },
                    },
                },
            },
        },
    });
}

export default async function expenseRoutes(server: FastifyInstance) {
    const auth = { preHandler: [server.authenticate] };

    // GET /api/expenses?groupId=&limit=
    server.get<{ Querystring: { groupId?: string; limit?: string } }>("/", auth, async (req) => {
        const { groupId, limit = "50" } = req.query;
        const userId = req.user.id;

        if (groupId) {
            return db.query.expenses.findMany({
                where: eq(expenses.groupId, groupId),
                with: {
                    paidBy: { columns: { id: true, name: true, email: true, image: true } },
                    customCategory: { columns: WITH_CUSTOM_CAT },
                    participants: {
                        with: {
                            user: { columns: { id: true, name: true, email: true, image: true } },
                        },
                    },
                },
                orderBy: (e, { desc }) => [desc(e.date)],
                limit: Number.parseInt(limit),
            });
        }

        const participantExpenseIds = db
            .select({ expenseId: expenseParticipants.expenseId })
            .from(expenseParticipants)
            .where(eq(expenseParticipants.userId, userId));

        return db.query.expenses.findMany({
            where: (e, { or, eq, inArray }) =>
                or(eq(e.paidById, userId), inArray(e.id, participantExpenseIds)),
            with: {
                paidBy: { columns: { id: true, name: true, email: true, image: true } },
                participants: {
                    with: { user: { columns: { id: true, name: true, email: true, image: true } } },
                },
            },
            orderBy: (e, { desc }) => [desc(e.date)],
            limit: Number.parseInt(limit),
        });
    });

    // GET /api/expenses/:id
    server.get<{ Params: { id: string } }>("/:id", auth, async (req, reply) => {
        const full = await fetchFullExpense(req.params.id);
        if (!full) return reply.code(404).send({ error: "Not found" });

        const userId = req.user.id;
        const isInvolved =
            full.paidById === userId || full.participants.some((p) => p.userId === userId);
        if (!isInvolved) return reply.code(403).send({ error: "Forbidden" });

        return full;
    });

    // POST /api/expenses
    server.post("/", auth, async (req: FastifyRequest, reply: FastifyReply) => {
        const result = createSchema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });
        const data = result.data;
        const userId = req.user.id;

        if (data.groupId) {
            const [membership] = await db
                .select({ id: groupMembers.id })
                .from(groupMembers)
                .where(and(eq(groupMembers.groupId, data.groupId), eq(groupMembers.userId, userId)))
                .limit(1);
            if (!membership) return reply.code(403).send({ error: "Not a group member" });
        }

        const computedParticipants = computeAmounts(data.splitType, data.amount, data.participants);

        const [expense] = await db
            .insert(expenses)
            .values({
                description: data.description,
                amount: data.amount,
                currency: data.currency,
                date: data.date ? new Date(data.date) : new Date(),
                category: data.customCategoryId ? "OTHER" : data.category,
                customCategoryId: data.customCategoryId ?? null,
                splitType: data.splitType,
                notes: data.notes,
                groupId: data.groupId,
                paidById: data.paidById,
            })
            .returning();

        await db
            .insert(expenseParticipants)
            .values(computedParticipants.map((p) => ({ expenseId: expense.id, ...p })));

        if (data.groupId) {
            await db
                .update(groups)
                .set({ updatedAt: new Date() })
                .where(eq(groups.id, data.groupId));
        }

        await db.insert(activities).values({
            type: "EXPENSE_ADDED",
            description: `Added "${data.description}" (${data.currency} ${data.amount.toFixed(2)})`,
            userId,
            expenseId: expense.id,
        });

        const full = await fetchFullExpense(expense.id);

        // Notify participants (fire-and-forget)
        const actor = await db
            .select({ name: users.name, email: users.email, phone: users.phone })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
            .then((r) => r[0]);
        if (actor && full) {
            const recipients = full.participants.map((p) => ({
                name: p.user.name,
                email: p.user.email,
                phone: p.user.phone,
            }));
            notifyExpenseAdded(actor, recipients, {
                description: data.description,
                amount: data.amount,
                currency: data.currency,
            });
        }

        return reply.code(201).send(full);
    });

    // PATCH /api/expenses/:id
    server.patch<{ Params: { id: string } }>("/:id", auth, async (req, reply) => {
        const { id } = req.params;
        const [existing] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
        if (!existing) return reply.code(404).send({ error: "Not found" });
        if (existing.paidById !== req.user.id)
            return reply.code(403).send({ error: "Only the payer can edit this" });

        const result = updateSchema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });
        const data = result.data;

        const newAmount = data.amount ?? existing.amount;
        const newSplitType = data.splitType ?? existing.splitType;

        const [updated] = await db
            .update(expenses)
            .set({
                description: data.description,
                amount: data.amount,
                currency: data.currency,
                date: data.date ? new Date(data.date) : undefined,
                category: data.customCategoryId ? "OTHER" : data.category,
                customCategoryId: data.customCategoryId,
                splitType: data.splitType,
                notes: data.notes,
                updatedAt: new Date(),
            })
            .where(eq(expenses.id, id))
            .returning();

        if (data.participants) {
            await db.delete(expenseParticipants).where(eq(expenseParticipants.expenseId, id));
            const computed = computeAmounts(newSplitType, newAmount, data.participants);
            await db
                .insert(expenseParticipants)
                .values(computed.map((p) => ({ expenseId: id, ...p })));
        }

        if (updated.groupId) {
            await db
                .update(groups)
                .set({ updatedAt: new Date() })
                .where(eq(groups.id, updated.groupId));
        }

        await db.insert(activities).values({
            type: "EXPENSE_UPDATED",
            description: `Updated "${updated.description}" (${updated.currency} ${updated.amount.toFixed(2)})`,
            userId: req.user.id,
            expenseId: id,
        });

        const full = await fetchFullExpense(id);

        const actor = await db
            .select({ name: users.name, email: users.email, phone: users.phone })
            .from(users)
            .where(eq(users.id, req.user.id))
            .limit(1)
            .then((r) => r[0]);
        if (actor && full) {
            const recipients = full.participants.map((p) => ({
                name: p.user.name,
                email: p.user.email,
                phone: p.user.phone,
            }));
            notifyExpenseUpdated(actor, recipients, {
                description: updated.description,
                amount: updated.amount,
                currency: updated.currency,
            });
        }

        return full;
    });

    // DELETE /api/expenses/:id
    server.delete<{ Params: { id: string } }>("/:id", auth, async (req, reply) => {
        const { id } = req.params;
        const full = await fetchFullExpense(id);
        if (!full) return reply.code(404).send({ error: "Not found" });
        if (full.paidById !== req.user.id)
            return reply.code(403).send({ error: "Only the payer can delete this" });

        const recipients = full.participants.map((p) => ({
            name: p.user.name,
            email: p.user.email,
            phone: p.user.phone,
        }));

        await db.delete(expenses).where(eq(expenses.id, id));
        await db.insert(activities).values({
            type: "EXPENSE_DELETED",
            description: `Deleted "${full.description}"`,
            userId: req.user.id,
        });

        const actor = await db
            .select({ name: users.name, email: users.email, phone: users.phone })
            .from(users)
            .where(eq(users.id, req.user.id))
            .limit(1)
            .then((r) => r[0]);
        if (actor) {
            notifyExpenseDeleted(actor, recipients, {
                description: full.description,
                amount: full.amount,
                currency: full.currency,
            });
        }

        return { success: true };
    });
}
