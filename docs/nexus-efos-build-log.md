# Nexus EFOS — Build Log
**Repo:** github.com/ayivi-solutions/nexus-efos (`develop` branch)
**Live:** app.ayivisolutions.com / api.ayivisolutions.com

This is the single continuous, chronological record of what was actually built, why, what it's grounded in, and what broke along the way — consolidated from what were previously four separate dated documents. This file and the companion progress tracker are updated together going forward; no more new dated files per session.

---

## 21 Jul 2026

### Production deployment (Railway + Cloudflare)
Set up two Railway services — `nexus-api` (Express, root `api/`) and `nexus-app` (Next.js, root `web/`) — both auto-deploying off `develop`. Real issues hit and fixed: two HIGH-severity CVEs in `next@14.2.15` forced a bump to `14.2.35`; `web/package.json`'s `start` script was hardcoded to `-p 3100` instead of Railway's dynamic `$PORT`; a domain got attached to the wrong service initially; `WEB_ORIGIN` briefly held two origins joined by `;`, which the `cors` package doesn't support. Cloudflare CNAMEs added for `api.`/`app.` without touching existing DNS/MX records.

### Mobile-first shell — the real fix, not a patch
First attempt was a desktop sidebar with a bolted-on hamburger drawer. Went back to the original concept document's own interactive prototype and found it already defines a genuine mobile-first shell: fixed top bar, a bottom tab bar as primary navigation, a drawer that only becomes a persistent sidebar at `960px`. Rebuilt `AppShell.tsx` to match exactly. The bottom tab bar is role-aware — computed per logged-in user from a new `GET /auth/me` endpoint, so a Branch Manager and a Teller get different tabs automatically. Also fixed: no `viewport` meta export existed in `layout.tsx` at all, so every mobile browser was rendering at a virtual ~980px desktop width, silently defeating every responsive class app-wide.

### Color system correction
Audited the deployed Tailwind config against the concept document's `:root` tokens and found real drift — the entire "ink" navy family had been built as violet/purple (`#1B0F35`) instead of the doc's actual navy (`#08172E`), despite a code comment claiming it matched exactly. Corrected every token to the doc's exact hex values; later pinned `ink-900` byte-identical to `ink-950` per explicit instruction, at the token level so every consuming class updated automatically.

### Real component system
`className="input"` was used on every form field app-wide, but `.input` was never actually defined in `globals.css` — every field had been rendering as unstyled raw browser default. Built a proper system in one pass (gold focus-glow, custom select chevrons, `.card`, `.btn-primary`/`.btn-dark`/`.btn-text`) and swept every page onto it. Followed with real field semantics — `type="tel"` with a Ghana-format pattern, proper `autoComplete`, `type="number"` with GHS/%/months affixes, and converting "Region" from free text to a controlled 16-region `<select>` everywhere it appears.

### Employee Master (doc §50.5)
Section 50.5 explicitly defines an Employee Master domain listing "System users" as subordinate — validating that system access should be granted to an existing employee record, never typed freehand. Added an `Employee` model; `User` becomes optionally linked to one. Replaced the old free-typed "Invite staff" form with **Employee Directory** (add a person, no access yet) and **Grant System Access** (select an existing employee + role). Replaced the email-only accept-invite match (a real security gap) with a random, 7-day-expiring invite token.

### Customer history (doc §33)
§33.1 explicitly rejects transaction-only views: *"Nexus OS... manages the entire customer relationship."* Extended `GET /customers/:id` to include every loan and savings account with their full transaction history, built as a single chronological timeline.

### Full lifecycle QA with two real users
Walked the full loan/savings lifecycle end to end using two genuinely distinct logged-in users, not one person clicking both sides. Confirmed segregation of duties (§38.11) actually enforced, not just present in code. **Two real bugs found this way, not by inspection:** `loan.reject` and loan repayment recording were silently never writing to the Audit Log.

### Infrastructure lessons — first two of the day
- **Windows Python file encoding:** heredoc patches without explicit `encoding="utf-8"` corrupted files containing `§`/`×`/`…` on Windows Git Bash, breaking the build with a cryptic UTF-8 error. Fixed permanently by specifying `encoding="utf-8"` on every subsequent patch and verifying before every commit.
- **Schema/deploy ordering:** pushing a Prisma schema change to `develop` immediately triggers Railway to rebuild `nexus-api` against the new schema — before the actual migration has necessarily run against Supabase. Caused a brief production outage. Resolved by sequencing schema pushes and migrations closer together.

