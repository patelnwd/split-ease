/**
 * notifications.ts — multi-provider email and SMS dispatch.
 *
 * Email providers  : smtp (nodemailer) | sendgrid | ses
 * SMS providers    : twilio | msg91
 *
 * Which provider to use is controlled by EMAIL_PROVIDER and SMS_PROVIDER
 * in the environment.  Set EMAIL_ENABLED=true / SMS_ENABLED=true to activate.
 * When a provider is disabled every send call is a silent no-op.
 */

import nodemailer from "nodemailer";
import twilio from "twilio";
import sgMail from "@sendgrid/mail";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "./env.js";

// ── Types ──────────────────────────────────────────────────────────────────

interface EmailAdapter {
    send(to: string, subject: string, html: string): Promise<void>;
}

interface SmsAdapter {
    send(to: string, body: string): Promise<void>;
}

export type UserContact = { name: string; email: string; phone?: string | null };

// ── Email adapters ─────────────────────────────────────────────────────────

/** nodemailer / SMTP adapter */
function createSmtpAdapter(): EmailAdapter {
    const transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });

    return {
        async send(to, subject, html) {
            await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html });
        },
    };
}

/** Twilio SendGrid HTTP API adapter */
function createSendGridAdapter(): EmailAdapter {
    sgMail.setApiKey(env.SENDGRID_API_KEY!);

    return {
        async send(to, subject, html) {
            await sgMail.send({ to, from: env.EMAIL_FROM, subject, html });
        },
    };
}

/** AWS SES v2 adapter */
function createSesAdapter(): EmailAdapter {
    const client = new SESv2Client({
        region: env.AWS_REGION!,
        // If AWS_ACCESS_KEY_ID is not set the SDK falls back to the
        // instance / container IAM role automatically.
        ...(env.AWS_ACCESS_KEY_ID && {
            credentials: {
                accessKeyId: env.AWS_ACCESS_KEY_ID,
                secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
            },
        }),
    });

    return {
        async send(to, subject, html) {
            await client.send(
                new SendEmailCommand({
                    FromEmailAddress: env.EMAIL_FROM,
                    Destination: { ToAddresses: [to] },
                    Content: {
                        Simple: {
                            Subject: { Data: subject },
                            Body: { Html: { Data: html } },
                        },
                    },
                }),
            );
        },
    };
}

// ── SMS adapters ───────────────────────────────────────────────────────────

/** Twilio Programmable Messaging adapter */
function createTwilioAdapter(): SmsAdapter {
    const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

    return {
        async send(to, body) {
            await client.messages.create({ from: env.TWILIO_FROM!, to, body });
        },
    };
}

/**
 * MSG91 transactional SMS adapter.
 *
 * Uses the MSG91 Send HTTP API (route 4 = transactional).
 * Phone numbers are automatically normalised to the format MSG91 expects
 * (digits only, with country code, no leading +).
 *
 * India DLT compliance: set MSG91_DLT_TE_ID to the registered
 * template entity ID required by TRAI.
 */
function createMsg91Adapter(): SmsAdapter {
    return {
        async send(to, body) {
            // Normalise: strip non-digits, ensure country code present
            const mobile = to.replace(/\D/g, "");

            const params = new URLSearchParams({
                authkey: env.MSG91_AUTH_KEY!,
                mobiles: mobile,
                message: body,
                sender: env.MSG91_SENDER_ID,
                route: "4", // 4 = transactional
                response: "json",
                unicode: "0",
            });

            if (env.MSG91_DLT_TE_ID) {
                params.set("pe_id", env.MSG91_DLT_TE_ID);
            }

            const res = await fetch(`https://api.msg91.com/api/sendhttp.php?${params.toString()}`);

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`MSG91 error ${res.status}: ${text}`);
            }

            const json = (await res.json()) as { type?: string; message?: string };
            if (json.type === "error") {
                throw new Error(`MSG91 rejected: ${json.message ?? "unknown error"}`);
            }
        },
    };
}

