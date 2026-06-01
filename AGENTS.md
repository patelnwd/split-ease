# SplitEase — Agent Guide

This file is the single source of truth for AI agents working on this codebase.
Read it fully before making any changes.

---

## Project overview

SplitEase is a self-hosted, open-source Splitwise alternative.
Users track shared expenses, split bills across groups or friends, record settlements,
and view net balances. Data stays on the user's own PostgreSQL instance.

**Repo:** https://github.com/patelnwd/split-ease  
**Author:** Mukesh Kumar (@patelnwd)  
**Stack:** pnpm monorepo — Fastify backend + React frontend

---

## Repository layout

```
split-ease/
├── packages/
│   ├── backend/          Fastify API server (Node.js + TypeScript)
│   └── frontend/         React SPA (Vite + TypeScript)
├── eslint.config.mjs     Shared ESLint flat config (TS + React)
├── .prettierrc
├── .vscode/
│   ├── settings.json     Editor settings (format-on-save, ESLint, Tailwind, etc.)
│   ├── extensions.json   Recommended VS Code extensions
│   ├── launch.json       Debug configs for backend + tests
│   └── cspell.json       Project-specific spell-check words
└── package.json          Root workspace scripts
```

### Backend layout

```
packages/backend/src/
├── server.ts             App factory (buildApp) + entry point
├── db/
│   ├── schema.ts         All 10 Drizzle tables + enums + relations
│   ├── index.ts          Drizzle client + postgres connection
│   ├── init.ts           One-shot DB setup script (env → DB → schema → seed)
│   └── seed.ts           Demo data (alice/bob/carol)
├── lib/
│   ├── env.ts            Zod-validated environment config (single source of truth)
│   ├── balance.ts        calculateUserBalances + simplifyDebts
│   ├── notifications.ts  Email (SMTP/SendGrid/SES) + SMS (Twilio/MSG91) adapters
│   └── preflight.ts      Startup health checks
└── routes/               One file per feature area (12 files)
```

### Frontend layout

```
packages/frontend/src/
├── App.tsx               React Router route tree
├── contexts/
│   └── AuthContext.tsx   Global auth state + /me refresh
├── lib/
│   ├── api.ts            Typed fetch wrapper (credentials: include)
│   └── utils.ts          formatCurrency, formatDate, getInitials, categoryIcon
├── types/index.ts        All shared TypeScript types (single source of truth)
├── components/           Reusable UI components
│   ├── expenses/         AddExpenseDialog, EditExpenseDialog, ExpenseItem
│   ├── groups/           CreateGroupDialog
│   ├── settlements/      SettleUpDialog
│   ├── layout/           DashboardLayout, Sidebar, MobileNav
│   └── ui/               Radix UI wrappers (Button, Card, Dialog, Input, …)
└── pages/                12 page components (one per route)
```

---

## Tech stack

| Layer           | Technology              | Notes                                                   |
| --------------- | ----------------------- | ------------------------------------------------------- |
| Runtime         | Node.js 20+             | ESM (`"type": "module"` in backend/package.json)        |
| API server      | Fastify 4               | Plugins: cors, jwt, cookie, multipart, static           |
| ORM             | Drizzle ORM 0.32        | PostgreSQL dialect; `drizzle-kit push` for schema sync  |
| Database        | PostgreSQL 14+          | UUID primary keys via `crypto.randomUUID()`             |
| Auth            | JWT in HTTP-only cookie | 7-day session; bcrypt cost 12                           |
| OAuth           | Google + GitHub         | PKCE state via JWT; account linking on email match      |
| Frontend        | React 18 + Vite         | TypeScript strict mode                                  |
| Routing         | React Router 6          | Protected routes via `<ProtectedRoute>`                 |
| Data fetching   | TanStack Query v5       | All server state; `qc.invalidateQueries()` on mutations |
| Forms           | react-hook-form + Zod   | Zod schema shared between form + API payload            |
| UI              | Radix UI + Tailwind CSS | Component wrappers in `components/ui/`                  |
| Package manager | pnpm 9 (workspaces)     | Never use npm or yarn in this repo                      |

---

## Environment variables

