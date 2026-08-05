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
- Fees & Charges: configurable fee types, amounts always computed from the
  fee type's own configuration (never trusted from the request), waivers
  requiring authorisation.
- Account Restrictions: genuinely enforced at the real deposit/withdraw
  endpoints — a FULL_FREEZE, DEBIT_RESTRICTION, or CREDIT_RESTRICTION
  actually blocks the matching transaction, not just displayed in the UI.
  Both creation and removal route through the Approval Workflow.
- Standing Instructions: Internal Transfer, Loan Repayment, and Scheduled
  Withdrawal genuinely executed daily by the scheduler, with a tested
  retry-and-auto-suspend policy for insufficient balance. External
  Transfers and unsourced Scheduled Deposits deliberately not built — no
  real payment rails or funding source exist.
- Statements: real generated PDFs, opening balance reconstructed from
  actual transaction history, a permanent snapshot so a historical
  statement always shows the same figures even if the account changes
  later.

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

**Collections**
- Collector Management: registration (a role on existing Employees, not a
  duplicate record), branch transfers, suspension/reinstatement.
- Route Management: customer assignment with real conflict prevention — a
  customer already on an active route can't be silently double-booked.
- Daily Collection Processing: field-recorded savings deposits and loan
  repayments, unique transaction numbers, duplicate-collection prevention,
  authorised reversal.
- Reconciliation: expected cash always computed from real recorded
  transactions, not self-reported; any variance routes through the
  Approval Workflow, zero-variance settlements auto-reconcile.
- Commission Management: configurable structures (percentage or fixed),
  commission calculated from real completed collections for the actual
  period, payment requiring approval.
- Reporting: Daily Collection, Collector/Route Performance, Cash
  Settlement, Exceptions, Commission — all from genuinely recorded data.

**Cash & Vault**
- Vault Management: open/close, direct cash receipts/withdrawals gated to
  OPEN vaults with real balance checks.
- Teller Management: a role on existing Employees, cash limits, suspend/
  reinstate.
- Cash Transfer Management: every transfer routes through the Approval
  Workflow, source balance re-checked at approval time (not just request
  time), balanced entries on both sides in one database transaction,
  completed transfers structurally unalterable.
- Cash Balancing and Reconciliation: expected amount always the real live
  balance, a variance without investigation notes rejected server-side,
  and vault close structurally gated on a same-day reconciled balancing
  record.

**Reporting**
- Loan, Savings, Customer, and Collections reports with branch
  breakdowns, date filtering, CSV export, and a KPI dashboard. Cash &
  Vault data is fully captured (ledger entries, transfers, balancings)
  but doesn't have its own dedicated report page yet.

**General Ledger**
- Chart of Accounts, Journal Management, and Ledger Posting: a real
  double-entry engine. Debit=credit and standard balance-effect logic
  (which side of which account category a debit vs. credit increases)
  tested against 14 scenarios, including a real accounting scenario,
  before touching a route.
- Financial Period Management: closed/locked periods block journal
  creation and are re-checked again at posting-approval time, not just
  at creation.
- Recurring Journal Management: templates activated via the Approval
  Workflow, each scheduled execution posts a real journal automatically,
  respecting period status and account activity, with a tested retry-
  and-auto-suspend policy.
- Financial Statement Management: Trial Balance, Statement of Financial
  Position, Statement of Comprehensive Income, and Statement of Changes
  in Equity — all computed from real posted journal history for the
  exact date or period requested, not today's live balances relabeled as
  historical. Cash Flow and Consolidated Statements deliberately not
  built — real classification data and a multi-entity model don't exist
  yet, and faking either would mean presenting invented numbers as
  authoritative.
- A standardized 34-option report date-range set (Today, This Quarter,
  Last Month, Next 3-Months, and so on through a custom date entry),
  correctly distinguishing calendar-aligned periods from rolling windows
  — tested against 27 date-math scenarios including leap years and
  year-boundary rollovers. Built as a shared, reusable component
  available platform-wide, currently used by Financial Statements;
  retrofitting the Loan/Savings/Collections reports to the same standard
  is real, separate work still ahead.
- GL Reporting: Account Activity Report (a per-account statement with a
  running balance), Branch and Period breakdowns, and an Executive
  Dashboard. Report generation is genuinely audited — a gap that existed
  across every report in the platform until this pass closed it here.
- Inter-Branch Accounting: transfers as real balanced journals via Due
  To/Due From settlement accounts, Approval Workflow, and a genuine
  reconciliation invariant — every branch's settlement balance, summed
  across the institution, must net to exactly zero — surfaced directly
  on the Outstanding Balances report.
