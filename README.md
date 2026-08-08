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
- **Multi-factor authentication** — TOTP (RFC 6238), client-side QR
  generation (the secret never leaves the browser to a third party),
  one-time backup codes. Voluntary self-service via Settings, or
  mandatory when a role has `requireMfa` set — enforcement is real, not
  advisory: a role-required-MFA login can't obtain a full session
  without MFA actually verified, via the same pending-token pattern used
  for the ordinary MFA login step.
- **Account lockout** — 5 failed attempts locks for 30 minutes (disclosed
  default, `docs/security-policy-defaults.md`), checked before password
  comparison even runs.
- **Password policy** — 12-character minimum, last-5-password reuse
  blocked against real history, 90-day expiry, all disclosed defaults.
  Self-service change-password in Settings.
- **Trusted devices** — 30-day MFA-skip window, only grantable
  immediately after a device has already passed MFA once (can never
  bootstrap trust on a first login), password still required every time
  regardless. Self-service list/revoke in Settings. Disclosed honestly:
  a client-supplied fingerprint, not a hardware-backed guarantee.

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
  requirements found these three genuinely missing. That fix only
  reached the manual "Create customer" form at first; Data Migration
  kept creating customers with no number and no branch until a second,
  separate pass caught and closed the same gap on the bulk path.
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
- **Automated, not just staff-triggered**: accrual runs daily across
  every institution's active accounts; posting runs automatically
  monthly on the 1st (a disclosed cadence — matches how
  AVERAGE_DAILY_BALANCE/MINIMUM_MONTHLY_BALANCE already compute per
  calendar month; no working document specifies a posting frequency).
  Manual `/accrue`, `/accrue-all`, `/post`, `/post-all` unchanged for
  out-of-cycle corrections.
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
- Bulk-onboard an existing company's Customers, Next of Kin, Beneficiaries,
  Beneficial Owners, Consent Records, Savings Accounts, and Loans via
  downloadable Excel templates — for institutions that already have
  customers, not just greenfield ones.
- Customer import requires Branch (matched against the institution's real
  branches, not free text) the same way the manual creation form always
  has — there is no "unassigned" customer state Data Migration is allowed
  to produce. Every created customer gets a real, generated customer
  number, same generator the manual form uses. A phone-number collision at
  commit time (the database's own unique constraint, not just an
  application check) resolves to an update of the existing customer rather
  than a failed row.
- Two Loan import methods: Opening Balance (clean start, remaining balance
  split across remaining installments) and Full History (real original
  schedule + every historical repayment replayed through the same
  allocation logic real-time repayments use).
- Dry-run validation with zero writes before an explicit, separate commit.
  Every imported record traceable to a batch, with a genuine undo action.
- Document upload is deliberately not part of migration — identity
  documents, proof of address, and photographs are files, not spreadsheet
  data, and get uploaded per-customer after migration.

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

**Customer Data Quality** — complete
- Search: multi-field (customer number, name, phone, email, ID number),
  plus QR/barcode lookup reusing the exact camera scanner built for
  Asset Management. "Fuzzy" matching is honest, disclosed ILIKE partial
  matching — `pg_trgm` isn't confirmed enabled on the database, so true
  trigram similarity isn't claimed.
- KYC Risk Scoring: a real, disclosed default methodology built on the
  institution's existing compliance fields (PEP status, watchlist flag,
  CDD level, KYC status), with a visible component breakdown per
  customer, the same "show the reasoning" pattern as the loan credit
  score. The specific weights are a sensible starting default, not a
  confirmed regulatory figure — flagged for review against the
  institution's actual risk policy.
- Customer Merge: the highest-stakes feature in this build. Detects
  likely duplicates via real, deterministic similarity scoring (ID
  number, phone, email, name), then merges via the Approval Workflow —
  atomically reassigning every one of the 10 models that genuinely
  reference a customer (Loan, SavingsAccount, Document,
  CollectionTransaction, and more) inside a single database transaction.
  Either everything reassigns correctly or nothing does. Rollback
  reverses the exact captured list of what moved, not a guess.
- Consent Management: real capture, withdrawal, and permanent history —
  no delete route exists for consent records at all.

**Cheque Register** (Ops Supervisor role schedule — "monitor and confirm
outgoing cheques daily and during disbursements" — built as a standard
complete register, not limited to that one line; not named in the ECD/
EFS/ETAS/PDDS/ESS at all)
- Both directions (inward customer deposits, outward institution-issued
  — loan disbursements, vendor payments), real clearing lifecycle
  (received/issued → pending clearing → cleared/bounced, plus stop and
  cancel), optional cross-reference to customer/savings account/loan.
