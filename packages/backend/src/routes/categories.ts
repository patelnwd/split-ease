import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { customCategories } from "../db/schema.js";

const bodySchema = z.object({
    name: z.string().min(1).max(40),
    icon: z.string().min(1).max(8).default("📌"),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color")
        .default("#6366f1"),
});

export default async function categoryRoutes(server: FastifyInstance) {
    const auth = { preHandler: [server.authenticate] };

    // GET /api/categories — user's custom categories
    server.get("/", auth, async (req: FastifyRequest) => {
        return db
            .select()
            .from(customCategories)
            .where(eq(customCategories.userId, req.user.id))
            .orderBy(customCategories.createdAt);
    });

    // POST /api/categories
    server.post("/", auth, async (req: FastifyRequest, reply: FastifyReply) => {
        const result = bodySchema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });

        const [cat] = await db
            .insert(customCategories)
            .values({ ...result.data, userId: req.user.id })
            .returning();
        return reply.code(201).send(cat);
    });

    // PATCH /api/categories/:id
    server.patch<{ Params: { id: string } }>("/:id", auth, async (req, reply) => {
        const [existing] = await db
            .select({ id: customCategories.id })
            .from(customCategories)
            .where(
                and(
                    eq(customCategories.id, req.params.id),
                    eq(customCategories.userId, req.user.id),
                ),
            )
            .limit(1);
        if (!existing) return reply.code(404).send({ error: "Not found" });

        const result = bodySchema.partial().safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });

        const [updated] = await db
            .update(customCategories)
            .set({ ...result.data, updatedAt: new Date() })
            .where(eq(customCategories.id, req.params.id))
            .returning();
        return updated;
    });

    // DELETE /api/categories/:id
    server.delete<{ Params: { id: string } }>("/:id", auth, async (req, reply) => {
        const [existing] = await db
            .select({ id: customCategories.id })
            .from(customCategories)
            .where(
                and(
                    eq(customCategories.id, req.params.id),
                    eq(customCategories.userId, req.user.id),
                ),
            )
            .limit(1);
        if (!existing) return reply.code(404).send({ error: "Not found" });

        await db.delete(customCategories).where(eq(customCategories.id, req.params.id));
        return { success: true };
    });
}
