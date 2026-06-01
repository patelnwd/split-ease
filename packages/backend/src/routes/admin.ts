import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const PERMANENT_BAN_DATE = new Date("2099-12-31T23:59:59Z");

const banSchema = z.object({
    days: z.number().int().positive().optional(), // omit → permanent
    reason: z.string().max(500).optional(),
});

export default async function adminRoutes(server: FastifyInstance) {
    const adminAuth = { preHandler: [server.requireAdmin] };

    // GET /api/admin/users — all users with ban/admin status
    server.get("/users", adminAuth, async () => {
        const rows = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                image: users.image,
                isAdmin: users.isAdmin,
                emailVerified: users.emailVerified,
                bannedUntil: users.bannedUntil,
                banReason: users.banReason,
                createdAt: users.createdAt,
            })
            .from(users)
            .orderBy(users.createdAt);

        return rows.map((u) => ({
            ...u,
            bannedUntil: u.bannedUntil?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
            isBanned: u.bannedUntil ? u.bannedUntil > new Date() : false,
            isPermanentBan: u.bannedUntil ? u.bannedUntil.getFullYear() >= 2099 : false,
        }));
    });

    // POST /api/admin/users/:id/ban
    server.post<{ Params: { id: string } }>("/users/:id/ban", adminAuth, async (req, reply) => {
        if (req.params.id === req.user.id)
            return reply.code(400).send({ error: "Cannot ban yourself" });

        const [target] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, req.params.id))
            .limit(1);
        if (!target) return reply.code(404).send({ error: "User not found" });

        const result = banSchema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });

        const bannedUntil = result.data.days
            ? new Date(Date.now() + result.data.days * 86_400_000)
            : PERMANENT_BAN_DATE;

        const [updated] = await db
            .update(users)
            .set({ bannedUntil, banReason: result.data.reason ?? null, updatedAt: new Date() })
            .where(eq(users.id, req.params.id))
            .returning({
                id: users.id,
                name: users.name,
                email: users.email,
                bannedUntil: users.bannedUntil,
                banReason: users.banReason,
            });

        const isPermanent = (updated.bannedUntil?.getFullYear() ?? 0) >= 2099;
        return {
            ...updated,
            // Hide the internal 2099 sentinel — callers just see isPermanentBan=true + bannedUntil=null
            bannedUntil: isPermanent ? null : (updated.bannedUntil?.toISOString() ?? null),
            isPermanentBan: isPermanent,
        };
    });

    // POST /api/admin/users/:id/unban
    server.post<{ Params: { id: string } }>("/users/:id/unban", adminAuth, async (req, reply) => {
        const [target] = await db
            .select({ id: users.id, bannedUntil: users.bannedUntil })
            .from(users)
            .where(eq(users.id, req.params.id))
            .limit(1);
        if (!target) return reply.code(404).send({ error: "User not found" });

        await db
            .update(users)
            .set({ bannedUntil: null, banReason: null, updatedAt: new Date() })
            .where(eq(users.id, req.params.id));

        return { success: true };
    });

    // PATCH /api/admin/users/:id  — toggle admin, force-verify email
    server.patch<{ Params: { id: string } }>("/users/:id", adminAuth, async (req, reply) => {
        const schema = z.object({
            isAdmin: z.boolean().optional(),
            emailVerified: z.boolean().optional(),
        });
        const result = schema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });

        if (req.params.id === req.user.id && result.data.isAdmin === false)
            return reply.code(400).send({ error: "Cannot remove your own admin status" });

        const [target] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, req.params.id))
            .limit(1);
        if (!target) return reply.code(404).send({ error: "User not found" });

        const [updated] = await db
            .update(users)
            .set({ ...result.data, updatedAt: new Date() })
            .where(eq(users.id, req.params.id))
            .returning({
                id: users.id,
                name: users.name,
                email: users.email,
                isAdmin: users.isAdmin,
                emailVerified: users.emailVerified,
            });

        return updated;
    });
}