- The doc's actual named task — a daily "confirm" step distinct from
  clearing status — with a dedicated pending-confirmation view.
- A tracking/audit register, not a money-mover: clearing a cheque here
  doesn't itself create a transaction or touch a loan's disbursed date;
  those stay whatever workflow already handles the real deposit/
  disbursement.

**Customer Interactions & Complaints** (EFS §157 Customer Interaction
Management + §160 Customer Complaint Management — both genuinely named
in the working documents)
- Interactions: channel-typed (call, branch visit, email, SMS, live
  chat, social media, meeting), follow-up scheduling and completion
  tracking — directly covers the Ops Supervisor doc's actual task
  ("make follow-up calls on loan defaulters and weekly payment
  clients"). History can't be deleted (§157.3), by design.
- Complaints: unique auto-generated reference numbers, classification,
  priority, case assignment, investigate → resolve → close lifecycle.
- SLA targets (24h Critical / 48h High / 5 days Medium / 10 days Low)
  and automatic escalation are disclosed defaults — §160.3 says both are
  "configurable" but specifies no actual values. Escalation is a real
  daily scheduler check against those defaults, not a rule engine.

**HR — Attendance, Performance, Disciplinary** (EFS §201 Attendance
Management + §203 Performance Management; ETAS §41.4 names
DisciplinaryCase as an owned entity though EFS gives it no detailed
business rules)
- Attendance: clock-in/out, one record per employee per day. §201.3's
  "corrections require approval" is real — routes through the existing
  Approval Workflow, proposed times only overwrite the record once
  approved.
- Performance: goal setting, self-assessment → manager-assessment →
  completed lifecycle, ratings, development plans.
- Disciplinary: open → investigating → resolved → closed, defined
  action taken (verbal/written/final warning, suspension, termination).
  Deliberately no automatic escalation — ECD §43.11 names disciplinary
  actions as requiring human judgement, unlike complaint SLA breaches.
- Named gaps, not silently dropped: Shift Management and Biometric
  Integration (both in EFS §201.2) aren't built — no roster concept
  exists, no biometric hardware/SDK integration exists.

**Internal Audit** (EFS §298 Audit Findings and Recommendation
Management + §299.2 Overdue Action Monitoring; ETAS §78 Audit Entity
Architecture)
- Audit engagements with a real named lifecycle (planned → approved →
  in progress → under review → completed → follow-up → closed →
  archived), scope approval routes through the Approval Workflow
  (ETAS §78.7's "every audit shall have an approved scope").
- Findings: unique reference numbers, risk classification, root cause,
  recommendation, management response, accountable owner. Closure is
  genuinely blocked — not just documented — until every finding on an
  engagement has an owner assigned.
- Implementation Verification is a distinct step from marking a
  recommendation implemented (§299.2), not just a status label — someone
  other than the implementer confirms it actually addressed the finding.
- Overdue findings flagged by a daily scheduler check, same
  disclosed-default pattern as complaint escalation.
- Deliberately scoped to findings/remediation, not the full §297 Audit
  Planning and Execution (no audit universe, annual risk-based planning,
  or team assignment) — a real, disclosed boundary.

**Loan Portfolio Dashboard** (EFS §76 Loan Portfolio Management + ECD
§64.10 Portfolio at Risk (PAR) — matches the Ops Supervisor doc's
explicit "PAR Benchmark adherence" line)
- No new schema — pure read-only aggregation over existing loan data.
  PAR30/PAR90 use the same `arrearsClassification`/`daysInArrears`
  fields the daily arrears scheduler already keeps current, so this can
  never silently disagree with the arrears system.
- Overview (outstanding, loan count, PAR30/PAR90), aging distribution,
  by-branch, by-product, top-10 borrower concentration.
- Named gaps: Sector Analysis and Officer Performance (both in EFS
  §76.3) aren't built — no sector field exists on Customer, no
  loan-officer assignment field exists on Loan.

**Capital Adequacy** (Act 930 §29 + BOG Capital Requirements Directive,
2018 + BOG Guidelines on Credit Concentration Risk, 2025 — all three
built from the actual uploaded source documents, not invented)
- Real CET1/Tier 1/Total CAR calculation: risk-weighted assets computed
  from real loan data (BOG CRD Table 2A categories — retail-qualifying-
  proxy 75%, SME/corporate 100%, past-due unsecured 150%/100%/0% per
  §142) plus GL accounts tagged with a Basel risk weight for everything
  else on the balance sheet. Regulatory capital comes from GL accounts
  tagged by capital tier (CET1/Additional Tier 1/Tier 2), with the same
  admissibility caps the CRD specifies (AT1 ≤1.5% of RWA, Tier 2 ≤2.0%
  of RWA).
- Point-in-time snapshots, not just a live dashboard number — real audit
  practice needs to show what CAR was on a specific reporting date.
- NPL ratio against the actual current regulatory ceiling: 5% for
  microfinance firms specifically (BOG Governor's directive, reported 5
  Aug 2026), not the general 10% SDI/bank ceiling.
- Credit concentration risk: HHI, Gini coefficient, and top-N
  concentration ratios (5/10/20/25/50/75) — the model-free (heuristic)
  metrics the Guidelines name as legitimate on their own. The formal
  Pillar II PD/LGD/EAD capital-add-on modeling in the same document is
  explicitly bank-only and not built.
- Disclosed, named gaps (not silently dropped): loan classification
  day-count boundaries beyond the confirmed >90-day past-due threshold
  are a convention, not from the uploaded CRD; "qualifying retail"
  status is a simplified proxy (individual customer + loan ≤ GHS
  500,000 — the one criterion checkable from existing data); mortgage-
  specific past-due treatment (CRD §144-145) isn't applied.

**Notifications** (EFS §249 External Service Connectors — names SMS/
Email Providers as required categories, no vendor)
- Resend (email), Hubtel (SMS), Meta's WhatsApp Cloud API directly
  (Hubtel's WhatsApp offering isn't in their public docs the way SMS
  is — Meta's Cloud API is the well-documented standard path underneath
  virtually every WhatsApp Business integration anyway). Every provider
  endpoint/auth shape verified against current public documentation
  before writing any code, not guessed.
- Configurable per-institution connectors with encrypted credentials
  (same AES-256-GCM helper already used for MFA secrets), every send
  attempt logged (success or failure — a failure also writes an
  AuditLog entry per §249.3's alerting requirement).
- Closes a real, quietly-accumulating gap: `CustomerComplaint.resolve`'s
  `customerNotified` flag used to just set a timestamp with no message
  ever sent. Now genuinely sends (SMS first, email fallback, respecting
  the customer's own preference toggles that already existed but had
  never been read for an outbound send) — `customerNotifiedAt` only
  sets on confirmed delivery, not intent.
- WhatsApp sends always go through Meta's required pre-approved-
  template path, not free-form text — a real constraint (business-
  initiated messages outside a live 24-hour conversation window need a
  template approved in Meta's WhatsApp Manager), disclosed on the
  Notifications settings page itself, not glossed over.

**Reports Module** — a second-look pass across the whole module,
prompted directly rather than assumed complete
- **A real correctness bug found and fixed**: the Loans Report was
  computing PAR from raw `principal` (not actual outstanding balance)
  and inferring "at risk" from arrears-bucket labels instead of the
  `daysInArrears > 30` test directly — it could show a different PAR
  than the Portfolio Analytics dashboard for the same institution at
  the same moment. Fixed by extracting one shared calculation
  (`lib/portfolio.ts`) both now import, so they can't drift apart again.
- Four new reports for this session's modules, matching the existing
  date-range/CSV-export convention exactly: Cheque Register (volume,
  bounce rate, pending confirmation), Customer Care (interaction/
  complaint volume, resolution time, escalation rate), HR (attendance
  corrections, performance completion, disciplinary outcomes), Internal
  Audit (findings by risk, overdue rate, unassigned-owner count).
- Reports hub updated to list all 8 report pages plus links to Capital
  Adequacy and Financial/Portfolio Analytics — both already dedicated
  live dashboards, linked for discoverability rather than duplicated as
  static reports.

**Accessibility**
- WCAG AA color contrast (verified programmatically, not eyeballed),
  screen-reader-announced notifications, keyboard focus indicators,
  skip-to-content link, labeled navigation landmarks.

## Tech stack

- **API:** Node.js, Express, TypeScript, Prisma ORM, PostgreSQL (Supabase)
- **Web:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS
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

**Phase 9 (cross-cutting Customer gaps) is complete** — Customer Search
(§25, multi-field, QR/barcode reusing the Asset scanner, honest ILIKE
fuzzy matching), KYC Risk Scoring (§29, a real disclosed default
methodology built on existing compliance fields, tested, explicitly
flagged as needing review against the institution's actual risk
policy), Customer Merge (§35, atomic reassignment across all 10
customer-referencing models inside a real database transaction, with
exact rollback — the highest-stakes piece in this entire build),
Consent Management (§43, immutable records, real withdrawal).

**Phase 8 (Ghana Regulatory Reporting) built against the actual Bank of
Ghana "Guide for Financial Publication" document** — the four core
statements (Balance Sheet, Income Statement, Changes in Equity, Trial
Balance) already existed from Phase 5; genuinely new here: a Cash Flow
Statement (a previously-named gap, closed via a real reconciliation
invariant — operating + investing + financing must equal the actual
change in cash, tested before use) and BOG's NPL and Liquidity ratios,
NPL using BOG's own documented 90-day default definition rather than an
unconfirmed bucket mapping. Capital Adequacy Ratio and IFRS 9
expected-credit-loss disclosures were left unbuilt at the time pending
real methodology — both since built (see the Capital Adequacy section
below) once GM supplied the actual BOG Capital Requirements Directive
and Act 930 text, rather than an invented approach.
GDPC returns stay a named gap — the actual format sits behind their
member-only portal, not publicly available.

**All 9 phases of the original roadmap now have real, substantive
work.** What remains across the whole platform is a set of named,
disclosed boundaries — not a blocked or unstarted phase. See "Also
open" below for the full list.

**Also open, outside the 9-phase roadmap:**
- GDPC (Ghana Deposit Protection Corporation) premium/deposit returns —
  confirmed the actual format sits behind their member-only portal, not
  publicly available.

**Resolved since the list above was last accurate:**
- **GitHub Dependabot: was 36 vulnerabilities (20 high, 14 moderate, 2
  low), now 0** on both `api` and `web` (confirmed via `npm audit`
  directly, both workspaces, real numbers not GitHub's cache — GitHub's
  own dashboard count updates on a delay after a push). Root cause
  turned out to be 3 packages carrying stacked historical advisories,
  not 36 independent problems: `next` (21 individually-numbered GHSAs,
  matching GitHub's "21 high" exactly), its transitive `postcss` (4
  more), and `xlsx` (2, on the API side). Fixed by upgrading `next`
  14→16.3.0 and `react`/`react-dom` 18→19 — verified first that the
  real Next 16 breaking changes (async `params`/`searchParams`, Pages
  Router removal) don't apply here: no `pages/` directory anywhere, and
  every dynamic route already uses the client-side `useParams()` hook,
  not the affected server-component prop pattern. Full production build
  verified across all 53 routes before shipping. `xlsx`'s fix is CDN-
  hosted (SheetJS stopped publishing patched versions to the npm
  registry) — `package.json` now points at the real fixed tarball.
- **Optimistic-locking — two real gaps found and closed, not just
  documented coverage.** Branch's frontend has been sending
  `expectedVersion` on every update since it was built, but the backend
  silently ignored it and always overwrote — the UI implied protection
  that didn't actually exist server-side. Business Rules had zero
  version checking on the backend and no edit UI on the frontend at
  all (rules could only be created, activated, or retired — never
  edited, despite the backend's own DRAFT-only-editing business rule
  implying an edit path should exist). Both fixed: real `checkVersion`
  enforcement on both PATCH endpoints, and a full DRAFT-only edit UI
  built for Business Rules. Customer/Employee/Role remain the other
  three genuinely-covered forms.
- Notification multi-channel (SMS/Email/WhatsApp) — built. See
  **Notifications** below.

**Everything the Operations Supervisor role schedule (4 Aug 2026) named
is now built** — cheque register, customer interactions/complaints, HR
attendance/performance/disciplinary, internal audit findings, and the
consolidated portfolio dashboard, all described above with their
disclosed gaps named inline rather than silently dropped. Business
Development & Sales (prospecting, market development, sales pipeline)
was reviewed and judged genuinely out of scope for a core banking
backend unless explicitly requested as a dedicated CRM/pipeline
feature — not treated as a gap, a deliberate scope boundary.

## UX and platform-wide work (outside the module list above)

- **Role-based mobile bottom nav** — Dashboard/Customers/Loans/Savings
  fixed for everyone, a 5th slot chosen from the person's actual
  `Role.category` (a real enum, not name-matching against something
  literally called "CEO"): EXECUTIVE gets Approvals, GOVERNANCE gets
  Internal Audit, OPERATIONAL gets Cash & Vault, TECHNICAL gets Audit
  Log, CUSTOMER gets Customer Care.
- **Dashboard redesign** — a "needs your attention" strip (pending
  approvals, escalated complaints, overdue audit findings, cheques
  pending confirmation), portfolio health and regulatory snapshot
  (reusing the Portfolio Analytics and Capital Adequacy endpoints, no
  new backend aggregation), live cash position, a quick-access tap grid
  for every module. Numbers count up on load and sections fade in on a
  staggered sequence, both skip entirely under `prefers-reduced-motion`.
- **Settings page** — voluntary MFA setup/disable and change-password,
  which existed as endpoints with no UI until now; trusted-device
  list/revoke, a capability that didn't exist at all before this (trust
  was previously only set at login, with no way to see or undo it).

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
