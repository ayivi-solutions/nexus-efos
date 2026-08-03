# Nexus EFOS — Enterprise Financial Operating System

A core banking / MFI operations platform for Ghana's informal and semi-formal
finance sector, built from the 99-section Nexus OS concept document and its
companion specifications (EFS, Technical Spec, PDDS, EUXS). Handles the full
customer-through-loan-and-savings lifecycle for microfinance institutions,
susu operators, credit unions, and rural/community banks — with RBAC, an
approval workflow, a configurable business-rules engine, and a bulk data
migration path for onboarding companies that already have customers.

This is a working prototype under active development, not yet piloted with
real customer data.

## What's built

**Identity, Access & Institution Setup**
- Institution registration, gated behind a shared setup key (env var, not
  source-controlled) — the registration screen itself is invisible without
  it. Full 5-step onboarding: institution details, Head Office branch,
  staff invites, go-live.
- JWT access tokens (15 min) + refresh token rotation, silent refresh on
  expiry, real invite-token flow (7-day expiry) for new staff.
- RBAC: 8 system role templates (CEO, Branch Manager, Loan Officer, Credit
  Analyst, Credit Manager, Field Collector, Compliance Officer, System
  Administrator), 20+ permissions, branch-scoped and time-bound role
  assignments with delegation support.
- Every permission/role added to the platform automatically syncs to every
  existing institution on server boot — no manual re-seeding, no
  re-registering an institution to pick up a platform update.
- Department/Position as real, normalized lookup tables (not free text).

**Customers**
- Full lifecycle: Registered → KYC → Active → Dormant/Restricted/Suspended
  → Closed/Archived, with a reconciled 11-value status model.
- Next of Kin, Beneficiaries (allocation validated to never exceed 100%),
  Beneficial Owners, Joint Account Holders (6 roles, via Approval Workflow).
- AML/watchlist screening — a match hard-blocks the customer to BLACKLISTED
  and opens a compliance adjudication request, not a soft flag.
- PEP classification and CDD level (auto-derived from PEP status + risk
  rating, not independently settable).
- Live-computed KYC document checklist, checked against actual uploaded
  documents per customer segment — not a stored flag that can drift.
- Customer number (auto-generated), address, and mandatory branch
  assignment — added after auditing the EFS's Customer Registration
  requirements found these three genuinely missing.
- Document upload (Supabase Storage) with replace/version history.

**Loans**
- Flat and Reducing Balance amortization, generated from real product
  terms.
