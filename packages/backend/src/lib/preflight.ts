/**
 * preflight.ts — startup checks that run before the HTTP server binds.
 *
 * Environment variable validation is handled by env.ts (imported at
 * module load, throws on first error).  Preflight focuses on runtime
 * checks that need an active process to verify, e.g. DB connectivity.
 */

import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { env } from "./env.js";

type Check = { name: string; run: () => void | Promise<void> };

async function checkDatabase(): Promise<void> {
    try {
        await db.execute(sql`SELECT 1`);
    } catch (err) {
        throw new Error(
            `Cannot connect to the database.\n\n` +
                `  • DATABASE_URL = ${env.DATABASE_URL}\n` +
                `  • Detail: ${(err as Error).message}\n\n` +
                `Check that the database is running and DATABASE_URL is correct.`,
        );
    }
}

const CHECKS: Check[] = [{ name: "Database connectivity", run: checkDatabase }];

export async function runPreflight(): Promise<void> {
    const tag = "[preflight]";
    console.log(`${tag} Running startup checks…`);

    for (const check of CHECKS) {
        try {
            await check.run();
            console.log(`${tag} ✓ ${check.name}`);
        } catch (err) {
            console.error(`\n${tag} ✗ ${check.name} failed\n`);
            console.error((err as Error).message);
            console.error(`\n${tag} Server startup aborted.\n`);
            process.exit(1);
        }
    }

    console.log(`${tag} All checks passed.\n`);
}