// ── Lazy singletons ────────────────────────────────────────────────────────
// Adapters are created on first use so unused providers never initialise.

let _email: EmailAdapter | null | undefined;
let _sms: SmsAdapter | null | undefined;

function getEmailAdapter(): EmailAdapter | null {
    if (_email !== undefined) return _email;

    if (!env.EMAIL_ENABLED) {
        _email = null;
        return null;
    }

    try {
        switch (env.EMAIL_PROVIDER) {
            case "sendgrid":
                _email = createSendGridAdapter();
                break;
            case "ses":
                _email = createSesAdapter();
                break;
            default:
                _email = createSmtpAdapter();
        }
    } catch (err) {
        console.error(
            `[notifications] Failed to initialise email adapter (${env.EMAIL_PROVIDER}):`,
            (err as Error).message,
        );
        _email = null;
    }

    return _email;
}

function getSmsAdapter(): SmsAdapter | null {
    if (_sms !== undefined) return _sms;

    if (!env.SMS_ENABLED) {
        _sms = null;
        return null;
    }

    try {
        _sms = env.SMS_PROVIDER === "msg91" ? createMsg91Adapter() : createTwilioAdapter();
    } catch (err) {
        console.error(
            `[notifications] Failed to initialise SMS adapter (${env.SMS_PROVIDER}):`,
            (err as Error).message,
        );
        _sms = null;
    }

    return _sms;
}

// ── Internal dispatch ──────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    const adapter = getEmailAdapter();
    if (!adapter) return;
    try {
        await adapter.send(to, subject, html);
    } catch (err) {
        console.error(
            `[notifications] email failed (${env.EMAIL_PROVIDER}):`,
            (err as Error).message,
        );
    }
}

async function sendSms(to: string | null | undefined, body: string): Promise<void> {
    if (!to) return;
    const adapter = getSmsAdapter();
    if (!adapter) return;
    try {
        await adapter.send(to, body);
    } catch (err) {
        console.error(`[notifications] sms failed (${env.SMS_PROVIDER}):`, (err as Error).message);
    }
}

// ── HTML template ──────────────────────────────────────────────────────────