### Reporting depth, completed honestly (doc §80)
§80 is aspirational at enterprise scale (AI narrative reports, scheduled distribution, regulatory submissions). Scoped explicitly to what's achievable now: three dedicated reports (Loan, Savings, Customer) with branch breakdowns, aging buckets, KYC compliance rate, date filtering, CSV export. Everything needing infrastructure that doesn't exist stayed honestly Not Started rather than faked.

### List-then-detail redesign across Customers, Loans, Savings
Actions were happening inline inside list tables instead of on a dedicated screen. Rebuilt all three: clean tap-to-open lists, every action moved to `/loans/[id]`, `/savings/[id]`, `/customers/[id]`. Required two new endpoints (`GET /loans/:id`, `GET /savings/:id`) that hadn't existed.

**Recurring bug worth naming:** a bash batch got accidentally re-run twice, each time silently tripling a newly-added object literal key and breaking the build. Fixed by full clean file rewrites. Tell: an exact, identical duplicate line repeated 2-3 times in the compiler error.

### CRUAA audit — the biggest finding of the day
Instructed to audit against Create/Read/Update/Append/Archive discipline, treated as sitting beside RBAC in importance. Finding: **several status enum values existed in the schema but were never reachable by any endpoint** — `SavingsAccountStatus.CLOSED/DORMANT`, `UserStatus.SUSPENDED/DEACTIVATED` were dead code paths. Concretely: **there was no way to revoke a departed employee's system access at all.**

Built across every entity in one pass: Customer edit+archive, Branch edit+archive (Head Office protected), Employee edit+archive (fail-secure — cascades to suspend linked login), User suspend/reinstate (revokes all refresh tokens, a real access cutoff), Role permission-editing via checkbox grid, SavingsAccount close/reactivate (balance must be zero). Maps to doc §53 (Data Lifecycle Management Framework), which moved Not Started → Partial as a direct result.

---

## 21 Jul 2026 — EFS Gap Analysis (findings; resolutions tracked below)

A full comparison against the (then-current) EFS document — 25 volumes, 298 sections — for Customer Management, Savings Management, and Loan Management, the volumes with a live counterpart in the build. Headline findings, with resolution status as of 23 Jul noted inline:

- **Customer lifecycle stage model conflict** (marketing-funnel doc vs. banking-operational EFS) — *later superseded entirely by the 23 Jul merged status model; see below.*
- **Enforcement gaps:** deposits/withdrawals didn't check account status before processing; archiving a customer didn't check for active obligations; loans never auto-closed on full repayment. *All fixed same-session or in subsequent work (loan auto-close fixed with the Interest Engine on 22-23 Jul; obligations-check fixed with the Customer module expansion).*
- **Foundational gaps:** no Product entity at all; no interest engines (Loans or Savings); KYC just a status flag; no document management. *Products, the Loan interest engine, and Document management were all built 22-23 Jul (see below). Real KYC workflow and Savings interest remain open — see "What's Next."*
- **Significant gaps:** no guarantors/collateral, no loan penalties, no arrears management, no restructuring/rescheduling/write-off, no dormancy automation, no fees/charges, no joint accounts/beneficiaries/next of kin. *Joint accounts (as an additive AccountHolder table), Beneficiaries, and Next of Kin were built 22-23 Jul. Guarantors/collateral, penalties, arrears, restructuring, dormancy automation, and fees/charges remain open.*
- **Lower-urgency gaps:** no CRM notes, no CDD/beneficial-ownership/risk-profiling/blacklisting/duplicate-detection, no consent management, no customer self-service portal, no real search, no statements. *Notes, Beneficial Ownership, Watchlist/blacklisting, and duplicate-detection flagging, and real search were all built 22-23 Jul. Consent management, the self-service portal, and statements remain open.*

What was already well-aligned at the time (Permission Matrix, Loan Approval segregation of duties, Savings/Loan reporting, CRUAA-style archive coverage) has held up in every subsequent check.

---

## 22–23 Jul 2026 — Tracker gap closure + major new modules

