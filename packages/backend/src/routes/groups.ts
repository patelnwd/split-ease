import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import {
    groups,
    groupMembers,
    expenses,
    expenseParticipants,
    settlements,
    friendships,
    activities,
    users,
} from "../db/schema.js";
import { calculateUserBalances, simplifyDebts } from "../lib/balance.js";
import { notifyMemberAdded } from "../lib/notifications.js";

const createSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    category: z.enum(["HOME", "TRIP", "COUPLE", "WORK", "OTHER"]).default("OTHER"),
    memberIds: z.array(z.string()).default([]),
});

const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    category: z.enum(["HOME", "TRIP", "COUPLE", "WORK", "OTHER"]).optional(),
});

const memberSchema = z.object({ userId: z.string() });

export default async function groupRoutes(server: FastifyInstance) {
    const auth = { preHandler: [server.authenticate] };

    // GET /api/groups
    server.get("/", auth, async (req: FastifyRequest) => {
        const userId = req.user.id;

        const memberGroupIds = db
            .select({ groupId: groupMembers.groupId })
            .from(groupMembers)
            .where(eq(groupMembers.userId, userId));

        const allGroups = await db.query.groups.findMany({
            where: (g, { inArray }) => inArray(g.id, memberGroupIds),
            with: {
                members: true,
                expenses: { with: { participants: true, paidBy: true } },
                settlements: { with: { fromUser: true, toUser: true } },
            },
            orderBy: (g, { desc }) => [desc(g.updatedAt)],
        });

        return allGroups.map((g) => {
            const balances = calculateUserBalances(g.expenses, g.settlements, userId);
            const myBalance = Math.round(balances.reduce((s, b) => s + b.amount, 0) * 100) / 100;
            return {
                id: g.id,
                name: g.name,
                description: g.description,
                category: g.category,
                image: g.image,
                createdAt: g.createdAt.toISOString(),
                memberCount: g.members.length,
                myBalance,
            };
        });
    });

    // POST /api/groups
    server.post("/", auth, async (req: FastifyRequest, reply: FastifyReply) => {
        const result = createSchema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });
        const { name, description, category, memberIds } = result.data;
        const userId = req.user.id;
        const uniqueMembers = Array.from(new Set([userId, ...memberIds]));

        const [group] = await db
            .insert(groups)
            .values({ name, description, category, createdById: userId })
            .returning();

        await db.insert(groupMembers).values(
            uniqueMembers.map((uid) => ({
                groupId: group.id,
                userId: uid,
                role: uid === userId ? ("ADMIN" as const) : ("MEMBER" as const),
            })),
        );

        await db.insert(activities).values({
            type: "GROUP_CREATED",
            description: `Created group "${name}"`,
            userId,
        });

        for (const memberId of memberIds) {
            const [u1, u2] = userId < memberId ? [userId, memberId] : [memberId, userId];
            await db.insert(friendships).values({ user1Id: u1, user2Id: u2 }).onConflictDoNothing();

            await db.insert(activities).values({
                type: "MEMBER_ADDED",
                description: `Added a member to "${name}"`,
                userId,
            });
        }

        const fullGroup = await db.query.groups.findFirst({
            where: eq(groups.id, group.id),
            with: {
                members: {
                    with: { user: { columns: { id: true, name: true, email: true, image: true } } },
                },
            },
        });
        return reply.code(201).send(fullGroup);
    });

    // GET /api/groups/:id
    server.get(
        "/:id",
        auth,
        async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            const { id } = req.params;
            const userId = req.user.id;

            const group = await db.query.groups.findFirst({
                where: eq(groups.id, id),
                with: {
                    createdBy: { columns: { id: true, name: true, email: true, image: true } },
                    members: {
                        with: {
                            user: { columns: { id: true, name: true, email: true, image: true } },
                        },
                        orderBy: (m, { asc }) => [asc(m.joinedAt)],
                    },
                    expenses: {
                        with: {
                            paidBy: { columns: { id: true, name: true, email: true, image: true } },
                            participants: {
                                with: {
                                    user: {
                                        columns: { id: true, name: true, email: true, image: true },
                                    },
                                },
                            },
                        },
                        orderBy: (e, { desc }) => [desc(e.date)],
                    },
                    settlements: {
                        with: {
                            fromUser: {
                                columns: { id: true, name: true, email: true, image: true },
                            },
                            toUser: { columns: { id: true, name: true, email: true, image: true } },
                        },
                        orderBy: (s, { desc }) => [desc(s.date)],
                    },
                },
            });

            if (!group) return reply.code(404).send({ error: "Group not found" });
            const isMember = group.members.some((m) => m.userId === userId);
            if (!isMember) return reply.code(403).send({ error: "Forbidden" });

            const memberUsers = group.members.map((m) => m.user);
            const simplifiedDebts = simplifyDebts(group.expenses, group.settlements, memberUsers);
            return { ...group, simplifiedDebts };
        },
    );

    // PATCH /api/groups/:id
    server.patch(
        "/:id",
        auth,
        async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            const { id } = req.params;
            const [member] = await db
                .select()
                .from(groupMembers)
                .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, req.user.id)))
                .limit(1);
            if (member?.role !== "ADMIN") return reply.code(403).send({ error: "Admins only" });

            const result = updateSchema.safeParse(req.body);
            if (!result.success)
                return reply.code(400).send({ error: result.error.errors[0].message });

            const [updated] = await db
                .update(groups)
                .set({ ...result.data, updatedAt: new Date() })
                .where(eq(groups.id, id))
                .returning();

            await db.insert(activities).values({
                type: "GROUP_UPDATED",
                description: `Updated group "${updated.name}"`,
                userId: req.user.id,
            });

            return updated;
        },
    );

    // DELETE /api/groups/:id
    server.delete(
        "/:id",
        auth,
        async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            const { id } = req.params;
            const [member] = await db
                .select()
                .from(groupMembers)
                .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, req.user.id)))
                .limit(1);
            if (member?.role !== "ADMIN") return reply.code(403).send({ error: "Admins only" });
            await db.delete(groups).where(eq(groups.id, id));
            return { success: true };
        },
    );

    // POST /api/groups/:id/members
    server.post(
        "/:id/members",
        auth,
        async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            const { id } = req.params;
            const [requester] = await db
                .select()
                .from(groupMembers)
                .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, req.user.id)))
                .limit(1);
            if (requester?.role !== "ADMIN") return reply.code(403).send({ error: "Admins only" });

            const result = memberSchema.safeParse(req.body);
            if (!result.success)
                return reply.code(400).send({ error: result.error.errors[0].message });
            const newUserId = result.data.userId;

            const [newMember] = await db
                .insert(groupMembers)
                .values({ groupId: id, userId: newUserId, role: "MEMBER" })
                .returning();

            const [a, b] =
                req.user.id < newUserId ? [req.user.id, newUserId] : [newUserId, req.user.id];
            await db.insert(friendships).values({ user1Id: a, user2Id: b }).onConflictDoNothing();

            const [groupRow] = await db
                .select({ name: groups.name })
                .from(groups)
                .where(eq(groups.id, id))
                .limit(1);
            await db.insert(activities).values({
                type: "MEMBER_ADDED",
                description: `Added a member to "${groupRow?.name ?? "group"}"`,
                userId: req.user.id,
            });

            // Notify new member
            const [actor, newUser] = await Promise.all([
                db
                    .select({ name: users.name, email: users.email, phone: users.phone })
                    .from(users)
                    .where(eq(users.id, req.user.id))
                    .limit(1)
                    .then((r) => r[0]),
                db
                    .select({ name: users.name, email: users.email, phone: users.phone })
                    .from(users)
                    .where(eq(users.id, newUserId))
                    .limit(1)
                    .then((r) => r[0]),
            ]);
            if (actor && newUser && groupRow) {
                notifyMemberAdded(actor, newUser, groupRow.name);
            }

            return reply.code(201).send(newMember);
        },
    );

    // DELETE /api/groups/:id/members?userId=
    server.delete(
        "/:id/members",
        auth,
        async (
            req: FastifyRequest<{ Params: { id: string }; Querystring: { userId: string } }>,
            reply: FastifyReply,
        ) => {
            const { id } = req.params;
            const { userId } = req.query;
            if (!userId) return reply.code(400).send({ error: "userId required" });

            const [requester] = await db
                .select()
                .from(groupMembers)
                .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, req.user.id)))
                .limit(1);
            if (!requester || (requester.role !== "ADMIN" && req.user.id !== userId)) {
                return reply.code(403).send({ error: "Forbidden" });
            }

            await db
                .delete(groupMembers)
                .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)));

            const [groupRow] = await db
                .select({ name: groups.name })
                .from(groups)
                .where(eq(groups.id, id))
                .limit(1);
            await db.insert(activities).values({
                type: "MEMBER_REMOVED",
                description: `Removed a member from "${groupRow?.name ?? "group"}"`,
                userId: req.user.id,
            });

            return { success: true };
        },
    );
}
