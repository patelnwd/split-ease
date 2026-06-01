/**
 * env.ts — single source of truth for all environment variables.
 *
 * Every value is parsed + validated by Zod at module-load time.
 * Any missing or invalid variable throws immediately with a clear
 * list of what needs to be fixed, so the server never silently
 * starts with a broken config.
 *
 * Usage:
 *   import { env } from "./lib/env.js";
 *   env.DATABASE_URL  // fully typed, guaranteed valid
 */

import "dotenv/config";
import { z } from "zod";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Coerce "true"/"false" strings to booleans; default false. */
const boolFlag = z
    .string()
    .transform((s) => s === "true")
    .default("false");

// ── Schema ─────────────────────────────────────────────────────────────────

const schema = z
    .object({
        // ── Core ──────────────────────────────────────────────────────────
        DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
        JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
        FRONTEND_URL: z.string().url().default("http://localhost:5173"),
        PORT: z.coerce.number().int().min(1).max(65535).default(3001),
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        UPLOADS_DIR: z.string().optional(),

        // ── OAuth ─────────────────────────────────────────────────────────
        /** Base URL prepended to OAuth callback paths (must match browser origin in dev). */
        OAUTH_CALLBACK_BASE: z.string().url().default("http://localhost:5173"),
        GOOGLE_CLIENT_ID: z.string().optional(),
        GOOGLE_CLIENT_SECRET: z.string().optional(),
        GITHUB_CLIENT_ID: z.string().optional(),
        GITHUB_CLIENT_SECRET: z.string().optional(),

        // ── Email ─────────────────────────────────────────────────────────
        EMAIL_ENABLED: boolFlag,
        /**
         * Which email provider to use.
         * smtp     — nodemailer (SMTP/IMAP, default)
         * sendgrid — Twilio SendGrid HTTP API
         * ses      — Amazon Simple Email Service v2
         */
        EMAIL_PROVIDER: z.enum(["smtp", "sendgrid", "ses"]).default("smtp"),
        /** From address for all outbound emails. */
        EMAIL_FROM: z.string().default("noreply@splitease.app"),

        // SMTP provider config
        SMTP_HOST: z.string().default("smtp.gmail.com"),
        SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
        SMTP_SECURE: boolFlag,
        SMTP_USER: z.string().optional(),
        SMTP_PASS: z.string().optional(),

        // SendGrid provider config
        SENDGRID_API_KEY: z.string().optional(),

        // AWS SES provider config
        AWS_REGION: z.string().optional(),
        AWS_ACCESS_KEY_ID: z.string().optional(),
        AWS_SECRET_ACCESS_KEY: z.string().optional(),

        // ── SMS ───────────────────────────────────────────────────────────
        SMS_ENABLED: boolFlag,
        /**
         * Which SMS provider to use.
         * twilio — Twilio Programmable Messaging (default)
         * msg91  — MSG91 transactional SMS (popular in India)
         */
        SMS_PROVIDER: z.enum(["twilio", "msg91"]).default("twilio"),

        // Twilio provider config
        TWILIO_ACCOUNT_SID: z.string().optional(),
        TWILIO_AUTH_TOKEN: z.string().optional(),
        /** Twilio sender number in E.164 format, e.g. +14155552671 */
        TWILIO_FROM: z.string().optional(),

        // MSG91 provider config
        /** MSG91 authentication key (from the MSG91 dashboard). */
        MSG91_AUTH_KEY: z.string().optional(),
        /** 6-character DLT-registered sender ID; defaults to SPLTEZ. */
        MSG91_SENDER_ID: z.string().max(6).default("SPLTEZ"),
        /** India DLT template entity ID — required by TRAI for transactional SMS. */
        MSG91_DLT_TE_ID: z.string().optional(),
    })

    // ── Cross-field validations ──────────────────────────────────────────
    .superRefine((d, ctx) => {
        // Check JWT_SECRET is not a placeholder
        if (
            d.JWT_SECRET.toLowerCase().includes("change-this") ||
            d.JWT_SECRET.toLowerCase().includes("your-secret")
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["JWT_SECRET"],
                message:
                    "Replace placeholder with a real secret (generate: openssl rand -base64 32)",
            });
        }

        /** Shorthand: add a "required when X" issue for a missing field. */
        const need = (key: string, when: string) => {
            if (!d[key as keyof typeof d]) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [key],
                    message: `Required when ${when}`,
                });
            }
        };

        // Email provider requirements
        if (d.EMAIL_ENABLED) {
            if (d.EMAIL_PROVIDER === "smtp") {
                need("SMTP_USER", "EMAIL_PROVIDER=smtp");
                need("SMTP_PASS", "EMAIL_PROVIDER=smtp");
            }
            if (d.EMAIL_PROVIDER === "sendgrid") {
                need("SENDGRID_API_KEY", "EMAIL_PROVIDER=sendgrid");
            }
            if (d.EMAIL_PROVIDER === "ses") {
                need("AWS_REGION", "EMAIL_PROVIDER=ses");
                // Credentials are optional when running on AWS with an IAM role
                // but we warn if neither IAM env creds nor explicit keys are set.
                if (!d.AWS_ACCESS_KEY_ID && !d.AWS_SECRET_ACCESS_KEY) {
                    // Only warn, not error — IAM instance roles are valid
                    console.warn(
                        "[env] AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set — " +
                            "ensure the process has an IAM role with SES permissions.",
                    );
                }
            }
        }

        // SMS provider requirements
        if (d.SMS_ENABLED) {
            if (d.SMS_PROVIDER === "twilio") {
                need("TWILIO_ACCOUNT_SID", "SMS_PROVIDER=twilio");
                need("TWILIO_AUTH_TOKEN", "SMS_PROVIDER=twilio");
                need("TWILIO_FROM", "SMS_PROVIDER=twilio");
            }
            if (d.SMS_PROVIDER === "msg91") {
                need("MSG91_AUTH_KEY", "SMS_PROVIDER=msg91");
            }
        }
    });

// ── Parse + export ─────────────────────────────────────────────────────────

const result = schema.safeParse(process.env);

if (!result.success) {
    const issues = result.error.issues
        .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
        .join("\n");
    // Throw synchronously so the import itself fails — no silent startup.
    throw new Error(
        `\n[env] Configuration errors — fix the following in packages/backend/.env:\n\n${issues}\n`,
    );
}

/** Fully-typed, validated environment config. Use this instead of process.env. */
export const env = result.data;

/** Inferred type of the validated config object. */
export type Env = typeof env;