All variables are in `packages/backend/.env`. Validated at startup by Zod in `lib/env.ts`.
If a required variable is missing the server will refuse to start with a clear message.

**Required:**

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — min 16 chars, not a placeholder
- `FRONTEND_URL` — CORS origin + OAuth redirect base

**Optional groups:** Server, OAuth (Google/GitHub), Email (SMTP/SendGrid/SES), SMS (Twilio/MSG91).
See `.env.example` for the full list and README for documentation.

---

## Database schema

Managed by Drizzle ORM. Push changes with `pnpm db:push` (dev) or `pnpm db:migrate` (prod).

### Tables

| Table                  | Key columns                                                                                                 | Notes                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `users`                | id, name, email, password (nullable), emailVerified, isAdmin, bannedUntil, oauthProvider, oauthId, currency | password is null for OAuth-only accounts                                  |
| `groups`               | id, name, description, category (enum), createdById                                                         | category: HOME/TRIP/COUPLE/WORK/OTHER                                     |
| `group_members`        | id, groupId, userId, role (ADMIN/MEMBER), joinedAt                                                          | unique(groupId, userId)                                                   |
| `expenses`             | id, description, amount, currency, date, category, splitType, groupId (nullable), paidById                  |                                                                           |
| `expense_participants` | id, expenseId, userId, amount, percentage, shares, settled                                                  | unique(expenseId, userId)                                                 |
| `settlements`          | id, amount, currency, date, fromUserId, toUserId, groupId (nullable)                                        | fromUser pays toUser                                                      |
| `friendships`          | id, user1Id, user2Id                                                                                        | unique(user1Id, user2Id); stored with user1Id < user2Id lexicographically |
| `activities`           | id, type (enum), description, userId, expenseId?, settlementId?                                             | audit log                                                                 |
| `custom_categories`    | id, name, icon, color, userId                                                                               | per-user custom expense categories                                        |
| `access_logs`          | id, method, path, statusCode, duration, userId?, ip, userAgent                                              | HTTP access log                                                           |

### Enums

- `split_type`: EQUAL, EXACT, PERCENTAGE, SHARES
- `expense_category`: GENERAL, FOOD, TRANSPORT, ACCOMMODATION, ENTERTAINMENT, SHOPPING, UTILITIES, HEALTHCARE, OTHER
- `group_category`: HOME, TRIP, COUPLE, WORK, OTHER
- `member_role`: ADMIN, MEMBER
- `activity_type`: EXPENSE_ADDED, EXPENSE_UPDATED, EXPENSE_DELETED, SETTLEMENT_ADDED, SETTLEMENT_DELETED, GROUP_CREATED, GROUP_UPDATED, MEMBER_ADDED, MEMBER_REMOVED, FRIEND_ADDED, FRIEND_REMOVED, PROFILE_UPDATED

---

## Authentication

- Login sets an HTTP-only cookie named `token` (JWT, 7-day expiry).
- The `server.authenticate` Fastify decorator verifies the cookie and populates `request.user`.
- The `server.requireAdmin` decorator additionally checks `users.isAdmin = true` in the DB.
- Ban check happens at login only; banned users who are already logged in are not mid-session kicked.
- OAuth users have `password = null`; they can set a password via `POST /api/auth/set-password`.
- Friendships stored with `user1Id < user2Id` (lexicographic sort) to guarantee uniqueness.

---

## Balance calculation — critical business logic

### `calculateUserBalances` (`lib/balance.ts`)

Returns a net balance for each other user the current user interacts with.

- `amount > 0` → that person owes the current user
- `amount < 0` → the current user owes that person
- Settlements subtract from the outstanding balance (not their own direction).
- **Always load participant user data** when calling this function. The query must include
  `participants: { with: { user: { columns: { id, name, email, image } } } }`.
  Without this, participant names default to the payer's name (wrong).

### `simplifyDebts` (`lib/balance.ts`)

Used for the group "Who owes whom" card.

- **Does NOT take a member list** — it derives all participants from expense + settlement data.
  This is intentional: removed members with outstanding balances must still appear.
- Uses a greedy creditor/debtor matching algorithm to minimise the number of transactions.

