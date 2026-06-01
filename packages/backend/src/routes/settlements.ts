import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { settlements, groupMembers, users, activities } from "../db/schema.js";
import { notifySettlement, notifySettlementDeleted } from "../lib/notifications.js";

const createSchema = z.object({
    amount: z.number().positive(),
    currency: z.string().length(3).default("INR"),
    toUserId: z.string(),
    groupId: z.string().optional().nullable(),
    notes: z.string().max(500).optional(),
    date: z.string().optional(),
});

export default async function settlementRoutes(server: FastifyInstance) {
    const auth = { preHandler: [server.authenticate] };

    // GET /api/settlements?groupId=
    server.get("/", auth, async (req: FastifyRequest<{ Querystring: { groupId?: string } }>) => {
        const userId = req.user.id;
        const { groupId } = req.query;

        const rows = await db.query.settlements.findMany({
            where: (s, { and, or, eq }) =>
                and(
                    groupId ? eq(s.groupId, groupId) : undefined,
                    or(eq(s.fromUserId, userId), eq(s.toUserId, userId)),
                ),
            with: {
                fromUser: { columns: { id: true, name: true, email: true, image: true } },
                toUser: { columns: { id: true, name: true, email: true, image: true } },
            },
            orderBy: (s, { desc }) => [desc(s.date)],
        });

        return rows.map((s) => ({ ...s, date: s.date.toISOString() }));
    });

    // POST /api/settlements
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

        const [toUser] = await db
            .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
            .from(users)
            .where(eq(users.id, data.toUserId))
            .limit(1);
        if (!toUser) return reply.code(404).send({ error: "Recipient not found" });

        const [settlement] = await db
            .insert(settlements)
            .values({
                amount: data.amount,
                currency: data.currency,
                fromUserId: userId,
                toUserId: data.toUserId,
                groupId: data.groupId,
                notes: data.notes,
                date: data.date ? new Date(data.date) : new Date(),
            })
            .returning();

        await db.insert(activities).values({
            type: "SETTLEMENT_ADDED",
            description: `Settled $${data.amount.toFixed(2)} with ${toUser.name}`,
            userId,
            settlementId: settlement.id,
        });

        // Notify recipient
        const [fromUser] = await db
            .select({ name: users.name, email: users.email, phone: users.phone })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        if (fromUser) {
            notifySettlement(fromUser, toUser, data.amount, data.currency);
        }

        const full = await db.query.settlements.findFirst({
            where: eq(settlements.id, settlement.id),
            with: {
                fromUser: { columns: { id: true, name: true, email: true, image: true } },
                toUser: { columns: { id: true, name: true, email: true, image: true } },
            },
        });
        return reply.code(201).send({ ...full, date: settlement.date.toISOString() });
    });

    // DELETE /api/settlements/:id
    server.delete(
        "/:id",
        auth,
        async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            const { id } = req.params;
            const userId = req.user.id;

            const [settlement] = await db
                .select()
                .from(settlements)
                .where(eq(settlements.id, id))
                .limit(1);
            if (!settlement) return reply.code(404).send({ error: "Not found" });
            if (settlement.fromUserId !== userId)
                return reply.code(403).send({ error: "Only the payer can delete this settlement" });

            const [toUser] = await db
                .select({ name: users.name, email: users.email, phone: users.phone })
                .from(users)
                .where(eq(users.id, settlement.toUserId))
                .limit(1);

            await db.delete(settlements).where(eq(settlements.id, id));

            await db.insert(activities).values({
                type: "SETTLEMENT_DELETED",
                description: `Removed a settlement of $${settlement.amount.toFixed(2)}`,
                userId,
            });

            const [actor] = await db
                .select({ name: users.name, email: users.email, phone: users.phone })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);
            if (actor && toUser) {
                notifySettlementDeleted(actor, toUser, settlement.amount, settlement.currency);
            }

            return { success: true };
        },
    );
}
