import { describe, it, expect, afterAll, afterEach } from "vitest";
import { getApp, closeApp, createTestUser, cleanupUsers } from "./helpers.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

afterAll(closeApp);

async function createAdmin() {
    const u = await createTestUser({ isAdmin: true });
    return u;
}

describe("GET /api/admin/users", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("returns all users when called by an admin", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        emails.push(admin.email);

        const res = await app.inject({
            method: "GET",
            url: "/api/admin/users",
            headers: { cookie: admin.cookie },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as unknown[];
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);
    });

    it("returns 403 for a regular user", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "GET",
            url: "/api/admin/users",
            headers: { cookie: user.cookie },
        });

        expect(res.statusCode).toBe(403);
    });

    it("returns 401 when unauthenticated", async () => {
        const app = await getApp();
        const res = await app.inject({ method: "GET", url: "/api/admin/users" });
        expect(res.statusCode).toBe(401);
    });

    it("response includes isBanned and isPermanentBan flags", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        emails.push(admin.email);

        const res = await app.inject({
            method: "GET",
            url: "/api/admin/users",
            headers: { cookie: admin.cookie },
        });

        const body = res.json() as Array<{ isBanned: boolean; isPermanentBan: boolean }>;
        expect(body[0]).toHaveProperty("isBanned");
        expect(body[0]).toHaveProperty("isPermanentBan");
    });
});

describe("POST /api/admin/users/:id/ban", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("bans a user for N days", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        const target = await createTestUser();
        emails.push(admin.email, target.email);

        const res = await app.inject({
            method: "POST",
            url: `/api/admin/users/${target.id}/ban`,
            headers: { cookie: admin.cookie },
            body: { days: 7, reason: "Spam" },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.bannedUntil).toBeTruthy();
        expect(body.isPermanentBan).toBe(false);

        // Verify DB updated
        const [row] = await db
            .select({ bannedUntil: users.bannedUntil, banReason: users.banReason })
            .from(users)
            .where(eq(users.id, target.id))
            .limit(1);
        expect(row?.bannedUntil).not.toBeNull();
        expect(row?.banReason).toBe("Spam");
    });

    it("bans permanently when days is not provided", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        const target = await createTestUser();
        emails.push(admin.email, target.email);

        const res = await app.inject({
            method: "POST",
            url: `/api/admin/users/${target.id}/ban`,
            headers: { cookie: admin.cookie },
            body: {},
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().isPermanentBan).toBe(true);
        expect(res.json().bannedUntil).toBeNull();
    });

    it("returns 400 when admin tries to ban themselves", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        emails.push(admin.email);

        const res = await app.inject({
            method: "POST",
            url: `/api/admin/users/${admin.id}/ban`,
            headers: { cookie: admin.cookie },
            body: { days: 1 },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/cannot ban yourself/i);
    });

    it("returns 403 for a non-admin user", async () => {
        const app = await getApp();
        const user = await createTestUser();
        const target = await createTestUser();
        emails.push(user.email, target.email);

        const res = await app.inject({
            method: "POST",
            url: `/api/admin/users/${target.id}/ban`,
            headers: { cookie: user.cookie },
            body: { days: 1 },
        });

        expect(res.statusCode).toBe(403);
    });

    it("returns 404 for unknown user ID", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        emails.push(admin.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/admin/users/00000000-0000-0000-0000-000000000000/ban",
            headers: { cookie: admin.cookie },
            body: {},
        });

        expect(res.statusCode).toBe(404);
    });

    it("banned user cannot log in", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        const target = await createTestUser();
        emails.push(admin.email, target.email);

        await app.inject({
            method: "POST",
            url: `/api/admin/users/${target.id}/ban`,
            headers: { cookie: admin.cookie },
            body: { days: 30, reason: "Policy violation" },
        });

        const loginRes = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: target.email, password: target.password },
        });

        expect(loginRes.statusCode).toBe(403);
        expect(loginRes.json().reason).toBe("Policy violation");
    });
});

describe("POST /api/admin/users/:id/unban", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("removes the ban and allows login again", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        const target = await createTestUser();
        emails.push(admin.email, target.email);

        // Ban first
        await app.inject({
            method: "POST",
            url: `/api/admin/users/${target.id}/ban`,
            headers: { cookie: admin.cookie },
            body: {},
        });

        // Unban
        const unbanRes = await app.inject({
            method: "POST",
            url: `/api/admin/users/${target.id}/unban`,
            headers: { cookie: admin.cookie },
        });

        expect(unbanRes.statusCode).toBe(200);
        expect(unbanRes.json().success).toBe(true);

        // Login should succeed
        const loginRes = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: target.email, password: target.password },
        });
        expect(loginRes.statusCode).toBe(200);
    });

    it("returns 404 for unknown user", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        emails.push(admin.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/admin/users/00000000-0000-0000-0000-000000000000/unban",
            headers: { cookie: admin.cookie },
        });

        expect(res.statusCode).toBe(404);
    });

    it("returns 403 for non-admin", async () => {
        const app = await getApp();
        const user = await createTestUser();
        const target = await createTestUser();
        emails.push(user.email, target.email);

        const res = await app.inject({
            method: "POST",
            url: `/api/admin/users/${target.id}/unban`,
            headers: { cookie: user.cookie },
        });

        expect(res.statusCode).toBe(403);
    });
});

describe("PATCH /api/admin/users/:id  (admin actions)", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("promotes a user to admin", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        const target = await createTestUser();
        emails.push(admin.email, target.email);

        const res = await app.inject({
            method: "PATCH",
            url: `/api/admin/users/${target.id}`,
            headers: { cookie: admin.cookie },
            body: { isAdmin: true },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().isAdmin).toBe(true);
    });

    it("force-verifies a user's email", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        const target = await createTestUser();
        emails.push(admin.email, target.email);

        // Set user as unverified first
        await db.update(users).set({ emailVerified: false }).where(eq(users.id, target.id));

        const res = await app.inject({
            method: "PATCH",
            url: `/api/admin/users/${target.id}`,
            headers: { cookie: admin.cookie },
            body: { emailVerified: true },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().emailVerified).toBe(true);
    });

    it("prevents admin from removing their own admin status", async () => {
        const app = await getApp();
        const admin = await createAdmin();
        emails.push(admin.email);

        const res = await app.inject({
            method: "PATCH",
            url: `/api/admin/users/${admin.id}`,
            headers: { cookie: admin.cookie },
            body: { isAdmin: false },
        });

        expect(res.statusCode).toBe(400);
    });
});