function wrap(name: string, body: string): string {
    return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#4f46e5">SplitEase</h2>${body}
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
    <p style="font-size:12px;color:#9ca3af">
        You received this because you are a member of SplitEase.
    </p>
</div>`;
}

// ── Public notification functions ──────────────────────────────────────────

export function notifyExpenseAdded(
    actor: UserContact,
    recipients: UserContact[],
    expense: { description: string; amount: number; currency: string },
): void {
    for (const r of recipients.filter((r) => r.email !== actor.email)) {
        void sendEmail(
            r.email,
            `New expense: ${expense.description}`,
            wrap(
                r.name,
                `<p>Hi <b>${r.name}</b>,</p>
<p><b>${actor.name}</b> added a new expense <b>"${expense.description}"</b>
for <b>${expense.currency} ${expense.amount.toFixed(2)}</b>.</p>
<p>Log in to see your share.</p>`,
            ),
        );
        void sendSms(
            r.phone,
            `${actor.name} added "${expense.description}" (${expense.currency} ${expense.amount.toFixed(2)}) on SplitEase.`,
        );
    }
}

export function notifyExpenseUpdated(
    actor: UserContact,
    recipients: UserContact[],
    expense: { description: string; amount: number; currency: string },
): void {
    for (const r of recipients.filter((r) => r.email !== actor.email)) {
        void sendEmail(
            r.email,
            `Expense updated: ${expense.description}`,
            wrap(
                r.name,
                `<p>Hi <b>${r.name}</b>,</p>
<p><b>${actor.name}</b> updated <b>"${expense.description}"</b> —
new total: <b>${expense.currency} ${expense.amount.toFixed(2)}</b>.</p>`,
            ),
        );
        void sendSms(
            r.phone,
            `${actor.name} updated "${expense.description}" to ${expense.currency} ${expense.amount.toFixed(2)} on SplitEase.`,
        );
    }
}

export function notifyExpenseDeleted(
    actor: UserContact,
    recipients: UserContact[],
    expense: { description: string; amount: number; currency: string },
): void {
    for (const r of recipients.filter((r) => r.email !== actor.email)) {
        void sendEmail(
            r.email,
            `Expense deleted: ${expense.description}`,
            wrap(
                r.name,
                `<p>Hi <b>${r.name}</b>,</p>
<p><b>${actor.name}</b> deleted the expense <b>"${expense.description}"</b>
(${expense.currency} ${expense.amount.toFixed(2)}).</p>`,
            ),
        );
        void sendSms(r.phone, `${actor.name} deleted "${expense.description}" on SplitEase.`);
    }
}

export function notifySettlement(
    from: UserContact,
    to: UserContact,
    amount: number,
    currency: string,
): void {
    void sendEmail(
        to.email,
        `Payment recorded from ${from.name}`,
        wrap(
            to.name,
            `<p>Hi <b>${to.name}</b>,</p>
<p><b>${from.name}</b> recorded a payment of
<b>${currency} ${amount.toFixed(2)}</b> to you on SplitEase.</p>`,
        ),
    );
    void sendSms(
        to.phone,
        `${from.name} recorded a payment of ${currency} ${amount.toFixed(2)} to you on SplitEase.`,
    );
}

export function notifySettlementDeleted(
    actor: UserContact,
    other: UserContact,
    amount: number,
    currency: string,
): void {
    void sendEmail(
        other.email,
        `Settlement removed by ${actor.name}`,
        wrap(
            other.name,
            `<p>Hi <b>${other.name}</b>,</p>
<p><b>${actor.name}</b> removed a settlement of
<b>${currency} ${amount.toFixed(2)}</b> on SplitEase.</p>`,
        ),
    );
    void sendSms(
        other.phone,
        `${actor.name} removed a settlement of ${currency} ${amount.toFixed(2)} on SplitEase.`,
    );
}

export function notifyMemberAdded(
    actor: UserContact,
    newMember: UserContact,
    groupName: string,
): void {
    void sendEmail(
        newMember.email,
        `You were added to ${groupName}`,
        wrap(
            newMember.name,
            `<p>Hi <b>${newMember.name}</b>,</p>
<p><b>${actor.name}</b> added you to the group <b>"${groupName}"</b> on SplitEase.</p>`,
        ),
    );
    void sendSms(newMember.phone, `${actor.name} added you to "${groupName}" on SplitEase.`);
}

export function notifyFriendAdded(actor: UserContact, newFriend: UserContact): void {
    void sendEmail(
        newFriend.email,
        `${actor.name} added you on SplitEase`,
        wrap(
            newFriend.name,
            `<p>Hi <b>${newFriend.name}</b>,</p>
<p><b>${actor.name}</b> added you as a friend on SplitEase.</p>`,
        ),
    );
    void sendSms(newFriend.phone, `${actor.name} added you as a friend on SplitEase.`);
}

export function sendVerificationEmail(to: string, name: string, verifyUrl: string): void {
    if (!env.EMAIL_ENABLED) return;
    void sendEmail(
        to,
        "Verify your SplitEase email address",
        wrap(
            name,
            `<p>Hi <b>${name}</b>,</p>
<p>Thanks for signing up! Please verify your email address by clicking the button below.</p>
<p style="margin:24px 0">
    <a href="${verifyUrl}"
       style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;
              text-decoration:none;font-weight:600;display:inline-block">
        Verify Email Address
    </a>
</p>
<p style="font-size:13px;color:#6b7280">
    This link expires in <b>24 hours</b>.
    If you didn't create an account you can safely ignore this email.
</p>
<p style="font-size:12px;color:#9ca3af;margin-top:16px">
    Or copy this URL into your browser:<br/>
    <span style="word-break:break-all">${verifyUrl}</span>
</p>`,
        ),
    );
}