- Financial Analytics: Revenue/Expense/Profitability trends over time,
  Branch Performance with a real profitability angle, and a Net Income
  forecast using a disclosed simple linear trend — labeled exactly as
  that, not dressed up as anything more sophisticated.
- Not yet wired: automatic posting from Savings, Loans, or Cash & Vault
  into the GL (a real, separate integration effort). Product
  Profitability, Cost Centre Analysis, and Budget Variance Analysis all
  need a data dimension (product/cost-centre tagging, a real budget-entry
  feature) that doesn't exist yet — named honestly rather than faked.
  AI-Based Financial Insights waits on the AI spec.

**Payroll** — complete, all 10 sections
- Payroll Configuration: calendars, periods (with real overlap
  prevention), salary grades, pay groups, earning/deduction codes,
  overtime rules.
- Salary Structure Management: employee compensation via the Approval
  Workflow, a new active structure genuinely supersedes the old one
  rather than editing it — compensation history for free. Real frontend
  form for creating structures with allowances and deductions.
- Allowance and Deduction Management: EmployeeDeduction genuinely
  reduces net pay in the processing engine. Loan Deductions are a real,
  working manual recurring deduction — not an automatic link to a
  tracked staff-loan system, since none exists in this schema.
- The real calculation engine: PAYE and SSNIT/Tier 2, tested exactly
  against the GRA's own published cumulative-tax figures at every band
  boundary, not just internally consistent. Confirmed 2026 rates: 7-band
  monthly PAYE table, SSNIT Employee 5.5%, SSNIT Employer (Tier 1) 8%,
  Tier 2 Employer 5%, insurable earnings ceiling GHS 69,000/month,
  minimum GHS 587.79/month.
