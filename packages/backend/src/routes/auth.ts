import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { env } from "../lib/env.js";
import { sendVerificationEmail } from "../lib/notifications.js";

const registerSchema = z.object({
    name: z.string().min(2).max(50),
    email: z.string().email(),
    password: z.string().min(6).max(100),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

function setTokenCookie(reply: FastifyReply, token: string) {
    reply.setCookie("token", token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });
}

function callbackBase() {
    return env.OAUTH_CALLBACK_BASE;
}

function frontendUrl() {
    return env.FRONTEND_URL;
}

export default async function authRoutes(server: FastifyInstance) {
    // ── Email / Password ───────────────────────────────────────────────────

    server.post("/register", async (req: FastifyRequest, reply: FastifyReply) => {
        const result = registerSchema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });
        const { name, email, password } = result.data;

        const [existing] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email.toLowerCase()))
            .limit(1);
        if (existing) return reply.code(409).send({ error: "Email already registered" });

        const emailEnabled = env.EMAIL_ENABLED;
        const hashed = await bcrypt.hash(password, 12);

        const [user] = await db
            .insert(users)
            .values({
                name,
                email: email.toLowerCase(),
                password: hashed,
                emailVerified: !emailEnabled, // verified immediately when email is disabled
            })
            .returning({
                id: users.id,
                name: users.name,
                email: users.email,
                image: users.image,
                emailVerified: users.emailVerified,
            });

        if (emailEnabled) {
            const verifyToken = server.jwt.sign(
                { purpose: "verify-email", uid: user.id },
                { expiresIn: "24h" },
            );
            const verifyUrl = `${callbackBase()}/api/auth/verify-email?token=${verifyToken}`;
            sendVerificationEmail(user.email, user.name, verifyUrl);
        }

        const token = server.jwt.sign({ id: user.id, email: user.email, name: user.name });
        setTokenCookie(reply, token);
        return reply.code(201).send(user);
    });

    server.post("/login", async (req: FastifyRequest, reply: FastifyReply) => {
        const result = loginSchema.safeParse(req.body);
        if (!result.success) return reply.code(400).send({ error: result.error.errors[0].message });
        const { email, password } = result.data;

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase()))
            .limit(1);
        if (!user || !user.password) {
            reply.code(401).send({ error: "Invalid email or password" });
            return;
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return reply.code(401).send({ error: "Invalid email or password" });

        // ── Ban check ──────────────────────────────────────────────────────
        if (user.bannedUntil && user.bannedUntil > new Date()) {
            const isPermanent = user.bannedUntil.getFullYear() >= 2099;
            return reply.code(403).send({
                error: isPermanent ? "Account permanently suspended" : "Account suspended",
                bannedUntil: isPermanent ? null : user.bannedUntil.toISOString(),
                permanent: isPermanent,
                reason: user.banReason ?? undefined,
            });
        }

        const token = server.jwt.sign({ id: user.id, email: user.email, name: user.name });
        setTokenCookie(reply, token);
        return reply
            .code(200)
            .send({ id: user.id, name: user.name, email: user.email, image: user.image });
    });

    server.post(
        "/logout",
        { preHandler: [server.authenticate] },
        async (_req: FastifyRequest, reply: FastifyReply) => {
            reply.clearCookie("token", { path: "/" });
            return { success: true };
        },
    );

    // ── Change password (existing password users) ──────────────────────────

    server.post(
        "/change-password",
        { preHandler: [server.authenticate] },
        async (req: FastifyRequest, reply: FastifyReply) => {
            const schema = z.object({
                currentPassword: z.string().min(1),
                newPassword: z.string().min(6).max(100),
            });
            const result = schema.safeParse(req.body);
            if (!result.success)
                return reply.code(400).send({ error: result.error.errors[0].message });

            const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
            if (!user) {
                reply.code(404).send({ error: "User not found" });
                return;
            }
            if (!user.password) {
                reply
                    .code(400)
                    .send({ error: "Account uses social login — use Set Password instead" });
                return;
            }

            const valid = await bcrypt.compare(result.data.currentPassword, user.password);
            if (!valid) return reply.code(401).send({ error: "Current password is incorrect" });

            const hashed = await bcrypt.hash(result.data.newPassword, 12);
            await db
                .update(users)
                .set({ password: hashed, updatedAt: new Date() })
                .where(eq(users.id, user.id));
            return { success: true };
        },
    );

    // ── Set password (OAuth users adding a password for the first time) ────

    server.post(
        "/set-password",
        { preHandler: [server.authenticate] },
        async (req: FastifyRequest, reply: FastifyReply) => {
            const schema = z.object({ password: z.string().min(6).max(100) });
            const result = schema.safeParse(req.body);
            if (!result.success)
                return reply.code(400).send({ error: result.error.errors[0].message });

            const [user] = await db
                .select({ pw: users.password })
                .from(users)
                .where(eq(users.id, req.user.id))
                .limit(1);
            if (user?.pw)
                return reply
                    .code(400)
                    .send({ error: "Already has a password — use Change Password instead" });

            const hashed = await bcrypt.hash(result.data.password, 12);
            await db
                .update(users)
                .set({ password: hashed, updatedAt: new Date() })
                .where(eq(users.id, req.user.id));
            return { success: true };
        },
    );

    // ── /me ───────────────────────────────────────────────────────────────

    server.get(
        "/me",
        { preHandler: [server.authenticate] },
        async (req: FastifyRequest, reply: FastifyReply) => {
            const [user] = await db
                .select({
                    id: users.id,
                    name: users.name,
                    email: users.email,
                    image: users.image,
                    currency: users.currency,
                    emailVerified: users.emailVerified,
                    isAdmin: users.isAdmin,
                })
                .from(users)
                .where(eq(users.id, req.user.id))
                .limit(1);
            if (!user) return reply.code(404).send({ error: "User not found" });
            return user;
        },
    );

    // ── Verify email ───────────────────────────────────────────────────────

    server.get<{ Querystring: { token?: string } }>("/verify-email", async (req, reply) => {
        const base = frontendUrl();
        const { token } = req.query;
        if (!token) return reply.redirect(`${base}/login?error=verify_missing_token`);

        let payload: { purpose?: string; uid?: string };
        try {
            payload = server.jwt.verify(token) as { purpose?: string; uid?: string };
        } catch {
            return reply.redirect(`${base}/login?error=verify_expired`);
        }

        if (payload.purpose !== "verify-email" || !payload.uid) {
            return reply.redirect(`${base}/login?error=verify_invalid`);
        }

        await db
            .update(users)
            .set({ emailVerified: true, updatedAt: new Date() })
            .where(eq(users.id, payload.uid));

        return reply.redirect(`${base}/dashboard?verified=true`);
    });

    // ── Resend verification ────────────────────────────────────────────────

    server.post(
        "/resend-verification",
        { preHandler: [server.authenticate] },
        async (req: FastifyRequest, reply: FastifyReply) => {
            const [user] = await db
                .select({
                    id: users.id,
                    name: users.name,
                    email: users.email,
                    emailVerified: users.emailVerified,
                })
                .from(users)
                .where(eq(users.id, req.user.id))
                .limit(1);
            if (!user) return reply.code(404).send({ error: "User not found" });
            if (user.emailVerified)
                return reply.code(400).send({ error: "Email already verified" });

            const verifyToken = server.jwt.sign(
                { purpose: "verify-email", uid: user.id },
                { expiresIn: "24h" },
            );
            const verifyUrl = `${callbackBase()}/api/auth/verify-email?token=${verifyToken}`;
            sendVerificationEmail(user.email, user.name, verifyUrl);
            return { success: true };
        },
    );

    // ── Google OAuth ───────────────────────────────────────────────────────

    server.get("/google", async (_req: FastifyRequest, reply: FastifyReply) => {
        if (!env.GOOGLE_CLIENT_ID)
            return reply.code(503).send({ error: "Google login not configured" });

        const state = server.jwt.sign({ p: "google" }, { expiresIn: "10m" });
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
        url.searchParams.set("redirect_uri", `${callbackBase()}/api/auth/google/callback`);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email profile");
        url.searchParams.set("state", state);
        url.searchParams.set("access_type", "offline");
        return reply.redirect(url.toString());
    });

    server.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
        "/google/callback",
        async (req, reply) => {
            const base = frontendUrl();
            if (req.query.error) return reply.redirect(`${base}/login?error=oauth_denied`);

            const { code, state } = req.query;
            if (!code) return reply.redirect(`${base}/login?error=oauth_failed`);

            try {
                server.jwt.verify(state ?? "");
            } catch {
                return reply.redirect(`${base}/login?error=oauth_state`);
            }

            // Exchange code → tokens
            const tokRes = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    code,
                    client_id: env.GOOGLE_CLIENT_ID ?? "",
                    client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
                    redirect_uri: `${callbackBase()}/api/auth/google/callback`,
                    grant_type: "authorization_code",
                }),
            });
            if (!tokRes.ok) return reply.redirect(`${base}/login?error=oauth_token`);

            const { id_token } = (await tokRes.json()) as { id_token?: string };
            if (!id_token) return reply.redirect(`${base}/login?error=oauth_token`);

            // Decode the id_token JWT payload (no signature verify needed — came from Google TLS)
            const raw = id_token.split(".")[1] ?? "";
            const payload = JSON.parse(Buffer.from(raw, "base64url").toString()) as {
                sub: string;
                email: string;
                name?: string;
                picture?: string;
            };
            const { sub: googleId, email, name, picture } = payload;

            const user = await findOrCreateOAuthUser({
                provider: "google",
                providerId: googleId,
                email,
                name: name ?? email.split("@")[0],
                image: picture ?? null,
            });

            const token = server.jwt.sign({ id: user.id, email: user.email, name: user.name });
            setTokenCookie(reply, token);
            return reply.redirect(`${base}/dashboard`);
        },
    );

    // ── GitHub OAuth ───────────────────────────────────────────────────────

    server.get("/github", async (_req: FastifyRequest, reply: FastifyReply) => {
        if (!env.GITHUB_CLIENT_ID)
            return reply.code(503).send({ error: "GitHub login not configured" });

        const state = server.jwt.sign({ p: "github" }, { expiresIn: "10m" });
        const url = new URL("https://github.com/login/oauth/authorize");
        url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
        url.searchParams.set("redirect_uri", `${callbackBase()}/api/auth/github/callback`);
        url.searchParams.set("scope", "read:user user:email");
        url.searchParams.set("state", state);
        return reply.redirect(url.toString());
    });

    server.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
        "/github/callback",
        async (req, reply) => {
            const base = frontendUrl();
            if (req.query.error) return reply.redirect(`${base}/login?error=oauth_denied`);

            const { code, state } = req.query;
            if (!code) return reply.redirect(`${base}/login?error=oauth_failed`);

            try {
                server.jwt.verify(state ?? "");
            } catch {
                return reply.redirect(`${base}/login?error=oauth_state`);
            }

            // Exchange code → access_token
            const tokRes = await fetch("https://github.com/login/oauth/access_token", {
                method: "POST",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: env.GITHUB_CLIENT_ID ?? "",
                    client_secret: env.GITHUB_CLIENT_SECRET ?? "",
                    code,
                    redirect_uri: `${callbackBase()}/api/auth/github/callback`,
                }),
            });
            if (!tokRes.ok) return reply.redirect(`${base}/login?error=oauth_token`);

            const { access_token } = (await tokRes.json()) as { access_token?: string };
            if (!access_token) return reply.redirect(`${base}/login?error=oauth_token`);

            const ghHeaders = {
                Authorization: `Bearer ${access_token}`,
                "User-Agent": "SplitEase/1.0",
                Accept: "application/vnd.github+json",
            };

            // Fetch profile + emails in parallel
            const [profileRes, emailsRes] = await Promise.all([
                fetch("https://api.github.com/user", { headers: ghHeaders }),
                fetch("https://api.github.com/user/emails", { headers: ghHeaders }),
            ]);

            const profile = (await profileRes.json()) as {
                id: number;
                name?: string;
                login: string;
                avatar_url?: string;
            };
            const emailList = (await emailsRes.json()) as Array<{
                email: string;
                primary: boolean;
                verified: boolean;
            }>;

            const email = (emailList.find((e) => e.primary && e.verified) ?? emailList[0])?.email;
            if (!email) return reply.redirect(`${base}/login?error=oauth_no_email`);

            const user = await findOrCreateOAuthUser({
                provider: "github",
                providerId: String(profile.id),
                email,
                name: profile.name ?? profile.login,
                image: profile.avatar_url ?? null,
            });

            const token = server.jwt.sign({ id: user.id, email: user.email, name: user.name });
            setTokenCookie(reply, token);
            return reply.redirect(`${base}/dashboard`);
        },
    );
}

// ── Shared helper ──────────────────────────────────────────────────────────

async function findOrCreateOAuthUser(opts: {
    provider: string;
    providerId: string;
    email: string;
    name: string;
    image: string | null;
}) {
    const { provider, providerId, email, name, image } = opts;

    // 1. Check for existing OAuth link
    const [byOAuth] = await db.select().from(users).where(eq(users.oauthId, providerId)).limit(1);
    if (byOAuth) return byOAuth;

    // 2. Check for existing email account → link the provider
    const [byEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
    if (byEmail) {
        if (!byEmail.oauthProvider) {
            await db
                .update(users)
                .set({ oauthProvider: provider, oauthId: providerId, updatedAt: new Date() })
                .where(eq(users.id, byEmail.id));
        }
        return byEmail;
    }

    // 3. Create new user (email is verified by the OAuth provider)
    const [newUser] = await db
        .insert(users)
        .values({
            name,
            email: email.toLowerCase(),
            password: null,
            emailVerified: true,
            oauthProvider: provider,
            oauthId: providerId,
            image,
        })
        .returning();
    return newUser;
}
