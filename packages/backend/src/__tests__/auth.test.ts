import { describe, it, expect, afterAll, afterEach } from "vitest";
import {
    getApp,
    closeApp,
    extractCookie,
    uniqueEmail,
    createTestUser,
    cleanupUsers,
    banUser,
    setExpiredBan,
} from "./helpers.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

afterAll(closeApp);

describe("POST /api/auth/register", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("registers a new user and returns 201 with user data", async () => {
        const app = await getApp();
        const email = uniqueEmail("register");
        emails.push(email);

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            body: { name: "Alice Test", email, password: "Secure1!" },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.email).toBe(email);
        expect(body.id).toBeTruthy();
        expect(body.password).toBeUndefined(); // password must not be returned
        expect(res.headers["set-cookie"]).toBeTruthy(); // JWT cookie issued
    });

    it("returns 409 for a duplicate email", async () => {
        const app = await getApp();
        const email = uniqueEmail("dup");
        emails.push(email);

        await app.inject({
            method: "POST",
            url: "/api/auth/register",
            body: { name: "First", email, password: "Secure1!" },
        });

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            body: { name: "Second", email, password: "Secure1!" },
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().error).toMatch(/already registered/i);
    });

    it("returns 400 when name is too short", async () => {
        const app = await getApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            body: { name: "A", email: uniqueEmail(), password: "Secure1!" },
        });
        expect(res.statusCode).toBe(400);
    });

    it("returns 400 for an invalid email address", async () => {
        const app = await getApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            body: { name: "Valid Name", email: "not-an-email", password: "Secure1!" },
        });
        expect(res.statusCode).toBe(400);
    });

    it("returns 400 when password is shorter than 6 characters", async () => {
        const app = await getApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            body: { name: "Valid Name", email: uniqueEmail(), password: "abc" },
        });
        expect(res.statusCode).toBe(400);
    });

    it("new user gets INR as default currency", async () => {
        const app = await getApp();
        const email = uniqueEmail("currency");
        emails.push(email);

        await app.inject({
            method: "POST",
            url: "/api/auth/register",
            body: { name: "INR User", email, password: "Secure1!" },
        });

        const [row] = await db
            .select({ currency: users.currency })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
        expect(row?.currency).toBe("INR");
    });
});

describe("POST /api/auth/login", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("logs in with correct credentials and issues a cookie", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: user.email, password: user.password },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().email).toBe(user.email);
        expect(res.headers["set-cookie"]).toBeTruthy();
    });

    it("returns 401 for wrong password", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: user.email, password: "WrongPassword!" },
        });

        expect(res.statusCode).toBe(401);
        expect(res.json().error).toMatch(/invalid/i);
    });

    it("returns 401 for non-existent email", async () => {
        const app = await getApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: "ghost@test.invalid", password: "anypass" },
        });
        expect(res.statusCode).toBe(401);
    });

    it("returns 403 with ban info when user is banned", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        await banUser(user.id, 7); // 7-day ban

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: user.email, password: user.password },
        });

        expect(res.statusCode).toBe(403);
        const body = res.json();
        expect(body.error).toMatch(/suspended/i);
        expect(body.bannedUntil).toBeTruthy();
        expect(body.permanent).toBe(false);
    });

    it("returns 403 with permanent flag for permanently banned user", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        await banUser(user.id); // permanent

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: user.email, password: user.password },
        });

        expect(res.statusCode).toBe(403);
        const body = res.json();
        expect(body.permanent).toBe(true);
        expect(body.bannedUntil).toBeNull();
    });

    it("allows login after ban has expired", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        await setExpiredBan(user.id);

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: user.email, password: user.password },
        });

        expect(res.statusCode).toBe(200);
    });
});

describe("GET /api/auth/me", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("returns the current user with emailVerified and isAdmin fields", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "GET",
            url: "/api/auth/me",
            headers: { cookie: user.cookie },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.id).toBe(user.id);
        expect(typeof body.emailVerified).toBe("boolean");
        expect(typeof body.isAdmin).toBe("boolean");
        expect(body.password).toBeUndefined();
    });

    it("returns 401 when not authenticated", async () => {
        const app = await getApp();
        const res = await app.inject({ method: "GET", url: "/api/auth/me" });
        expect(res.statusCode).toBe(401);
    });
});

describe("POST /api/auth/change-password", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("changes password with correct current password", async () => {
        const app = await getApp();
        const user = await createTestUser({ password: "OldPass1!" });
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/change-password",
            headers: { cookie: user.cookie },
            body: { currentPassword: "OldPass1!", newPassword: "NewPass1!" },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().success).toBe(true);

        // Verify new password works
        const loginRes = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            body: { email: user.email, password: "NewPass1!" },
        });
        expect(loginRes.statusCode).toBe(200);
    });

    it("returns 401 with wrong current password", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/change-password",
            headers: { cookie: user.cookie },
            body: { currentPassword: "WrongPassword!", newPassword: "NewPass1!" },
        });

        expect(res.statusCode).toBe(401);
        expect(res.json().error).toMatch(/incorrect/i);
    });

    it("returns 401 when unauthenticated", async () => {
        const app = await getApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/change-password",
            body: { currentPassword: "any", newPassword: "any123" },
        });
        expect(res.statusCode).toBe(401);
    });
});

describe("POST /api/auth/resend-verification", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("returns 400 when email is already verified", async () => {
        const app = await getApp();
        const user = await createTestUser(); // createTestUser sets emailVerified = true
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/resend-verification",
            headers: { cookie: user.cookie },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/already verified/i);
    });

    it("returns 401 when unauthenticated", async () => {
        const app = await getApp();
        const res = await app.inject({ method: "POST", url: "/api/auth/resend-verification" });
        expect(res.statusCode).toBe(401);
    });
});

describe("GET /api/auth/verify-email", () => {
    it("redirects to login with error when token is missing", async () => {
        const app = await getApp();
        const res = await app.inject({ method: "GET", url: "/api/auth/verify-email" });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain("verify_missing_token");
    });

    it("redirects to login with error for an invalid/expired token", async () => {
        const app = await getApp();
        const res = await app.inject({
            method: "GET",
            url: "/api/auth/verify-email?token=this.is.not.valid",
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain("verify_expired");
    });
});
