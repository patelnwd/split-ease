import { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLogs } from "../db/schema.js";

export default async function accessLogRoutes(server: FastifyInstance) {
    server.get<{ Querystring: { limit?: string; offset?: string } }>(
        "/",
        { preHandler: [server.authenticate] },
        async (req) => {
            const userId = req.user.id;
            const limit = Math.min(Number(req.query.limit ?? 50), 200);
            const offset = Number(req.query.offset ?? 0);

            const rows = await db
                .select({
                    id: accessLogs.id,
                    method: accessLogs.method,
                    path: accessLogs.path,
                    statusCode: accessLogs.statusCode,
                    duration: accessLogs.duration,
                    ip: accessLogs.ip,
                    userAgent: accessLogs.userAgent,
                    createdAt: accessLogs.createdAt,
                })
                .from(accessLogs)
                .where(eq(accessLogs.userId, userId))
                .orderBy(desc(accessLogs.createdAt))
                .limit(limit)
                .offset(offset);

            return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
        },
    );
}