### Toast/notification system (doc §16)
Every error across all pages now surfaces as a clean toast with a reference ID, via a `useErrorToast` hook watching each page's existing error state — no page's business logic had to change.

### Audit Log search/filter + CSV export
Meets doc §15.5's "audit records shall be searchable" directly.

### Role Create + Employee Master expansion
Custom roles beyond the seeded templates; Employee gained real HR fields (Employee Number, Department, Position, Grade, Employment Type, Reporting Manager) per Technical Spec §71.

### Loan Interest Engine (doc §70)
Both Flat and Reducing Balance amortization schedules, generated at disbursement. Repayments auto-allocate oldest-installment-first, interest-before-principal. Loans now correctly auto-close on full repayment — closing the dead `CLOSED` status flagged in the EFS gap analysis above.

### Product Management (doc §47/§62/§84)
Versioned `Product`/`ProductVersion` entities — the single biggest gap from the EFS analysis. A full Products page (create/activate/withdraw/archive). Loan and Savings origination now select a product instead of typing terms freely, with principal/tenure validated against the product's configured min/max.

### Customer module, Tiers 1–3
Real search, the active-obligations-blocks-archive bug fixed, Next of Kin, Beneficiaries, Beneficial Owners (Business/Corporate), Notes/CRM history, Risk Rating, Communication Preferences, Watchlist screening with its own admin page, duplicate-detection flagging.

### Joint Accounts / POA (doc §36)
A new, additive `AccountHolder` table — Joint, Authorised Signatory, Guardian, Nominee, Power of Attorney, Corporate Representative — sitting alongside the existing primary `customerId` on Loan/SavingsAccount. Chosen deliberately over a full many-to-many redesign to avoid breaking every existing Reports/Dashboard/customer-history query for a capability nothing in the app needed yet.

### Document upload (doc §30/§69)
Supabase Storage integration — SHA-256 checksummed metadata in Postgres, file bytes in a private bucket, 5-minute signed URLs for preview, a Verify/Archive/Dispose lifecycle.

### Infrastructure incident: repo visibility
Mid-session, the repo was made private to protect a `.env` file that, on inspection, turned out to have only ever contained a placeholder template — real credentials had lived in Railway the entire time. This broke local sandbox verification for a stretch (a `git fetch` failure had been silently occurring and getting dismissed as harmless noise for longer than realized). Root-caused precisely; access restored once the repo went back to public.

---

## 23 Jul 2026 — Stock-take against updated working documents

A fresh comparison against updated working documents (322-section EFS, 260-section Technical Spec — both meaningfully larger than the versions originally built against) confirmed the document structure for everything already built was still numbered and titled identically — nothing already shipped was grounded in stale section numbers. It surfaced seven concrete, real gaps. All seven were closed the same day:

### 1. A genuine conflict between the two source documents
EFS §41.3 (updated) listed 11 customer status values; Technical Spec §57.6 (updated) listed 9 — and they disagreed with each other (this superseded the marketing-funnel-vs-banking-operational conflict noted in the 21 Jul EFS analysis, which had already been resolved by adopting the banking-operational model outright). Reconciled with explicit workflow meaning defined per value — which statuses permit transactions, how each is reached, which lock the record. `PENDING_APPROVAL` and `BLACKLISTED` are the two genuinely new, load-bearing additions.

### 2. AML/Sanctions Screening — hard block, not a soft flag (§34)
A watchlist match now sets the customer straight to `BLACKLISTED` and opens an `AML_ADJUDICATION` approval request. The customer cannot transact or be edited until a compliance officer — who did not create the record — resolves it.

### 3. A generic Approval Workflow (§24/§36/§47/§62)
Four separate doc requirements ("requires approval where configured") were about to get four bespoke mechanisms. Built once instead: a single `ApprovalRequest` model with a `payload` field describing the proposed change, applied generically on approval. Segregation of duties enforced uniformly — `requestedById` can never equal `resolvedById`. A real inbox exists at `/approvals`.

### 4. Beneficiary allocation validated (§37.4)
The running total across a customer's beneficiaries can no longer exceed 100%.

### 5. Granular communication preferences (§39.2)
Six independent toggles (SMS/Email/WhatsApp/Marketing/Transaction Alerts/Statement Delivery) replacing a single dropdown.

