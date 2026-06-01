import { describe, it, expect, afterAll, afterEach } from "vitest";
import {
    getApp,
    closeApp,
    createTestUser,
    cleanupUsers,
    cleanupCustomCategories,
} from "./helpers.js";

afterAll(closeApp);

describe("POST /api/categories", () => {
    const emails: string[] = [];
    const catIds: string[] = [];
    afterEach(async () => {
        await cleanupCustomCategories(...catIds.splice(0));
        await cleanupUsers(...emails.splice(0));
    });

    it("creates a custom category with valid data", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user.cookie },
            body: { name: "Coffee", icon: "☕", color: "#a16207" },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.name).toBe("Coffee");
        expect(body.icon).toBe("☕");
        expect(body.color).toBe("#a16207");
        expect(body.userId).toBe(user.id);
        catIds.push(body.id);
    });

    it("uses default icon and color when not provided", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user.cookie },
            body: { name: "Misc" },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.icon).toBeTruthy();
        expect(body.color).toMatch(/^#[0-9a-f]{6}$/i);
        catIds.push(body.id);
    });

    it("returns 400 when name is empty", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user.cookie },
            body: { name: "", icon: "📌" },
        });

        expect(res.statusCode).toBe(400);
    });

    it("returns 400 for an invalid hex color", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user.cookie },
            body: { name: "Test", icon: "📌", color: "not-a-color" },
        });

        expect(res.statusCode).toBe(400);
    });

    it("returns 401 when unauthenticated", async () => {
        const app = await getApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/categories",
            body: { name: "Test" },
        });
        expect(res.statusCode).toBe(401);
    });
});

describe("GET /api/categories", () => {
    const emails: string[] = [];
    const catIds: string[] = [];
    afterEach(async () => {
        await cleanupCustomCategories(...catIds.splice(0));
        await cleanupUsers(...emails.splice(0));
    });

    it("returns only the authenticated user's categories", async () => {
        const app = await getApp();
        const user1 = await createTestUser();
        const user2 = await createTestUser();
        emails.push(user1.email, user2.email);

        // Create category for user1
        const c1 = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user1.cookie },
            body: { name: "User1 Cat" },
        });
        catIds.push(c1.json().id);

        // Create category for user2
        const c2 = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user2.cookie },
            body: { name: "User2 Cat" },
        });
        catIds.push(c2.json().id);

        // user1 should only see their own
        const res = await app.inject({
            method: "GET",
            url: "/api/categories",
            headers: { cookie: user1.cookie },
        });

        expect(res.statusCode).toBe(200);
        const names = (res.json() as Array<{ name: string }>).map((c) => c.name);
        expect(names).toContain("User1 Cat");
        expect(names).not.toContain("User2 Cat");
    });

    it("returns an empty array when user has no categories", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "GET",
            url: "/api/categories",
            headers: { cookie: user.cookie },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual([]);
    });
});

describe("PATCH /api/categories/:id", () => {
    const emails: string[] = [];
    const catIds: string[] = [];
    afterEach(async () => {
        await cleanupCustomCategories(...catIds.splice(0));
        await cleanupUsers(...emails.splice(0));
    });

    it("updates an owned category", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const create = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user.cookie },
            body: { name: "Old Name", icon: "📌" },
        });
        const id = create.json().id;
        catIds.push(id);

        const res = await app.inject({
            method: "PATCH",
            url: `/api/categories/${id}`,
            headers: { cookie: user.cookie },
            body: { name: "New Name", icon: "🎯" },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().name).toBe("New Name");
        expect(res.json().icon).toBe("🎯");
    });

    it("returns 404 when trying to update another user's category", async () => {
        const app = await getApp();
        const owner = await createTestUser();
        const other = await createTestUser();
        emails.push(owner.email, other.email);

        const create = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: owner.cookie },
            body: { name: "Owner's Cat" },
        });
        const id = create.json().id;
        catIds.push(id);

        const res = await app.inject({
            method: "PATCH",
            url: `/api/categories/${id}`,
            headers: { cookie: other.cookie },
            body: { name: "Stolen Name" },
        });

        expect(res.statusCode).toBe(404);
    });

    it("returns 400 for invalid color", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const create = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user.cookie },
            body: { name: "Cat" },
        });
        const id = create.json().id;
        catIds.push(id);

        const res = await app.inject({
            method: "PATCH",
            url: `/api/categories/${id}`,
            headers: { cookie: user.cookie },
            body: { color: "bad" },
        });

        expect(res.statusCode).toBe(400);
    });
});

describe("DELETE /api/categories/:id", () => {
    const emails: string[] = [];
    afterEach(async () => {
        await cleanupUsers(...emails.splice(0));
    });

    it("deletes an owned category", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const create = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: user.cookie },
            body: { name: "To Delete" },
        });
        const id = create.json().id;

        const res = await app.inject({
            method: "DELETE",
            url: `/api/categories/${id}`,
            headers: { cookie: user.cookie },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().success).toBe(true);

        // Verify it's gone
        const listRes = await app.inject({
            method: "GET",
            url: "/api/categories",
            headers: { cookie: user.cookie },
        });
        const ids = (listRes.json() as Array<{ id: string }>).map((c) => c.id);
        expect(ids).not.toContain(id);
    });

    it("returns 404 for a non-existent category", async () => {
        const app = await getApp();
        const user = await createTestUser();
        emails.push(user.email);

        const res = await app.inject({
            method: "DELETE",
            url: "/api/categories/00000000-0000-0000-0000-000000000000",
            headers: { cookie: user.cookie },
        });

        expect(res.statusCode).toBe(404);
    });

    it("returns 404 when trying to delete another user's category", async () => {
        const app = await getApp();
        const owner = await createTestUser();
        const other = await createTestUser();
        emails.push(owner.email, other.email);

        const create = await app.inject({
            method: "POST",
            url: "/api/categories",
            headers: { cookie: owner.cookie },
            body: { name: "Owner's" },
        });
        const id = create.json().id;

        const res = await app.inject({
            method: "DELETE",
            url: `/api/categories/${id}`,
            headers: { cookie: other.cookie },
        });

        expect(res.statusCode).toBe(404);

        // Clean up
        await app.inject({
            method: "DELETE",
            url: `/api/categories/${id}`,
            headers: { cookie: owner.cookie },
        });
    });

    it("returns 401 when unauthenticated", async () => {
        const app = await getApp();
        const res = await app.inject({
            method: "DELETE",
            url: "/api/categories/00000000-0000-0000-0000-000000000000",
        });
        expect(res.statusCode).toBe(401);
    });
});
