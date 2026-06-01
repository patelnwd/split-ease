import "dotenv/config";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pipeline } from "stream/promises";
import fs from "fs";
import path from "path";
import { db } from "../db/index.js";
import { users, activities } from "../db/schema.js";

const updateSchema = z.object({
    name: z.string().min(2).max(50).optional(),
    image: z.string().url().nullable().optional(),
    phone: z.string().max(20).nullable().optional(),
    currency: z.string().length(3).optional(),
});

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
const AVATARS_DIR = path.join(UPLOADS_DIR, "avatars");

export default async function profileRoutes(server: FastifyInstance) {
    const auth = { preHandler: [server.authenticate] };

    // GET /api/profile
    server.get("/", auth, async (req: FastifyRequest) => {
        const [user] = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                image: users.image,
                phone: users.phone,
                currency: users.currency,
                oauthProvider: users.oauthProvider,
                createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.id, req.user.id))
            .limit(1);
        if (!user) return null;
        // hasPassword tells the frontend whether to show Change vs Set password
        const [row] = await db
            .select({ pw: users.password })
            .from(users)
            .where(eq(users.id, req.user.id))
            .limit(1);
        return { ...user, hasPassword: !!row?.pw };
    });

    // PATCH /api/profile
    server.patch("/", auth, async (req: FastifyRequest, reply: FastifyReply) => {
        const result = updateSchema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });

        const [updated] = await db
            .update(users)
            .set({ ...result.data, updatedAt: new Date() })
            .where(eq(users.id, req.user.id))
            .returning({
                id: users.id,
                name: users.name,
                email: users.email,
                image: users.image,
                phone: users.phone,
                currency: users.currency,
                oauthProvider: users.oauthProvider,
            });

        await db.insert(activities).values({
            type: "PROFILE_UPDATED",
            description: "Updated profile",
            userId: req.user.id,
        });

        return updated;
    });

    // POST /api/profile/avatar  — multipart upload
    server.post("/avatar", auth, async (req: FastifyRequest, reply: FastifyReply) => {
        const data = await req.file();
        if (!data) return reply.code(400).send({ error: "No file uploaded" });

        const VALID_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!VALID_TYPES.includes(data.mimetype)) {
            data.file.resume();
            return reply.code(400).send({ error: "Invalid type. Use JPEG, PNG, WebP, or GIF." });
        }

        const ext = data.mimetype.split("/")[1].replace("jpeg", "jpg");
        const filename = `${req.user.id}-${Date.now()}.${ext}`;
        const destPath = path.join(AVATARS_DIR, filename);

        fs.mkdirSync(AVATARS_DIR, { recursive: true });
        try {
            await pipeline(data.file, fs.createWriteStream(destPath));
        } catch {
            return reply.code(500).send({ error: "Upload failed" });
        }

        const url = `/uploads/avatars/${filename}`;
        await db
            .update(users)
            .set({ image: url, updatedAt: new Date() })
            .where(eq(users.id, req.user.id));

        await db.insert(activities).values({
            type: "PROFILE_UPDATED",
            description: "Updated profile photo",
            userId: req.user.id,
        });

        return { url };
    });
}