### 6. Document Replace + version history (§30.3)
Replacing a document now creates a new row linked back to the one it supersedes and auto-archives the old one.

### 7. Customer closure reason captured (§45.3)
Archiving now requires selecting why, from the doc's configurable reason list — previously never asked.

### A process failure, named plainly
Mid-delivery of the final batch, a script printed a failing `tsc` result and committed and pushed anyway — the commit step wasn't actually gated on the verification exit code, despite that discipline having been stated explicitly earlier the same day. Broken code reached `develop`: one router file (`approvals.routes.ts`) was referenced in `app.ts`'s imports but never written to disk in the final delivery, and an entire block of frontend files was silently skipped. Both caught immediately from the real compiler output, fixed with an actual `if`-gated commit (`if [ "$WEB_TSC_EXIT" = "0" ] && [ "$WEB_BUILD_EXIT" = "0" ]; then ... fi`), reverified clean before pushing again.

---

## Cumulative infrastructure/process lessons (reference list)

1. Always specify `encoding="utf-8"` explicitly on every Python file patch; verify UTF-8 validity before every commit.
2. Sequence Prisma schema pushes and `migrate dev` close together — a schema push alone triggers a Railway rebuild against a database that hasn't been migrated yet.
3. Every command-block that changed directory needs its own explicit `cd <full path>` — never assume a later block inherits an earlier one's working directory.
4. Watch for accidentally re-run bash batches silently duplicating object literal keys — the tell is an identical duplicate line repeated 2-3× in a TypeScript compiler error.
5. **Verification must gate commits by construction, not by intention** — wrap the `git add/commit/push` sequence in an explicit `if [ "$EXIT_CODE" = "0" ]; then ... fi`, every time, no exceptions.
6. A private GitHub repo blocks anonymous sandbox `git fetch`/clone entirely (returns 404, not 403) — don't assume a "fatal: could not read Username" line is harmless background noise; verify what it's actually blocking.

---

## 24 Jul 2026 — Savings Interest Management, full fidelity

Explicitly requested with no shortcuts: *"Proceed with what all the details in the working documents. I don't want any shortcuts that we later have to fix. I prepared the documents for this purpose."* Every design decision below is grounded in a specific doc citation, consulted before proposing anything, per the standing workflow rule — not assumed or simplified for speed.

