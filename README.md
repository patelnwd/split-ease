# SplitEase

A self-hosted, open-source Splitwise alternative. Track shared expenses, split bills, manage group finances, and settle debts — with full data ownership.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Scripts Reference](#scripts-reference)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Notifications](#notifications)
- [Testing](#testing)

---

## Features

### Expense Management
- Add expenses with four split modes: **Equal**, **Exact amounts**, **Percentage**, **Shares**
- Assign a payer and split among any subset of group members or friends
- Attach a category (9 built-in + unlimited custom categories with emoji and color)
- Edit and delete expenses (payer-only)

### Groups
- Create groups with categories: Home, Trip, Couple, Work, Other
- Add and remove members; promote members to group admin
- View all group expenses, balances, and simplified debts in one place

### Friends & Balances
- Add friends by email search; remove friends
- See net balance with each friend across all shared expenses
- Dashboard overview: total owed, total owing, net balance

### Settlements
- Record payments between users; attach notes
- Filter settlements by group or across all friendships
- Delete erroneous settlements

### Activity Feed
- Real-time feed of all actions: expenses, settlements, group events, friend changes
- Filterable audit trail and HTTP access log on the History page

### Authentication
- Email/password with bcrypt hashing (cost factor 12)
- Google and GitHub OAuth with account linking
- Email verification flow with 24-hour expiry token
- Persistent sessions via HTTP-only cookies
- Change password (existing users) and set password (OAuth users)

### Profile
- Update display name, preferred currency, and phone number
- Upload avatar (2 MB max, served from `/uploads/`)

### Admin Panel
- List all users with ban and verification status
- Ban users with an optional duration and reason; permanent ban supported
- Toggle admin privileges and email verification status

### Notifications
- Email: SMTP, SendGrid, Amazon SES
- SMS: Twilio, MSG91 (with India DLT compliance)
- Events: expense added/updated/deleted, settlement recorded/deleted, member added, friend added, email verification

---

## Tech Stack

| Layer           | Technology                                                   |
| --------------- | ------------------------------------------------------------ |
| Backend         | Node.js 20+, Fastify 4, TypeScript                           |
| Database        | PostgreSQL 14+, Drizzle ORM                                  |
| Auth            | JWT (HTTP-only cookie), bcryptjs, Google OAuth, GitHub OAuth |
| Frontend        | React 18, Vite, TypeScript                                   |
| Routing         | React Router 6                                               |
| Data fetching   | TanStack Query v5                                            |
| Forms           | react-hook-form + Zod                                        |
| UI components   | Radix UI + Tailwind CSS                                      |
| Email           | nodemailer (SMTP), SendGrid, AWS SES v2                      |
| SMS             | Twilio, MSG91                                                |
| Testing         | Vitest                                                       |
| Package manager | pnpm 9 (workspaces)                                          |

---

## Prerequisites

| Requirement | Version     | Notes                                       |
| ----------- | ----------- | ------------------------------------------- |
| Node.js     | 20 or later |                                             |
| pnpm        | 9 or later  | `npm i -g pnpm`                             |
| PostgreSQL  | 14 or later | Local or hosted (Neon, Supabase, RDS, etc.) |

Optional (only needed if the corresponding feature is enabled):

| Requirement                              | Used for                             |
| ---------------------------------------- | ------------------------------------ |
| Google OAuth app                         | Social login via Google              |
| GitHub OAuth app                         | Social login via GitHub              |
| SMTP server / SendGrid / AWS SES account | Email verification and notifications |
| Twilio / MSG91 account                   | SMS notifications                    |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/patelnwd/split-ease.git
cd split-ease
pnpm install
```

### 2. Configure environment

```bash
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env` — at minimum set:

```env
DATABASE_URL=postgres://user:password@localhost:5432/splitease
JWT_SECRET=<run: openssl rand -base64 32>
FRONTEND_URL=http://localhost:5173
```

### 3. Initialise the database

Runs env checks → creates the database if it doesn't exist → pushes the schema → seeds demo users.

```bash
pnpm db:init
```

Demo accounts created by the seed:

| Email             | Password    |
| ----------------- | ----------- |
| alice@example.com | password123 |
| bob@example.com   | password123 |
| carol@example.com | password123 |

### 4. Start the dev servers

```bash
pnpm dev
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

---

## Environment Variables

All variables live in `packages/backend/.env`. Copy `.env.example` as a starting point.

### Core (required)

| Variable       | Description                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string                                                     |
| `JWT_SECRET`   | Secret for signing JWT tokens (min 16 chars)                                     |
| `FRONTEND_URL` | Frontend origin used for CORS and OAuth redirects (e.g. `http://localhost:5173`) |

### Server (optional)

| Variable              | Default                 | Description                            |
| --------------------- | ----------------------- | -------------------------------------- |
| `PORT`                | `3001`                  | Port the backend listens on            |
| `NODE_ENV`            | `development`           | `development`, `production`, or `test` |
| `UPLOADS_DIR`         | `./uploads`             | Directory for avatar uploads           |
| `OAUTH_CALLBACK_BASE` | Value of `FRONTEND_URL` | Base URL for OAuth callback URLs       |

### Google OAuth (optional)

| Variable               | Description                             |
| ---------------------- | --------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Client ID from Google Cloud Console     |
| `GOOGLE_CLIENT_SECRET` | Client secret from Google Cloud Console |

Callback URL to register: `{OAUTH_CALLBACK_BASE}/api/auth/google/callback`

### GitHub OAuth (optional)

| Variable               | Description                                  |
| ---------------------- | -------------------------------------------- |
| `GITHUB_CLIENT_ID`     | Client ID from GitHub Developer Settings     |
| `GITHUB_CLIENT_SECRET` | Client secret from GitHub Developer Settings |

Callback URL to register: `{OAUTH_CALLBACK_BASE}/api/auth/github/callback`

### Email (optional)

| Variable         | Default | Description                                    |
| ---------------- | ------- | ---------------------------------------------- |
| `EMAIL_ENABLED`  | `false` | Set to `true` to enable email sending          |
| `EMAIL_PROVIDER` | `smtp`  | `smtp`, `sendgrid`, or `ses`                   |
| `EMAIL_FROM`     | —       | Sender address (e.g. `noreply@yourdomain.com`) |

**SMTP provider**

| Variable      | Description                            |
| ------------- | -------------------------------------- |
| `SMTP_HOST`   | Hostname (e.g. `smtp.gmail.com`)       |
| `SMTP_PORT`   | Port (e.g. `587`)                      |
| `SMTP_SECURE` | `true` for port 465, `false` otherwise |
| `SMTP_USER`   | SMTP username                          |
| `SMTP_PASS`   | SMTP password or app password          |

**SendGrid provider**

| Variable           | Description      |
| ------------------ | ---------------- |
| `SENDGRID_API_KEY` | SendGrid API key |

**Amazon SES provider**

| Variable                | Default      | Description                          |
| ----------------------- | ------------ | ------------------------------------ |
| `AWS_REGION`            | `ap-south-1` | AWS region                           |
| `AWS_ACCESS_KEY_ID`     | —            | Optional if running with an IAM role |
| `AWS_SECRET_ACCESS_KEY` | —            | Optional if running with an IAM role |

### SMS (optional)

| Variable       | Default  | Description                         |
| -------------- | -------- | ----------------------------------- |
| `SMS_ENABLED`  | `false`  | Set to `true` to enable SMS sending |
| `SMS_PROVIDER` | `twilio` | `twilio` or `msg91`                 |

**Twilio provider**

| Variable             | Description                        |
| -------------------- | ---------------------------------- |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID                 |
| `TWILIO_AUTH_TOKEN`  | Twilio Auth Token                  |
| `TWILIO_FROM`        | Sender phone number (E.164 format) |

**MSG91 provider** (India)

| Variable          | Description                          |
| ----------------- | ------------------------------------ |
| `MSG91_AUTH_KEY`  | MSG91 authentication key             |
| `MSG91_SENDER_ID` | 6-character DLT-registered sender ID |
| `MSG91_DLT_TE_ID` | TRAI template entity ID              |

---

## Project Structure

```
split-ease/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts        # Drizzle schema (14 tables)
│   │   │   │   ├── index.ts         # DB client
│   │   │   │   ├── init.ts          # DB init script
│   │   │   │   └── seed.ts          # Demo data
│   │   │   ├── lib/
│   │   │   │   ├── env.ts           # Zod-validated config
│   │   │   │   ├── balance.ts       # Balance calculation
│   │   │   │   ├── notifications.ts # Email + SMS adapters
│   │   │   │   └── preflight.ts     # Startup checks
│   │   │   ├── routes/              # 12 Fastify route modules
│   │   │   └── server.ts            # App factory + entry point
│   │   ├── .env.example
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── components/          # Reusable UI components
│       │   ├── contexts/            # AuthContext
│       │   ├── hooks/               # Custom hooks
│       │   ├── lib/                 # API client, utilities
│       │   ├── pages/               # 12 page components
│       │   └── types/               # Shared TypeScript types
│       └── package.json
├── eslint.config.mjs                # Shared ESLint flat config
├── .prettierrc
└── package.json                     # Root workspace scripts
```

---

## Scripts Reference

All scripts below can be run from the monorepo root.

### Development

| Command      | Description                          |
| ------------ | ------------------------------------ |
| `pnpm dev`   | Start backend + frontend in parallel |
| `pnpm build` | Compile both packages for production |

### Database

| Command            | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `pnpm db:init`     | Full setup: create DB → push schema → seed demo data |
| `pnpm db:push`     | Push schema changes directly (no migration files)    |
| `pnpm db:generate` | Generate migration files from schema changes         |
| `pnpm db:migrate`  | Apply generated migration files                      |
| `pnpm db:studio`   | Open Drizzle Studio (visual DB browser)              |
| `pnpm db:seed`     | Insert demo data only                                |

### Code Quality

| Command           | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `pnpm lint`       | TypeScript type-check + ESLint (check only)                 |
| `pnpm lint:fix`   | ESLint with auto-fix                                        |
| `pnpm format`     | Prettier check                                              |
| `pnpm format:fix` | Prettier write                                              |
| `pnpm fix`        | Run `lint:fix` + `format:fix` (fix everything auto-fixable) |

### Testing

| Command     | Description                |
| ----------- | -------------------------- |
| `pnpm test` | Run all backend tests once |

Backend-only extended commands (from `packages/backend/`):

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `pnpm test:watch`    | Run tests in watch mode        |
| `pnpm test:coverage` | Run tests with coverage report |

---

## API Reference

All endpoints are prefixed with `/api`. Authentication uses an HTTP-only cookie set on login.

### Auth — `/api/auth`

| Method | Path                   | Auth | Description                           |
| ------ | ---------------------- | ---- | ------------------------------------- |
| `POST` | `/register`            | —    | Register with email and password      |
| `POST` | `/login`               | —    | Login with email and password         |
| `POST` | `/logout`              | ✓    | Clear session cookie                  |
| `GET`  | `/me`                  | ✓    | Get current user                      |
| `POST` | `/change-password`     | ✓    | Change password (password users only) |
| `POST` | `/set-password`        | ✓    | Set a password (OAuth users only)     |
| `GET`  | `/verify-email?token=` | —    | Verify email address                  |
| `POST` | `/resend-verification` | ✓    | Resend verification email             |
| `GET`  | `/google`              | —    | Start Google OAuth flow               |
| `GET`  | `/google/callback`     | —    | Google OAuth callback                 |
| `GET`  | `/github`              | —    | Start GitHub OAuth flow               |
| `GET`  | `/github/callback`     | —    | GitHub OAuth callback                 |

### Groups — `/api/groups`

| Method   | Path                   | Auth       | Description                         |
| -------- | ---------------------- | ---------- | ----------------------------------- |
| `GET`    | `/`                    | ✓          | List user's groups                  |
| `POST`   | `/`                    | ✓          | Create group                        |
| `GET`    | `/:id`                 | ✓          | Get group with expenses and members |
| `PATCH`  | `/:id`                 | Admin      | Update group details                |
| `DELETE` | `/:id`                 | Admin      | Delete group                        |
| `POST`   | `/:id/members`         | Admin      | Add member                          |
| `DELETE` | `/:id/members?userId=` | Admin/Self | Remove member                       |

### Expenses — `/api/expenses`

| Method   | Path                | Auth  | Description                           |
| -------- | ------------------- | ----- | ------------------------------------- |
| `GET`    | `/?groupId=&limit=` | ✓     | List expenses (optional group filter) |
| `GET`    | `/:id`              | ✓     | Get expense with participants         |
| `POST`   | `/`                 | ✓     | Create expense                        |
| `PATCH`  | `/:id`              | Payer | Update expense                        |
| `DELETE` | `/:id`              | Payer | Delete expense                        |

### Balances — `/api/balances`

| Method | Path | Auth | Description                 |
| ------ | ---- | ---- | --------------------------- |
| `GET`  | `/`  | ✓    | Net balances with all users |

Returns `balances[]`, `totalOwed`, `totalOwing`, `netBalance`.

### Settlements — `/api/settlements`

| Method   | Path         | Auth  | Description       |
| -------- | ------------ | ----- | ----------------- |
| `GET`    | `/?groupId=` | ✓     | List settlements  |
| `POST`   | `/`          | ✓     | Record a payment  |
| `DELETE` | `/:id`       | Payer | Delete settlement |

### Friends — `/api/friends`

| Method   | Path        | Auth | Description                |
| -------- | ----------- | ---- | -------------------------- |
| `GET`    | `/`         | ✓    | List friends with balances |
| `POST`   | `/`         | ✓    | Add friend by user ID      |
| `DELETE` | `/?userId=` | ✓    | Remove friend              |

### Users — `/api/users`

| Method | Path         | Auth | Description                                 |
| ------ | ------------ | ---- | ------------------------------------------- |
| `GET`  | `/search?q=` | ✓    | Search users by name or email (min 2 chars) |

### Profile — `/api/profile`

| Method  | Path      | Auth | Description                         |
| ------- | --------- | ---- | ----------------------------------- |
| `GET`   | `/`       | ✓    | Get profile                         |
| `PATCH` | `/`       | ✓    | Update name, currency, phone        |
| `POST`  | `/avatar` | ✓    | Upload avatar (multipart, max 2 MB) |

### Activity — `/api/activity`

| Method | Path       | Auth | Description                    |
| ------ | ---------- | ---- | ------------------------------ |
| `GET`  | `/?limit=` | ✓    | Activity feed (user + friends) |

### Categories — `/api/categories`

| Method   | Path   | Auth | Description            |
| -------- | ------ | ---- | ---------------------- |
| `GET`    | `/`    | ✓    | List custom categories |
| `POST`   | `/`    | ✓    | Create custom category |
| `PATCH`  | `/:id` | ✓    | Update custom category |
| `DELETE` | `/:id` | ✓    | Delete custom category |

### Access Logs — `/api/access-logs`

| Method | Path               | Auth | Description                                |
| ------ | ------------------ | ---- | ------------------------------------------ |
| `GET`  | `/?limit=&offset=` | ✓    | Paginated HTTP access log for current user |

### Admin — `/api/admin`

| Method  | Path               | Auth  | Description                           |
| ------- | ------------------ | ----- | ------------------------------------- |
| `GET`   | `/users`           | Admin | List all users                        |
| `POST`  | `/users/:id/ban`   | Admin | Ban user (body: `{ days?, reason? }`) |
| `POST`  | `/users/:id/unban` | Admin | Unban user                            |
| `PATCH` | `/users/:id`       | Admin | Toggle `isAdmin` or `emailVerified`   |

---

## Database Schema

14 tables managed by Drizzle ORM:

| Table                  | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `users`                | Accounts, OAuth links, ban state, admin flag |
| `groups`               | Shared expense groups                        |
| `group_members`        | Group membership with roles (ADMIN, MEMBER)  |
| `expenses`             | Expense records with split type              |
| `expense_participants` | Per-user share of each expense               |
| `settlements`          | Recorded payments between users              |
| `friendships`          | Bidirectional friend links                   |
| `activities`           | Audit log of all user actions                |
| `custom_categories`    | User-defined expense categories              |
| `access_logs`          | HTTP request log per user                    |

**Split types:** `EQUAL` · `EXACT` · `PERCENTAGE` · `SHARES`

**Expense categories (built-in):** General · Food · Transport · Accommodation · Entertainment · Shopping · Utilities · Healthcare · Other

---

## Notifications

Notifications are fire-and-forget — a failed send never breaks an API response.

### Email

Set `EMAIL_ENABLED=true` and pick a provider with `EMAIL_PROVIDER`:

| Provider   | When to use                                         |
| ---------- | --------------------------------------------------- |
| `smtp`     | Gmail, Mailgun, self-hosted Postfix, local Mailpit  |
| `sendgrid` | Managed deliverability at scale                     |
| `ses`      | AWS deployments; supports IAM role (no keys needed) |

### SMS

Set `SMS_ENABLED=true` and pick a provider with `SMS_PROVIDER`:

| Provider | When to use                            |
| -------- | -------------------------------------- |
| `twilio` | Global SMS delivery                    |
| `msg91`  | Indian market with TRAI DLT compliance |

### Events that trigger notifications

| Event                   | Email | SMS |
| ----------------------- | ----- | --- |
| New expense added       | ✓     | ✓   |
| Expense updated         | ✓     | —   |
| Expense deleted         | ✓     | —   |
| Settlement recorded     | ✓     | ✓   |
| Settlement deleted      | ✓     | —   |
| Added to group          | ✓     | —   |
| Friend request accepted | ✓     | —   |
| Email verification      | ✓     | —   |

---

## Testing

Tests run against a real PostgreSQL database (no mocks). Set `DATABASE_URL` to a test database before running.

```bash
pnpm test
```

Test suites:

| File                 | Covers                                                |
| -------------------- | ----------------------------------------------------- |
| `auth.test.ts`       | Register, login, logout, OAuth flows, ban enforcement |
| `admin.test.ts`      | Admin-only endpoints, ban/unban, privilege escalation |
| `categories.test.ts` | Custom category CRUD, ownership checks                |

Tests use a forked Vitest pool (serial execution) to prevent PostgreSQL connection pool exhaustion.

---

## Author

Created and maintained by **Mukesh Kumar** ([@patelnwd](https://github.com/patelnwd))

---

*SplitEase is open source and self-hostable — your data stays yours.*
