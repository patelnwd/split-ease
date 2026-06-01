import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { friendships, expenseParticipants, users, activities } from "../db/schema.js";
import { calculateUserBalances } from "../lib/balance.js";
import { notifyFriendAdded } from "../lib/notifications.js";

export default async function friendRoutes(server: FastifyInstance) {
    const auth = { preHandler: [server.authenticate] };

    // GET /api/friends
    server.get("/", auth, async (req: FastifyRequest) => {
        const userId = req.user.id;

        const participantExpenseIds = db
            .select({ expenseId: expenseParticipants.expenseId })
            .from(expenseParticipants)
            .where(eq(expenseParticipants.userId, userId));

        const [allFriendships, allExpenses, allSettlements] = await Promise.all([
            db.query.friendships.findMany({
                where: (f, { or, eq }) => or(eq(f.user1Id, userId), eq(f.user2Id, userId)),
                with: {
                    user1: { columns: { id: true, name: true, email: true, image: true } },
                    user2: { columns: { id: true, name: true, email: true, image: true } },
                },
            }),
            db.query.expenses.findMany({
                where: (e, { or, eq, inArray }) =>
                    or(eq(e.paidById, userId), inArray(e.id, participantExpenseIds)),
                with: { participants: true, paidBy: true },
            }),
            db.query.settlements.findMany({
                where: (s, { or, eq }) => or(eq(s.fromUserId, userId), eq(s.toUserId, userId)),
                with: { fromUser: true, toUser: true },
            }),
        ]);

        const balances = calculateUserBalances(allExpenses, allSettlements, userId);
        const balanceMap = new Map(balances.map((b) => [b.userId, b.amount]));

        return allFriendships.map((f) => {
            const friend = f.user1Id === userId ? f.user1 : f.user2;
            return { ...friend, balance: balanceMap.get(friend.id) ?? 0 };
        });
    });

    // POST /api/friends
    server.post("/", auth, async (req: FastifyRequest, reply: FastifyReply) => {
        const schema = z.object({ userId: z.string() });
        const result = schema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });

        const friendId = result.data.userId;
        const userId = req.user.id;
        if (friendId === userId) return reply.code(400).send({ error: "Cannot add yourself" });

        const [u1, u2] = userId < friendId ? [userId, friendId] : [friendId, userId];
        await db.insert(friendships).values({ user1Id: u1, user2Id: u2 }).onConflictDoNothing();

        await db.insert(activities).values({
            type: "FRIEND_ADDED",
            description: `Added a new friend`,
            userId,
        });

        // Notify new friend
        const [actor, newFriend] = await Promise.all([
            db
                .select({ name: users.name, email: users.email, phone: users.phone })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1)
                .then((r) => r[0]),
            db
                .select({ name: users.name, email: users.email, phone: users.phone })
                .from(users)
                .where(eq(users.id, friendId))
                .limit(1)
                .then((r) => r[0]),
        ]);
        if (actor && newFriend) notifyFriendAdded(actor, newFriend);

        return reply.code(201).send({ success: true });
    });

    // DELETE /api/friends?userId=
    server.delete(
        "/",
        auth,
        async (req: FastifyRequest<{ Querystring: { userId: string } }>, reply: FastifyReply) => {
            const friendId = req.query.userId;
            if (!friendId) return reply.code(400).send({ error: "userId required" });

            const [u1, u2] = [req.user.id, friendId].sort((a, b) => a.localeCompare(b));
            await db
                .delete(friendships)
                .where(and(eq(friendships.user1Id, u1), eq(friendships.user2Id, u2)));

            await db.insert(activities).values({
                type: "FRIEND_REMOVED",
                description: `Removed a friend`,
                userId: req.user.id,
            });

            return { success: true };
        },
    );
}
