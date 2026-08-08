# Scheduled Jobs

All scheduled jobs run inside the existing long-lived API process via
`node-cron` (`api/src/lib/scheduler.ts`) — no separate worker service at
this scale. Started once from `server.ts` on boot.

## Daily, 01:00 server time

Runs after any prior day's end-of-day activity, before the next business
day starts.

| Job | What it does |
|---|---|
| Arrears check | Reclassifies every DISBURSED/ACTIVE loan's arrears bucket (Current/1-30/31-60/61-90/90+) from real installment data. EFS §77.3. |
| Standing Instructions | Executes every due Internal Transfer / Loan Repayment / Scheduled Withdrawal for real, with retry-then-auto-suspend on insufficient balance. |
| Recurring Journals | Posts every due recurring GL journal template, gated on all template accounts being ACTIVE, the template still balancing, and the covering financial period being OPEN. |
| **Savings interest accrual** *(new)* | Runs `runAccrualForAccount` across every institution's ACTIVE, non-interest-suspended savings accounts, through today. One row per day for DAILY_BALANCE; upserted per-calendar-month for AVERAGE_DAILY_BALANCE/MINIMUM_MONTHLY_BALANCE. This does **not** move money — it only computes and records what's owed; see posting below. |

## Monthly, 02:00 on the 1st

| Job | What it does |
|---|---|
| **Savings interest posting** *(new)* | Credits every institution's unposted accrued interest to the real account balance (a real `SavingsTransaction` + `SavingsInterestPosting` row per account), batched with a shared `batchId` across the whole run. Runs an hour after the same day's 01:00 accrual job, so the final day of the prior month is always captured before posting, never against a stale figure. |

### Why monthly-on-the-1st — disclosed default, not a spec value

EFS §52.3 names "Interest Posting" as a required capability and §52.2's
stated objectives include "Automate interest calculations" / "Reduce
manual intervention" — checked directly, along with the ECD and ETAS, and
none of them specify a posting *frequency*. This cadence is a disclosed
default, the same discipline already applied to the security policy
values (see `security-policy-defaults.md`) and the KYC risk-scoring
weights:

- Matches how `AVERAGE_DAILY_BALANCE` and `MINIMUM_MONTHLY_BALANCE` are
  already built to compute — per calendar month — so posting on the same
  cadence they calculate on is the natural fit, not a mismatched add-on.
- Matches the standard real-world convention for savings interest
  crediting.

If your actual product design needs a different cadence (quarterly,
per-product-configurable, etc.), that's a real schema addition — no
`postingFrequency` field exists on `ProductVersion` today — flag it and
it can be built properly rather than worked around.

### Automatic posting and the Approval Workflow

Posting via this scheduled job has no per-run human approval gate, same
as Standing Instructions and Recurring Journals already work: the
product/account configuration itself was already approved when set up,
not re-approved on every automatic execution. This is consistent with
existing precedent in the codebase, not a new departure. The manual
`/accrue`, `/accrue-all`, `/post`, and `/post-all` endpoints (still
gated behind `savings.approve`) are unchanged and remain available for
any out-of-cycle correction.

### Attribution for automated postings

`SavingsInterestPosting.postedById` is nullable (migrated this round,
same reasoning as `SavingsTransaction.recordedById` already being
nullable). A null `postedById` on a posting means the scheduler posted
it automatically — distinguishable from a genuine data gap by `batchId`,
which the scheduler always sets and a manual single-account post never
does.

## Manual trigger

Every job function is exported from its module
(`runArrearsCheck`, `runStandingInstructions`, `runRecurringJournals`,
`runSavingsInterestAccrual`, `runSavingsInterestPosting` from
`scheduler.ts`) so an admin route or a manual run during testing/pilot
setup can trigger any of them on demand rather than waiting for the next
scheduled run. No such admin route exists yet — a real, callable function
is exported and ready for one to be wired up when needed.
