// env.ts is imported AFTER dotenv so process.env is fully populated.
import "dotenv/config";
import { env } from "./lib/env.js";

import fs from "fs";
import path from "path";
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";

import { runPreflight } from "./lib/preflight.js";
import { db } from "./db/index.js";
import { accessLogs, users } from "./db/schema.js";
import { eq } from "drizzle-orm";

import authRoutes from "./routes/auth.js";
import groupRoutes from "./routes/groups.js";
import expenseRoutes from "./routes/expenses.js";
import balanceRoutes from "./routes/balances.js";
import settlementRoutes from "./routes/settlements.js";
import friendRoutes from "./routes/friends.js";
import activityRoutes from "./routes/activity.js";
import userRoutes from "./routes/users.js";
import profileRoutes from "./routes/profile.js";
import accessLogRoutes from "./routes/access-logs.js";
import categoryRoutes from "./routes/categories.js";
import adminRoutes from "./routes/admin.js";

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
    interface FastifyRequest {
        _startTime?: number;
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: { id: string; email: string; name: string };
        user: { id: string; email: string; name: string };
    }
}

// ── App factory (exported for tests) ──────────────────────────────────────

export async function buildApp(opts?: { enableStaticFiles?: boolean }) {
    const enableStatic = opts?.enableStaticFiles ?? true;
    const isTest = env.NODE_ENV === "test";

    const server: FastifyInstance = Fastify({
        logger: isTest
            ? false
            : {
                  level: env.NODE_ENV === "production" ? "warn" : "info",
                  transport:
                      env.NODE_ENV !== "production"
                          ? {
                                target: "pino-pretty",
                                options: {
                                    colorize: true,
                                    singleLine: true,
                                    ignore: "pid,hostname",
                                    translateTime: "HH:MM:ss.l",
                                },
                            }
                          : undefined,
                  serializers: {
                      req: (req) => ({ method: req.method, url: req.url }),
                      res: (res) => ({ statusCode: res.statusCode }),
                  },
              },
    });

    // ── Upload directory + static files ─────────────────────────────────
    if (enableStatic) {
        const uploadsDir = env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
        fs.mkdirSync(path.join(uploadsDir, "avatars"), { recursive: true });
        server.register(fastifyMultipart, { limits: { fileSize: 2 * 1024 * 1024 } });
        server.register(fastifyStatic, {
            root: uploadsDir,
            prefix: "/uploads/",
            decorateReply: false,
        });
    }

    // ── Plugins ──────────────────────────────────────────────────────────
    server.register(fastifyCors, { origin: env.FRONTEND_URL, credentials: true });
    server.register(fastifyJwt, { secret: env.JWT_SECRET });
    server.register(fastifyCookie);

    // ── Auth decorator ───────────────────────────────────────────────────
    server.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
        const token = request.cookies["token"];
        if (!token) {
            reply.code(401).send({ error: "Unauthorized" });
            return;
        }
        try {
            request.user = server.jwt.verify<{
                id: string;
                email: string;
                name: string;
            }>(token);
        } catch {
            reply.code(401).send({ error: "Unauthorized" });
            return;
        }
    });

    // ── Admin decorator ──────────────────────────────────────────────────
    server.decorate("requireAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
        const token = request.cookies["token"];
        if (!token) {
            reply.code(401).send({ error: "Unauthorized" });
            return;
        }
        try {
            request.user = server.jwt.verify<{
                id: string;
                email: string;
                name: string;
            }>(token);
        } catch {
            reply.code(401).send({ error: "Unauthorized" });
            return;
        }
        const [row] = await db
            .select({ isAdmin: users.isAdmin })
            .from(users)
            .where(eq(users.id, request.user.id))
            .limit(1);
        if (!row?.isAdmin) {
            reply.code(403).send({ error: "Admin access required" });
            return;
        }
    });

    // ── Access log hooks (disabled in test) ──────────────────────────────
    if (!isTest) {
        server.addHook("onRequest", async (request) => {
            request._startTime = Date.now();
        });

        server.addHook("onSend", async (request, reply, payload) => {
            const duration = Date.now() - (request._startTime ?? Date.now());
            let userId: string | null = null;
            try {
                const tok = request.cookies?.["token"];
                if (tok) userId = server.jwt.verify<{ id: string }>(tok).id;
            } catch {
                /* unauthenticated request */
            }
            const reqPath = request.url.split("?")[0];
            if (reqPath !== "/api/health" && !reqPath.startsWith("/uploads/")) {
                setImmediate(() => {
                    db.insert(accessLogs)
                        .values({
                            method: request.method,
                            path: reqPath,
                            statusCode: reply.statusCode,
                            duration,
                            userId,
                            ip: request.ip,
                            userAgent: request.headers["user-agent"] ?? null,
                        })
                        .catch(() => {});
                });
            }
            return payload;
        });
    }

    // ── Routes ───────────────────────────────────────────────────────────
    server.register(authRoutes, { prefix: "/api/auth" });
    server.register(groupRoutes, { prefix: "/api/groups" });
    server.register(expenseRoutes, { prefix: "/api/expenses" });
    server.register(balanceRoutes, { prefix: "/api/balances" });
    server.register(settlementRoutes, { prefix: "/api/settlements" });
    server.register(friendRoutes, { prefix: "/api/friends" });
    server.register(activityRoutes, { prefix: "/api/activity" });
    server.register(userRoutes, { prefix: "/api/users" });
    server.register(profileRoutes, { prefix: "/api/profile" });
    server.register(accessLogRoutes, { prefix: "/api/access-logs" });
    server.register(categoryRoutes, { prefix: "/api/categories" });
    server.register(adminRoutes, { prefix: "/api/admin" });
    server.get("/api/health", async () => ({ status: "ok" }));

    return server;
}

// ── Entry point (skipped when imported in tests) ───────────────────────────

if (env.NODE_ENV !== "test") {
    const start = async () => {
        const app = await buildApp();
        await runPreflight();
        try {
            await app.listen({ port: env.PORT, host: "0.0.0.0" });
        } catch (err) {
            app.log.error(err);
            process.exit(1);
        }
    };
    start();
}