**All three calculation methods (§52.4):**
- **Daily Balance** — one accrual row per calendar day, balance reconstructed from the real transaction ledger (the most recent transaction's `balanceAfter` at or before that date), so it's correct even after a gap in when accrual was last run.
- **Average Daily Balance / Minimum Monthly Balance** — genuinely different logic, not daily rows: one row per calendar month, using the average or minimum of that month's daily balances.

**All four rate types (§52.3):** Fixed, Tiered (balance-bracket rates via a new `InterestRateTier` model, managed per product with its own expandable admin UI), Variable (the product's current version's rate — versioning already gives "changes over time" meaning with full history preserved), and Promotional (a time-bound bonus rate applied to *each account* from its own opening date via `promoInterestRate`/`promoExpiresAt`, not a shared calendar-date promotion).

**Rate resolution order:** an account's active Promotional rate first, else a Tiered lookup by the balance figure actually used for that accrual, else the product's Fixed/Variable rate.

**Interest Accrual is a real tracked entity (§59.5), not a live-only number.** A new `SavingsInterestAccrual` model — accrual never touches balance, only Posting does. This also functions as the audit trail (§52.5 "every posting is auditable") for exactly how each posted amount was derived, day by day or month by month.

**Interest Posting — both per-account and batch (§119).** §119 Ledger Posting Management explicitly names Real-Time, Scheduled, and Batch Posting as first-class patterns. No scheduler infrastructure exists in this app, so Scheduled is out of reach for now — a real, named limitation, not an oversight. Real-Time (per-account, staff-triggered) and Batch ("post interest for all accounts," sharing a `batchId`) were both built, since both are genuinely achievable today.

**Interest Suspension, Recalculation, and Reversal, all built (§52.3):** Suspension pauses accrual on an account without closing it. Recalculation is the same accrual function re-run on a not-yet-posted period — genuinely idempotent by design, so re-running mid-period updates the existing row rather than duplicating it. Reversal (§52.3 "where authorised") resets the linked accruals back to unposted, so the interest can be reconsidered later rather than simply vanishing — and creates a real negative-amount transaction so the balance history stays honest about what happened.

**Interest Reporting (§52.3)** added as a dedicated section on the existing Savings report: total accrued/posted/reversed, breakdown by calculation method, top interest earners.

**A design choice worth naming:** `Available Balance` vs `Ledger Balance` (§59.4) — kept as two genuinely maintained fields (`balance`/`ledgerBalance`), always mirrored in this pass since no holds/authorization-hold feature exists yet. The fields are real and correctly kept in sync, not a fake placeholder — a full Holds subsystem is separate, later work if it's ever needed.

**Delivery method changed for this batch.** Given the size (10 files touched, ~1,100 lines), everything was packaged into a downloadable zip with the exact repo-relative paths (`api/...`, `web/...`) instead of pasted as heredocs across multiple messages — extracted directly at the repo root with one `unzip -o savings-interest-update.zip -d .`. Worth reusing for any future batch of comparable size; it also sidesteps the risk (seen earlier this session) of a frontend block silently getting skipped across multiple pasted-heredoc messages.

## 24-25 Jul 2026 — PDDS compliance audit, Phase 1+2, and a live production-verifying smoke test

### A fourth working document: the Physical Database Design Specification
A genuinely different kind of document arrived — 190 sections of concrete table/column/naming/constraint standards, not conceptual entity descriptions. Asked directly: *"How has our database complied with this?"* Answer, checked honestly rather than assumed: not well, systematically.

### Full compliance audit (audit only, no code changed)
Every table checked field-by-field against its PDDS spec. Universal violations affecting all 29 tables: wrong primary key type (`cuid()` instead of UUID), camelCase columns instead of snake_case, plural table names instead of singular, mandatory audit columns (`created_by`/`updated_by`/`deleted_by`/`version_no`) present on zero tables, non-standard constraint naming. Per-table findings included some genuinely more than cosmetic: no lockout/brute-force tracking on User at all, no branch manager assignment anywhere, Loan has no human-readable account number (Savings does), LoanRepayment never stores its own principal/interest split.

### A real roadmap, not a single push
Given the scale — and that changing primary key format touches every foreign key in the database — proposed six risk-ordered phases rather than attempting everything at once. Phase 4 (security fields: lockout tracking, `last_login_at`, `password_changed_at`) explicitly deferred at instruction, pending a dedicated Enterprise Security Specification document GM will issue separately — a standing rule to hold even if later asked to "continue with all phases."

### Phase 1+2: full physical compliance, executed
UUID v4 primary keys (was `cuid()`) across all 29 tables, snake_case columns, singular table names, `pk_`/`fk_`/`uq_` constraint naming — all via a deterministic transformation script rather than hand-editing at this scale, carefully reviewed (brace-balance checks, spot-checks across every relation pattern including named relations and self-relations, final counts cross-verified: 29 models = 29 `uuid()` calls = 29 `pk_` names) before delivery. **Zero application code changes required** — Prisma's field names never changed, only the schema's `@map()`/`@@map()` mapping directives and ID defaults, so every route, every seed script call, continued working exactly as-is.

### A real infrastructure incident during the migration, and how it was actually resolved
A zip delivery failed silently (the file never reached the local Downloads folder), but the destructive commands after it ran anyway — against the *unchanged* schema, deleting all prior migration history, then attempting a database reset that itself failed mid-operation with a dropped connection. Rather than guess at the resulting state, the situation was diagnosed with `prisma db pull --print` (reads the live database schema directly, independent of migration history) before any further action — and when a later transcript showed a genuinely successful re-run, that was independently verified (`uuid()` = 29, `cuid()` = 0) rather than taken on faith.

### A full live smoke test, via curl — the real value of this pass
Rather than trust a clean `tsc` pass, walked the entire application through real HTTP calls against the production API: institution registration → onboarding (details, branch, staff invite) → a three-user RBAC setup (Admin/CEO, Branch Manager, System Administrator) → customer creation and KYC/status activation → two products created and taken through the Approval Workflow (segregation-of-duties *and* the separate permission-layer enforcement both independently confirmed with real 403s) → a full Savings lifecycle (open, deposit, accrue, post) → a full Loan lifecycle (initiate, approve, disburse, schedule generation) → an audit-log completeness review.

**Four real, pre-existing bugs found and fixed along the way — none caused by the PDDS migration itself:**
1. **Non-atomic staff invite** — `User`/`UserRole`/`Employee` creation wasn't wrapped in a transaction; a mid-way failure (e.g. an invalid role) left an orphaned, role-less user that silently blocked any retry with the same email forever. Fixed with `prisma.$transaction` plus upfront role validation.
2. **A dead invite-token code path** — the onboarding flow's staff-invite endpoint (the one actually used for every institution's very first hire) had fallen out of sync with a newer, already-fixed Grant Access flow elsewhere in the codebase, and never generated an invite token at all. Every institution going through standard onboarding had been creating first-time users with no way to ever accept their invite. Fixed by mirroring the working pattern.
3. **Wrong-balance Daily Balance accrual** — interest calculation used the balance at *midnight* (opening) rather than end-of-day (closing), so a same-day deposit correctly showed a real GHS 1,000 balance but a `balanceUsed` of 0 in the accrual — same-day deposits earned nothing until the following day's run. Fixed by querying end-of-day balance for the lookup while keeping midnight as the dedup key.
4. **No audit trail or ledger sync on deposit/withdraw** — the two most fundamental savings operations had zero audit logging (every other mutating action in the app logs; these two never did) and never updated `ledgerBalance` alongside `balance`, despite that field existing specifically to stay mirrored until a real Holds feature exists. Both fixed together.

