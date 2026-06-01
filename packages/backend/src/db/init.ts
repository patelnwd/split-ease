import "dotenv/config";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { db, client } from "./index.js";
import { users } from "./schema.js";
import { seed } from "./seed.js";

// ── Paths ──────────────────────────────────────────────────────────────────
const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// ── Colors ─────────────────────────────────────────────────────────────────
const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
};

// ── Pretty logging ─────────────────────────────────────────────────────────
const STEPS = 4;
const log = {
    step: (n: number, msg: string) =>
        console.log(`\n${c.bold}${c.cyan}[${n}/${STEPS}]${c.reset} ${c.bold}${msg}${c.reset}`),
    ok: (msg: string) => console.log(`        ${c.green}✓${c.reset}  ${msg}`),
    info: (msg: string) => console.log(`        ${c.blue}ℹ${c.reset}  ${c.dim}${msg}${c.reset}`),
    warn: (msg: string) =>
        console.warn(`        ${c.yellow}⚠${c.reset}  ${c.yellow}${msg}${c.reset}`),
    error: (msg: string) => console.error(`        ${c.red}✗${c.reset}  ${c.red}${msg}${c.reset}`),
};

function abort(reason: string, detail?: string): never {
    log.error(reason);
    if (detail) {
        detail.split("\n").forEach((line) => console.error(`            ${line}`));
    }
    console.error("\n[init] Aborted.\n");
    process.exit(1);
}

/** Try to close pool; never throw — used right before exit. */
async function closeDb() {
    try {
        await client.end({ timeout: 3 });
    } catch {
        /* ignore */
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function isNetworkError(msg: string) {
    return ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH"].some((e) => msg.includes(e));
}

function isDbMissing(msg: string) {
    return (msg.includes("database") && msg.includes("does not exist")) || msg.includes("3D000");
}

function parseDbUrl(rawUrl: string) {
    const parsed = new URL(rawUrl);
    const targetDb = parsed.pathname.slice(1); // strip leading /
    parsed.pathname = "/postgres";
    return { targetDb, adminUrl: parsed.toString() };
}

// ── Step 1 — Env vars ──────────────────────────────────────────────────────
function checkEnv() {
    log.step(1, "Checking environment variables");

    const REQUIRED: Array<[string, string]> = [
        ["DATABASE_URL", "Get a free DB at https://neon.tech"],
        ["JWT_SECRET", "Generate: openssl rand -base64 32"],
    ];
    const PLACEHOLDERS = ["change-this", "your-secret", "user:password@host"];

    const issues: string[] = [];
    for (const [key, hint] of REQUIRED) {
        const val = process.env[key]?.trim() ?? "";
        if (!val) {
            issues.push(`${key} is not set  ->  ${hint}`);
        } else if (PLACEHOLDERS.some((p) => val.includes(p))) {
            issues.push(`${key} still has a placeholder value  ->  ${hint}`);
        }
    }

    if (issues.length) {
        issues.forEach((i) => log.error(i));
        abort("Fix the above in packages/backend/.env and re-run.");
    }

    log.ok("All required env vars present");
}

// ── Step 2 — Ensure database exists ───────────────────────────────────────
async function ensureDatabase() {
    log.step(2, "Checking database");

    const dbUrl = process.env.DATABASE_URL!;

    // Probe the target database directly
    try {
        const probe = postgres(dbUrl, { max: 1, connect_timeout: 10, onnotice: () => {} });
        await probe`SELECT 1`;
        await probe.end();
        log.ok("Database exists and is reachable");
        return;
    } catch (err) {
        const msg = (err as Error).message ?? "";

        if (isNetworkError(msg)) {
            abort(
                "Cannot reach the database server.",
                `Detail: ${msg}\n\nCheck that the server is running and DATABASE_URL is correct.`,
            );
        }

        if (!isDbMissing(msg)) {
            abort(`Unexpected connection error: ${msg}`);
        }
    }

    // Database does not exist — try to create it
    const { targetDb, adminUrl } = parseDbUrl(dbUrl);
    log.info(`Database "${targetDb}" does not exist — creating...`);

    try {
        const admin = postgres(adminUrl, { max: 1, connect_timeout: 10, onnotice: () => {} });
        await admin.unsafe(`CREATE DATABASE "${targetDb}"`);
        await admin.end();
        log.ok(`Database "${targetDb}" created`);
    } catch (err) {
        const msg = (err as Error).message ?? "";
        abort(
            `Could not create database "${targetDb}".`,
            `Detail: ${msg}\n\n` +
                `Cloud providers (Neon, Supabase, RDS): create the database from the dashboard.\n` +
                `Local PostgreSQL: grant create permission:  ALTER USER <user> CREATEDB;`,
        );
    }
}

// ── Step 3 — Schema ────────────────────────────────────────────────────────
function pushSchema() {
    log.step(3, "Applying schema (drizzle-kit push)");

    const result = spawnSync("node_modules/.bin/drizzle-kit", ["push", "--force"], {
        cwd: backendRoot,
        env: { ...process.env },
        stdio: ["inherit", "pipe", "pipe"],
    });

    if (result.error) {
        abort("drizzle-kit not found.", result.error.message);
    }

    const combined = (result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "");

    if (result.status !== 0) {
        // PG error 42710 = "already exists" — harmless when schema was pushed before
        if (!combined.includes("42710")) {
            abort(`Schema push failed (exit ${result.status}).`, combined.trim());
        }
    }

    log.ok("Schema applied");
}

// ── Step 4 — Seed ──────────────────────────────────────────────────────────
async function seedIfEmpty() {
    log.step(4, "Seeding database");

    // Count BEFORE seed
    const before = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const countBefore = before[0]?.count ?? 0;

    if (countBefore > 0) {
        log.ok(`Found ${countBefore} existing user(s) — skipping seed`);
        return;
    }

    log.info("No users found — inserting demo data...");

    try {
        await seed();
    } catch (err) {
        abort("Seed failed.", (err as Error).message);
    }

    // Verify AFTER seed
    const after = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const countAfter = after[0]?.count ?? 0;

    if (countAfter === 0) {
        abort(
            "Seed ran without error but no users were created.",
            "Check that DATABASE_URL points to the correct database and the schema was applied.",
        );
    }

    log.ok(`${countAfter} demo users created`);
    console.log("            alice@example.com  /  password123");
    console.log("            bob@example.com    /  password123");
    console.log("            carol@example.com  /  password123");
}

// ── Main ───────────────────────────────────────────────────────────────────
async function init() {
    console.log("\n[init] SplitEase — database init\n");

    checkEnv();
    await ensureDatabase();
    pushSchema();
    await seedIfEmpty();

    await closeDb();

    console.log("\n[init] Done. Run `pnpm dev` to start.\n");
    process.exit(0);
}

init().catch(async (err) => {
    console.error("\n[init] Unexpected error:", (err as Error).message ?? err);
    await closeDb();
    process.exit(1);
});