- Real frontend forms for creating and activating tax tables (dynamic
  band rows) and statutory rates (name-locked to prevent a typo breaking
  the processing engine's exact-name matching) — since these figures
  genuinely change annually, this is a form submission each year, not a
  script or a code change.
- Payroll Approval and Disbursement: a run genuinely requires a separate
  approver before payment (Processed → Pending Approval → Approved →
  Paid). Employee bank account fields, a generic disclosed bank file CSV
  export, honest manual payment confirmation, run reversal. Mobile Money
  Payments deliberately not built — no payment provider integration
  exists, same disclosed gap as SMS/Email.
- Payslip and Employee Self-Service: real PDF payslips, visually
  verified before shipping. Employee identity always derived from the
  authenticated user's own linked record — a genuinely different,
  self-scoped access model, not an admin permission gate. Annual tax
  certificate and contribution statement summaries.
- Payroll Accounting — the first real GL auto-posting integration in the
  whole platform. Two genuine journals per run: an accrual journal at
  approval (real expense against real liabilities), a settlement journal
  at payment (liability settled against cash). GL account mapping is
  configurable per institution, not hardcoded. Reconciliation compares
  the posted journal's actual totals against the run's own entries.
- Reporting and Analytics: summary totals, department and branch cost
  breakdowns (using each employee's real department/branch), 6-month
  trends.
- Duplicate payroll processing for the same period blocked by a real
  database constraint. Exactly one tax table and one of each named
  statutory rate can be active at a time.
- Not built, named honestly: Cost Centre Analysis and per-department GL
  posting splits (need a schema dimension that doesn't exist), Mobile
  Money Payments (no provider integration), AI-Based Payroll Insights
  (pending the AI spec).

**Asset Management** — complete, all 10 sections
- Full lifecycle: registration (with real GPS capture at intake),
  category-configurable depreciation defaults, allocation to employees/
  departments/branches with a permanent history, transfer via the
  Approval Workflow, maintenance scheduling with an overdue-items
  report, disposal via the Approval Workflow with automatic gain/loss
  calculation, physical verification with automatic variance flagging.
- Depreciation: straight-line and reducing-balance, both configurable
  per category or per asset. Both methods genuinely reach exact
  residual value by end of useful life via a proper final-period
  true-up — reducing-balance alone asymptotically approaches but never
  exactly reaches residual value within a finite life, a real
  accounting characteristic caught and fixed during testing.
- Real camera-based QR/barcode scanning (`getUserMedia` + `jsQR`) and
  real GPS capture (`navigator.geolocation`) — genuine browser APIs,
  not a stored-value-only shortcut.
- Three GL auto-posting integrations (acquisition, depreciation,
  disposal), bringing the platform's total to five, all using the same
  configurable, name-matched mapping pattern proven for Payroll.
- Not built, named honestly: Cost Centre allocation splits (same schema
  gap as Payroll's), full Procurement-workflow integration (no
  standalone Procurement module exists — acquisitions record directly),
  AI-Based Asset Insights (pending the AI spec).

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

**Phase 2 (Collections, EFS §79-83 + real §85) is complete for everything
currently achievable** — Collector Management, Route Management,
Daily Collection Processing, Reconciliation, Commission Management, and
Reporting, all described above. Two pieces deliberately deferred, both
named clearly rather than silently dropped:
- **§84 Offline Collection Management** — genuine offline capability
  (local encrypted storage, background sync, conflict resolution) is its
  own dedicated PWA effort. Next.js supports PWA directly; this needs
  focused work on that foundation, not a bolt-on to the current
  server-dependent pages.
- **§85.2-3 AI-Based Insights / Predictive Forecasts** — waiting on a
  dedicated AI spec document (in progress, alongside ESS — done — and
  EUXS — in progress). These will be Claude API-backed features, not
  custom ML infrastructure.

**Phase 3 (Savings completeness, EFS §53/54/58/59) is complete** — Fees &
Charges, Account Restrictions, Standing Instructions, Statements, all real
and described above.

**Phase 4 (Cash & Vault Management, EFS §111-115) is complete** — Vault
Management, Teller Management, Cash Transfer Management, Cash Balancing
and Reconciliation, all real and described above. Petty cash and treasury
book as named EFS sub-concepts are covered by the same Vault ledger
mechanism rather than separate models — a petty cash fund is a vault with
a smaller balance, not a structurally different thing.

**Phase 5 (General Ledger, EFS §116-125) is complete, all 8 sections** —
Chart of Accounts, Journal Management, Ledger Posting, Financial Period
Management, Recurring Journal Management, Financial Statement
Management, GL Reporting, Inter-Branch Accounting, and Financial
Analytics all real and described above. Not yet wired: automatic posting
from every other module into the GL (§116.4's full integration — a
genuinely separate, later effort), and AI-Based Financial Insights within
§125 specifically, pending the AI spec.

**Phase 6 (Payroll, EFS §206-215) is complete, all 10 sections** —
Payroll Configuration (§207), Salary Structure Management (§208),
Allowance and Deduction Management (§209), the Processing engine
(§210/§212, PAYE and SSNIT/Tier 2), Approval and Disbursement (§211),
Payslip/Self-Service (§213), Payroll Accounting (§214, the first real
GL auto-posting integration), and Reporting/Analytics (§215) all real
and described above. Not built within it: Cost Centre Analysis (needs a
schema dimension that doesn't exist), Mobile Money Payments (no provider
integration), AI-Based Payroll Insights (pending the AI spec).

**Phase 7 (Asset Management, EFS §186-195) is complete, all 10
sections** — full lifecycle, depreciation (both methods, tested
including a genuine final-period true-up fix), disposal with real
gain/loss calculation, real camera/GPS capture, and three more GL
integrations, all described above. Not built within it: Cost Centre
allocation splits, full Procurement-workflow integration, AI-Based Asset
Insights (pending the AI spec).

**Remaining phases:**
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

**Identified via the Operations Supervisor functional realignment
document (4 Aug 2026), not yet in any phase — noted for later
integration, not forgotten:**
- **Cheque verification/tracking** — Cash & Vault Management (Phase 4)
  covers cashbook, vault, and petty cash genuinely well, but cheque-
  specific handling (verification, register, clearing status) was never
  built as its own thing. Natural fit: an addition to Phase 4's existing
  Cash & Vault module.
- **Complaint Resolution / customer follow-up** — no complaints or
  grievance tracking exists anywhere in the platform today. A real,
  distinct gap from Customer onboarding (which does exist). Natural fit:
  an extension of the Customer module.
- **HR attendance, discipline, and performance tracking** — Employee
  records exist (StaffX), but day-to-day attendance/scheduling/discipline
  as dedicated features don't. Natural fit: an HR-focused addition,
  possibly alongside Payroll (Phase 6) given the shared HR data.
- **Internal audit findings/remediation tracking** — the Audit Log is
  comprehensive and immutable, and the Approval Workflow enforces
  segregation of duties, but there's no structured "finding → remediation
  → close-out" workflow, which is a different thing from a transaction
  log. Natural fit: a standalone Internal Control module.
- **Consolidated portfolio/credit-performance dashboard** — PAR30 and
  arrears classification exist at the loan level (§77); a rolled-up,
  institution-wide portfolio-quality view specifically doesn't. Natural
  fit: an extension of Financial Analytics (§125) or its own Credit Risk
  reporting view.
- Business Development & Sales (prospecting, market development, sales
  pipeline) was reviewed and judged genuinely out of scope for a core
  banking backend unless explicitly requested as a dedicated CRM/pipeline
  feature — not treated as a gap, a deliberate scope boundary.

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