### Process lesson, confirmed twice in one session
A targeted Python string-replacement patch silently failed against a Windows/CRLF-converted file with no visible error — the script's own assertion failure was never checked before continuing to run `tsc` and commit, so a fix appeared to succeed (clean `tsc`, "nothing to commit") without ever actually landing. Diagnosed by explicitly checking `git status --short`/`git diff --stat` immediately after every patch attempt, and resolved by switching to full-file heredoc overwrites — which don't depend on matching exact substrings against a file whose line endings may have been silently converted. Now the default for any file with prior CRLF exposure, which by this point in the project is effectively every file.

## Current status

See the companion progress tracker (`nexus-efos-progress-tracker.html`) for the full section-by-section snapshot. As of 25 Jul: **2 Built, 20 Partial, 54 Not Started, 23 Vision** out of 99 tracked sections (row count unchanged — PDDS Phase 1+2 deepened §48 Data Architecture rather than moving a new section out of Not Started).

## What's next

1. **PDDS Phase 3** — mandatory audit columns (`created_by`/`updated_by`/`deleted_by`/`version_no`) on every table, full optimistic locking (frontend submits its loaded version, backend rejects on mismatch), and converting the handful of endpoints that currently hard-delete (Next of Kin, Beneficiary, Beneficial Owner, Watchlist entries, Interest Rate Tiers) to soft-deletes.
2. **PDDS Phase 4 (Security)** — explicitly parked pending the Enterprise Security Specification document; do not build early.
3. **PDDS Phases 5+6** — per-table field completeness (customer_number, DOB, structured names, branch manager assignment, Loan account numbers) and structural upgrades (normalized Department/Position lookup tables).
4. **Real KYC document-verification workflow** — still a three-value status flag.
5. **CDD, beneficial-ownership verification depth, credit scoring** — compliance-grade features with no equivalent yet; lower urgency at current operational scale.
6. **Approval Workflow configurability** — every wired-in action always requires approval today; no per-institution toggle for which actions need it.
7. **Guarantors/Collateral, loan penalties, arrears management, restructuring/rescheduling/write-off, dormancy automation, fees/charges** — all flagged in the original EFS analysis, none yet built.
8. **Scheduled interest posting** — genuinely blocked on job-scheduling infrastructure not existing yet, not a design gap; Real-Time and Batch posting are both fully built.
9. **Consent management, customer self-service portal, statements** — lower-urgency EFS findings, still open.
10. **Everything else in the tracker's Not Started list** — Collections, Share Management, Fixed Deposits, Treasury, GL, Payments, and the full AI/BI/Executive Intelligence volumes — untouched throughout.
