import "dotenv/config";
import type { FastifyInstance } from "fastify";
import type { LightMyRequestResponse } from "fastify";
import { buildApp } from "../server.js";
import { db } from "../db/index.js";
import { users, customCategories } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";

// ── App singleton ──────────────────────────────────────────────────────────
let _app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
    if (!_app) {
        _app = await buildApp({ enableStaticFiles: false });
        await _app.ready();
    }
    return _app;
}

export async function closeApp() {
    if (_app) {
        await _app.close();
        _app = null;
    }
}

// ── Cookie helpers ─────────────────────────────────────────────────────────
export function extractCookie(res: LightMyRequestResponse): string {
    const raw = res.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return cookies.map((c) => c.split(";")[0]).join("; ");
}

// ── Test user factory ──────────────────────────────────────────────────────
let counter = 0;

export function uniqueEmail(prefix = "test"): string {
    return `${prefix}_${Date.now()}_${++counter}@test.invalid`;
}

export type TestUser = {
    id: string;
    name: string;
    email: string;
    password: string;
    cookie: string;
};

export async function createTestUser(opts?: {
    name?: string;
    email?: string;
    password?: string;
    isAdmin?: boolean;
}): Promise<TestUser> {
    const email = opts?.email ?? uniqueEmail();
    const password = opts?.password ?? "Password1!";
    const name = opts?.name ?? "Test User";
    const hashed = await bcrypt.hash(password, 4); // low rounds for speed

    const [user] = await db
        .insert(users)
        .values({
            name,
            email,
            password: hashed,
            emailVerified: true,
            isAdmin: opts?.isAdmin ?? false,
        })
        .returning({ id: users.id });

    const app = await getApp();
    const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        body: { email, password },
    });

    return { id: user.id, name, email, password, cookie: extractCookie(res) };
}

export async function cleanupUsers(...emails: string[]) {
    if (emails.length === 0) return;
    await db.delete(users).where(inArray(users.email, emails));
}

export async function cleanupCustomCategories(...ids: string[]) {
    if (ids.length === 0) return;
    await db.delete(customCategories).where(inArray(customCategories.id, ids));
}

export async function banUser(userId: string, days?: number) {
    const bannedUntil = days
        ? new Date(Date.now() + days * 86_400_000)
        : new Date("2099-12-31T23:59:59Z");
    await db.update(users).set({ bannedUntil }).where(eq(users.id, userId));
}

export async function setExpiredBan(userId: string) {
    await db
        .update(users)
        .set({ bannedUntil: new Date(Date.now() - 1000) })
        .where(eq(users.id, userId));
}