### Split amount calculation (`routes/expenses.ts → computeAmounts`)

All arithmetic is done in **integer cents** to avoid floating-point rounding drift.

```
EQUAL:      floor(totalCents / n); distribute remainder cents to first N participants
PERCENTAGE: floor(pct/100 * totalCents per participant); distribute remainder similarly
SHARES:     floor(shares/totalShares * totalCents per participant); same remainder handling
EXACT:      pass-through (frontend validates sum === total before submitting)
```

Never use `Math.round(share * 100) / 100` per-participant — this loses fractional cents.

---

## Member removal rules

Removing a group member is **blocked** if they have an unsettled balance in that group.
The backend returns HTTP 409 with `error` and `netBalance` fields.

**Correct workflow:** settle up first → then remove.

**Do NOT** redistribute a removed member's expense shares to remaining members.
Past expenses are immutable financial records. Retroactive redistribution would:

- Create phantom debts (e.g. Carol owes ₹50 extra she never spent)
- Destroy the audit trail
- Break "EXACT" and "PERCENTAGE" split records

---

## API routes reference

All routes are registered under `/api` prefix in `server.ts`.

| Prefix             | File                  | Auth       |
| ------------------ | --------------------- | ---------- |
| `/api/auth`        | routes/auth.ts        | mixed      |
| `/api/groups`      | routes/groups.ts      | ✓          |
| `/api/expenses`    | routes/expenses.ts    | ✓          |
| `/api/balances`    | routes/balances.ts    | ✓          |
| `/api/settlements` | routes/settlements.ts | ✓          |
| `/api/friends`     | routes/friends.ts     | ✓          |
| `/api/users`       | routes/users.ts       | ✓          |
| `/api/profile`     | routes/profile.ts     | ✓          |
| `/api/activity`    | routes/activity.ts    | ✓          |
| `/api/categories`  | routes/categories.ts  | ✓          |
| `/api/access-logs` | routes/access-logs.ts | ✓          |
| `/api/admin`       | routes/admin.ts       | admin only |
| `/api/health`      | server.ts inline      | —          |

### Groups member endpoints

- `POST /api/groups/:id/members` — admin only; adds member; also auto-creates friendship
- `DELETE /api/groups/:id/members?userId=` — admin can remove anyone; member can only remove
  themselves (leave). Returns 409 if unsettled balance exists.

### Friendship storage

Stored with `user1Id < user2Id` (lexicographic). When reading:

```typescript
const friend = f.user1Id === userId ? f.user2 : f.user1; // NOT f.user1 when you are user1
```

The ternary is easy to get backwards — note the correct form above.

---

## Frontend patterns

### Currency display

Always use `formatCurrency(amount, user?.currency ?? "INR")`.

- Never hardcode `$` as a currency symbol in JSX.
- `formatCurrency` uses `Intl.NumberFormat` and respects the currency code correctly.
- The user's preferred currency is on `user.currency` from `AuthContext`.

### API client (`lib/api.ts`)

```typescript
api.get<T>(path)
api.post<T>(path, body?)   // body is optional — no body = no Content-Type header
api.patch<T>(path, body)
api.delete<T>(path)
```

`Content-Type: application/json` is only set when a body is present.
Sending `Content-Type: application/json` with an empty body causes Fastify to return 400.

### GroupMember shape

The `GET /api/groups/:id` endpoint returns **flattened** member objects:

```typescript
{
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
}
```

where `id` is the **user's** UUID (not the `group_members` table row UUID).
The backend explicitly maps `m.user.id → id` before returning.

### Query invalidation pattern

```typescript
const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["group", id] });
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["balances"] });
};
```

After any mutation (add expense, settle, add/remove member) call `invalidate()` so all
dependent queries re-fetch.

---

## Logging

The backend uses Fastify's built-in pino logger with pino-pretty in development.

Configuration in `server.ts`:

- `singleLine: true` — all log fields on one line
- `ignore: "pid,hostname"` — suppress noisy fields
- Custom serializers: `req → { method, url }`, `res → { statusCode }`

In development each request produces two log lines:

