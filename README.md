# Nexus EFOS — Core Platform Prototype

First working slice of Nexus OS (Enterprise Operating System for Inclusive
Finance), built from the 99-section concept doc. Scope for this pass: Layer 1
of the ecosystem (§21) — Enterprise Identity, Security — implemented as
**auth + RBAC + institution onboarding**.

## What's built

**API** (`/api` — Node/Express/TypeScript/Prisma/PostgreSQL)
- `POST /auth/register-institution` — institution onboarding step 1. Creates
  the institution, a Head Office branch, seeds the institution's role set
  from the doc's §38.7 core role templates, grants permissions, and creates
  the first user as Chief Executive Officer.
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` — JWT access
  tokens (15 min) + opaque refresh tokens (30 days, hashed at rest).
- `PATCH/POST /institutions/onboarding/*` — steps 2–5 (details, branches,
  staff invites, go-live).
- `GET /roles`, `POST /roles/assign` — role assignment with optional branch
  scope and expiry, implementing doc §38.12 Temporary Delegation.
- RBAC middleware (`requirePermission`) enforces least-privilege per doc §39:
  checks a user's *active* role assignments only (expired delegations are
  excluded automatically).

**Data model** (`api/prisma/schema.prisma`) — Institution, Branch, User,
Role, Permission, RolePermission, UserRole (with branch scope + delegation +
expiry), RefreshToken, AuditLog. Every enum and permission category is
pulled directly from doc §14.3 (institution types), §38 (roles) and §39
(permission categories/actions) — not invented generically.

**Web** (`/web` — Next.js/TypeScript/Tailwind)
- `/` — landing
- `/onboarding` — institution + admin registration form
- `/login`
- `/dashboard` — shell with sidebar nav, institution stats; palette is the
  concept doc's own ink/gold tokens (`tailwind.config.ts`), not the standard
  Ayivi Navy/Ivory/Gold system, per your instruction.

## Running it

This is source code, not a deployed app — you run it on your own machine (or
a server) with Node.js installed. Two processes, run in two terminal tabs.

**0. Prerequisites:** Node.js 18+, and a Postgres database. Easiest option is
your existing `ayivi-dev` Supabase project — grab its connection string from
Supabase → Project Settings → Database → Connection string (URI).

**1. API — terminal 1:**
```bash
cd api
cp .env.example .env
```
Open `.env` and set `DATABASE_URL` to your Postgres connection string,
keeping `?schema=nexusos` on the end (the project uses a dedicated schema so
it doesn't collide with your other Ayivi products in the same database).
Then:
```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
```
`npm run dev` starts the API at `http://localhost:4100` and keeps running —
leave this terminal open.

**2. Web — terminal 2:**
```bash
cd web
npm install
npm run dev
```
Starts the frontend at `http://localhost:3100` — also keeps running.

**3. Try it:** open `http://localhost:3100`, click "Register an Institution,"
fill in the form (pick any institution type), submit. You'll be logged in
and land on the dashboard showing your institution, with yourself as Chief
Executive Officer and the other six roles (Branch Manager, Loan Officer,
Credit Analyst, Field Collector, Compliance Officer, System Administrator)
already seeded and ready to assign to staff via the `/roles/assign` API.

**If something breaks:**
- `prisma migrate dev` fails to connect → double check the connection string
  and that your IP is allowed through Supabase's connection pooling settings.
- Web app shows a fetch/network error → the API isn't running, or it's on a
  different port than `NEXT_PUBLIC_API_URL` expects (default assumes 4100).
- `npx prisma generate` couldn't run inside the sandbox this was built in
  (no network access to `binaries.prisma.sh` there) — it wasn't tested
  end-to-end against a live database. It should work normally on your
  machine; if it doesn't, that's the first place to look. Everything else
  (API TypeScript, full Next.js production build) compiled clean.

## Not yet built (next slices)

- Onboarding steps 2–5 in the UI (API routes exist)
- Roles & Permissions UI (assign/revoke, view audit trail)
- Enterprise Services layer (§21 Layer 2): Customer Management, Savings,
  Loans, Collections
- MFA (doc §39.10 privileged access controls)
- Nexus multi-schema wiring into the shared `ayivi-dev` Supabase project once
  you confirm the `nexusos` schema name

## Design decisions worth flagging

- Institution-scoped roles are copied from system templates at registration
  rather than referencing a shared global role — this lets each institution
  customize roles later (doc §38.13 Role Lifecycle Management) without
  affecting others.
- Refresh tokens are stored as SHA-256 hashes, never plaintext (doc §39
  defence-in-depth principle).
- Frontend has no "AI" language anywhere — consistent with the Ayivi
  invisibility rule, and there's no AI surface in this slice anyway.
