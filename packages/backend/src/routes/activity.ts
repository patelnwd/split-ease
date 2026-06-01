import { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/index.js";
import { friendships } from "../db/schema.js";

export default async function activityRoutes(server: FastifyInstance) {
    server.get(
        "/",
        { preHandler: [server.authenticate] },
        async (req: FastifyRequest<{ Querystring: { limit?: string } }>) => {
            const userId = req.user.id;
            const limit = Number.parseInt(req.query.limit ?? "30");

            const allFriendships = await db.query.friendships.findMany({
                where: (f, { or, eq }) => or(eq(f.user1Id, userId), eq(f.user2Id, userId)),
                columns: { user1Id: true, user2Id: true },
            });
            const friendIds = allFriendships.map((f) =>
                f.user1Id === userId ? f.user2Id : f.user1Id,
            );

            const rows = await db.query.activities.findMany({
                where: (a, { inArray }) => inArray(a.userId, [userId, ...friendIds]),
                with: {
                    user: { columns: { id: true, name: true, email: true, image: true } },
                    expense: {
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
                    },
                    settlement: {
                        with: {
                            fromUser: {
                                columns: { id: true, name: true, email: true, image: true },
                            },
                            toUser: { columns: { id: true, name: true, email: true, image: true } },
                        },
                    },
                },
                orderBy: (a, { desc }) => [desc(a.createdAt)],
                limit,
            });

            return rows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }));
        },
    );
}