- Full initiation → approval → disbursement → repayment lifecycle, with
  segregation of duties enforced (can't approve what you initiated).
- Repayment allocation: oldest installment first, interest before
  principal — the same rule used everywhere it matters, including
  historical repayment replay during migration.
- Credit Assessment: a transparent, weighted risk score (debt-to-income,
  repayment capacity, customer risk rating, existing arrears), with
  existing arrears or a HIGH risk rating both forcing human review
  regardless of how clean the score otherwise looks. Credit Bureau checks
  are an honest manual attestation, not a fake integration — that needs a
  real contract with an actual bureau.
- Guarantor Management: registration/approval/release, guarantee limits
  enforced against loan principal.
- Collateral Management: registration/revaluation/release/realisation,
  gated to approved-or-later loans.
- Arrears Management: automatic daily classification (Current/1-30/31-
  60/61-90/90+) via a real scheduled job, Promise-to-Pay recording, and a
  genuine PAR30 calculation on the Loan report.
- Penalty Management: fixed or percentage penalties computed server-side
  from real arrears data, waivers requiring the same authorisation as loan
  approval.
- Restructuring, Rescheduling, and Write-Off — all three route through the
  Approval Workflow; restructure regenerates the remaining schedule using
  the same amortization function real disbursement relies on.

**Savings**
- Interest Management: 3 calculation methods (Daily Balance, Average Daily
  Balance, Minimum Monthly Balance), 4 rate types (Fixed, Tiered, Variable,
  Promotional), real Accrual/Posting/Suspension/Recalculation/Reversal
  workflow, not a live-only number.
- Deposit/withdraw with a full transaction ledger.

**Products**
- Versioned Product/ProductVersion with a real approval-gated activation
  flow — a product's own status honestly reflects an activation request in
  flight (Draft → Pending Approval → Active → Withdrawn → Archived).
- Interest rate tiers, promotional rate windows.

**Compliance & Audit**
- Watchlist management, AML adjudication via the Approval Workflow.
- Audit log: an entry on every mutating action across every module,
  search/filter, CSV export, and genuinely immutable at the database level
  (a Postgres trigger blocks any UPDATE/DELETE, not just "no route exposes
  it").

**Business Rules Engine**
- Configurable conditions (field/operator/value, AND/OR logic) and actions
  (Flag, Require Additional Approval, Reject), evaluated at 6 real trigger
  points: Loan Initiation, Loan Approval, Loan Disbursement, Savings
  Account Opening, Customer Creation, Employee Onboarding.
- Rule activation goes through the same Approval Workflow as everything
  else — a rule can't take effect without a different authorised user
  approving it than whoever wrote it.

**Data Migration**
- Bulk-onboard an existing company's Customers, Savings Accounts, and
  Loans via downloadable Excel templates — for institutions that already
  have customers, not just greenfield ones.
- Two Loan import methods: Opening Balance (clean start, remaining balance
  split across remaining installments) and Full History (real original
  schedule + every historical repayment replayed through the same
  allocation logic real-time repayments use).
- Dry-run validation with zero writes before an explicit, separate commit.
  Every imported record traceable to a batch, with a genuine undo action.

**Reporting**
- Loan, Savings, and Customer reports with branch breakdowns, date
  filtering, CSV export, and a KPI dashboard.

**Accessibility**
- WCAG AA color contrast (verified programmatically, not eyeballed),
  screen-reader-announced notifications, keyboard focus indicators,
  skip-to-content link, labeled navigation landmarks.

## Tech stack

- **API:** Node.js, Express, TypeScript, Prisma ORM, PostgreSQL (Supabase)
- **Web:** Next.js 14, TypeScript, Tailwind CSS
- **Storage:** Supabase Storage (customer documents)
- **Hosting:** Railway (API + Web), Cloudflare
- **Deployment:** GitHub → Railway CI/CD, auto-deploy on push to `develop`

## Running it

**Prerequisites:** Node.js 18+, a Postgres database (the project's own
Supabase instance, or your own).

**1. API — terminal 1:**
```bash
cd api
cp .env.example .env
```
Set `DATABASE_URL` in `.env` to your Postgres connection string, keeping
`?schema=nexus` on the end. Also set `SUPERUSER_SETUP_KEY` — a value only
you know, required to register a new institution (this gate went in after
institution registration was found to be publicly reachable with no
restriction at all).
```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```
`npm run dev` starts the API at `http://localhost:4100`, under `/v1` — the
frontend already knows this, no separate configuration needed. Every
permission/role sync also runs automatically on this boot, so `npm run
seed` is a convenience for syncing on demand, not a required manual step
after every change.

**2. Web — terminal 2:**
```bash
cd web
npm install
npm run dev
```
Starts the frontend at `http://localhost:3100`.

**3. Try it:** visit
`http://localhost:3100/onboarding?key=<your SUPERUSER_SETUP_KEY>` — the
registration screen is invisible without the key in the URL, and the
backend rejects the request regardless of what the frontend shows if the
key doesn't match. Fill in the form, submit, and you'll land on the
dashboard as the institution's Chief Executive Officer, with the other 7
system roles already seeded and ready to assign.

**If something breaks:**
- `prisma migrate dev` fails to connect → check the connection string and
  Supabase's connection pooling / IP allowlist settings.
- Registration form redirects straight to `/login` → you're missing
  `?key=...` in the URL, or the key doesn't match `SUPERUSER_SETUP_KEY`.
- Web app shows a fetch/network error → the API isn't running, or
  `NEXT_PUBLIC_API_URL` doesn't match where it's actually listening.

## Not yet built

A full EFS compliance audit (`docs/efs-compliance-audit.md`, ~110 sections
checked requirement-by-requirement) drives an active 9-phase build plan,
directly grounded in a real pilot partner's actual Operations Supervisor
job schedule — each phase maps to something that role genuinely needs day
to day, not a generic feature list.

**Phase 1 (Loan Servicing, EFS §64-77) is complete** — Credit Assessment,
Guarantor, Collateral, Arrears, Penalty, Restructuring, Rescheduling,
Write-Off, all real and tested, described above.

**Remaining phases:**
- **Phase 2 — Collections in full** (EFS §78-85). The hardest remaining
  piece in the whole roadmap: offline-capable field collection with local
  storage, sync, and conflict resolution is genuine, substantial
  engineering, not a quick add.
- **Phase 3 — Savings completeness**: fees/charges, account restrictions,
  standing instructions, statements.
- **Phase 4 — Cash & Vault Management** (EFS §111-115) — cashbook,
  withdrawal book, petty cash, vault book, treasury book, cheque tracking.
- **Phase 5 — General Ledger** (EFS §116-125).
- **Phase 6 — Payroll** (EFS §206-215) — salaries, GRA, SSNIT, Tier 2.
- **Phase 7 — Asset Management** (EFS §186-195) — fixed asset register.
- **Phase 8 — Ghana regulatory reporting** (BOG, GDPC, GAMC, TMA) —
  deliberately blocked on the pilot partner furnishing the real official
  templates; building against a guessed format would create false
  confidence in compliance that isn't real.
- **Phase 9 — remaining Customer/cross-cutting gaps** from the audit
  (customer merge workflow, consent management, advanced search, etc.).

**Also open, outside the 9-phase roadmap:**
- Optimistic-locking conflict rejection has a fully working backend
  (Customer/Employee/Role reject a stale update with a 409), wired into
  those same three edit forms on the frontend.
- Notification multi-channel (SMS/Email/WhatsApp) — in-app only today;
  needs a provider decision before the integration itself can be built.
- MFA / enhanced security controls — parked pending a dedicated Enterprise
  Security Specification.
- Scheduled/automated Savings interest posting — currently staff-
  triggered; the scheduler infrastructure now exists (built for Loan
  Arrears) but hasn't been wired to this yet.

## Design decisions worth flagging

- Institution registration is gated behind a shared setup key held only as
  an environment variable, checked server-side — not a hardcoded email
  allowlist (which would need a code deploy to change) or a permanent
  on/off toggle (which would either block legitimate use or leave the door
  open indefinitely).
- Every table carries PDDS-mandated audit columns (`created_by`,
  `updated_by`, `version_no`, soft-delete via `deleted_at`), populated
  automatically by a Prisma middleware reading the logged-in user from
  request-scoped storage — no route handler sets these manually.
- Refresh tokens are stored as SHA-256 hashes, never plaintext.
- The first genuine scheduled-job infrastructure (node-cron, running
  inside the existing long-lived API process — no separate worker needed
  at this scale) was built for daily loan arrears classification, and now
  unblocks other previously scheduler-dependent gaps (Savings dormancy,
  KYC expiry, watchlist re-screening) as their own bounded future
  additions on the same pattern.
- Loan amortization and repayment-allocation logic live in one shared
  library, used by both real-time repayments and Data Migration's
  historical-repayment replay — not two implementations that could drift
  apart.
- Data Migration's "undo" is a genuine, direct removal from active use,
  deliberately bypassing the normal close/archive business rules — those
  exist to stop a live customer closing an account with money in it, and
  would block undoing exactly the imports most likely to need it.