```
INFO: incoming request {"reqId":"req-1","req":{"method":"GET","url":"/api/auth/me"}}
INFO: request completed {"reqId":"req-1","res":{"statusCode":200},"responseTime":4.39}
```

---

## Scripts

Run from the repo root unless noted.

| Command            | What it does                                                   |
| ------------------ | -------------------------------------------------------------- |
| `pnpm dev`         | Start backend + frontend in parallel                           |
| `pnpm build`       | Compile both packages                                          |
| `pnpm fix`         | ESLint auto-fix + Prettier write (fix everything auto-fixable) |
| `pnpm lint`        | Type-check + ESLint (check only)                               |
| `pnpm format`      | Prettier check only                                            |
| `pnpm test`        | Run backend Vitest suite                                       |
| `pnpm db:init`     | Full DB setup: env check → create DB → push schema → seed      |
| `pnpm db:push`     | Push schema changes to DB directly (no migration file)         |
| `pnpm db:generate` | Generate migration files from schema diff                      |
| `pnpm db:migrate`  | Apply migration files                                          |
| `pnpm db:studio`   | Open Drizzle Studio (visual DB browser)                        |

Backend-only (run from `packages/backend/`):

- `pnpm test:watch` / `pnpm test:coverage`
- `pnpm lint:fix` / `pnpm format:fix`

---

## ESLint configuration

Flat config in `eslint.config.mjs`. Two rule sets:

1. **Backend** (`packages/backend/src/**/*.ts`) — TypeScript recommended + custom rules
2. **Frontend** (`packages/frontend/src/**/*.{ts,tsx}`) — TypeScript + React + react-hooks

**Important:** `settings: { react: { version: "18" } }` — do NOT change to `"detect"`.
`eslint-plugin-react@7` calls `context.getFilename()` which was removed in ESLint v10;
`"detect"` triggers that code path and crashes the linter.

---

## Known gotchas

1. **pnpm store corruption** — If you see `Cannot find module 'dotenv/config'`, run
   `pnpm install --force` to re-download corrupted packages.

2. **Port 3001 in use** — Kill the stale process with `kill $(lsof -ti :3001)`.

3. **`db:init` enum warnings** — `drizzle-kit push --force` may log
   `PostgresError: enum label already exists` (PG code 42710) when schema was previously pushed.
   This is harmless; `init.ts` swallows it intentionally.

4. **Friendship ternary** — `f.user1Id === userId ? f.user2 : f.user1` (returns the OTHER user).
   The inverted form is a common mistake.

5. **`computeAmounts` rounding** — Always use integer-cent arithmetic. Never `Math.round`
   per participant independently — it drops fractional cents across the group.

6. **`simplifyDebts` member list** — The function signature takes NO member list.
   Passing current members only would silently drop removed members' outstanding balances.

7. **`GroupMember.id`** — Always the user's UUID, never the `group_members` row UUID.
   The backend flattens this in the `GET /api/groups/:id` response.

8. **Participant user data** — Every query that feeds into `calculateUserBalances` must load
   `participants: { with: { user: { columns: { id, name, email, image } } } }`.
   Without it, balance display names default to the payer's name.

---

## Testing

Backend tests use Vitest with a real PostgreSQL database (no mocks).
Set `DATABASE_URL` to a test DB before running.

Test files in `packages/backend/src/__tests__/`:

- `auth.test.ts` — register, login, ban enforcement, OAuth flows
- `admin.test.ts` — ban/unban, admin toggle, privilege escalation guards
- `categories.test.ts` — custom category CRUD, ownership checks
- `helpers.ts` — shared test utilities

Vitest is configured with `singleFork` pool to prevent PostgreSQL connection pool exhaustion.

---

## Notifications

Fire-and-forget — a failed send never breaks an API response.
Adapters are lazy-loaded (no init cost if the provider is disabled).

Email providers (`EMAIL_PROVIDER`): `smtp` | `sendgrid` | `ses`  
SMS providers (`SMS_PROVIDER`): `twilio` | `msg91`

`msg91` includes India TRAI DLT compliance fields (`MSG91_SENDER_ID`, `MSG91_DLT_TE_ID`).
