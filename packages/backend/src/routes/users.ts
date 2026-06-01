import { FastifyInstance, FastifyRequest } from "fastify";
import { ilike, ne, or, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export default async function userRoutes(server: FastifyInstance) {
    server.get(
        "/search",
        { preHandler: [server.authenticate] },
        async (req: FastifyRequest<{ Querystring: { q?: string } }>) => {
            const q = req.query.q?.trim() ?? "";
            if (q.length < 2) return [];

            return db
                .select({ id: users.id, name: users.name, email: users.email, image: users.image })
                .from(users)
                .where(
                    and(
                        ne(users.id, req.user.id),
                        or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)),
                    ),
                )
                .limit(10);
        },
    );
}
