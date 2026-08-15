import cron from "node-cron";
import * as Sentry from "@sentry/node";
import os from "os";
import crypto from "crypto";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { calculateArrears } from "./arrears";
import { nextExecutionDate } from "./standingInstructions";
import { isBalanced, balanceEffect, generateJournalNumber, findPostablePeriod } from "./generalLedger";
import { runSavingsInterestAccrualAllInstitutions, runSavingsInterestPostingAllInstitutions } from "../routes/savings-interest.routes";

// GAP-SCH-001 fix — the distributed claim. See the schema comment on
// ScheduledJobRun for the full reasoning. PROCESS_ID is generated once
// per process at module load, not per call, so every claim this process
// makes is attributable to the same running instance.
const PROCESS_ID = `${os.hostname()}-${process.pid}-${crypto.randomUUID()}`;

async function claimAndRun(jobType: string, fn: () => Promise<void>) {
  const runDate = new Date();
  runDate.setHours(0, 0, 0, 0);

  let claim;
  try {
    claim = await prisma.scheduledJobRun.create({
      data: { jobType, runDate, claimedByProcessId: PROCESS_ID },
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      console.log(`[scheduler] ${jobType}: already claimed by another instance for ${runDate.toISOString().slice(0, 10)}, skipping`);
      return;
    }
    throw err;
  }

  try {
    await fn();
    await prisma.scheduledJobRun.update({ where: { id: claim.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  } catch (err: any) {
    await prisma.scheduledJobRun.update({ where: { id: claim.id }, data: { status: "FAILED", completedAt: new Date(), error: String(err.message || err) } });
    logger.error(`[scheduler] ${jobType} failed`, { runDate: runDate.toISOString().slice(0, 10), error: String(err.message || err) });
    // GAP-OBS-001: scheduled jobs run outside any HTTP request, so
    // Sentry's Express auto-instrumentation never sees them — without
    // this, a failing arrears check or interest posting run would only
    // ever surface in Railway's raw logs, not in the same place every
    // other production error shows up.
    Sentry.captureException(err, { tags: { jobType }, extra: { runDate: runDate.toISOString().slice(0, 10) } });
    throw err;
  }
}

// doc §77.3 "Arrears calculations are automatic" — taken literally. Runs
// once daily rather than being computed live on every read, matching how
// a real institution's end-of-day batch process works. This is the first
// genuine scheduled-job infrastructure in the app (node-cron, running
// inside the existing long-lived API process on Railway — no separate
// worker service needed at this scale) — several other gaps found in the
// EFS audit (Savings dormancy detection, KYC expiry monitoring, watchlist
// re-screening) were blocked on exactly this not existing yet, and can
// now be added as their own scheduled jobs following this same pattern.
async function runArrearsCheck() {
  const startedAt = Date.now();
  const loans = await prisma.loan.findMany({
    where: { status: { in: ["DISBURSED", "ACTIVE"] } },
    include: { installments: true },
  });

  const today = new Date();
  let updated = 0;

  for (const loan of loans) {
    const result = calculateArrears(
      loan.installments.map((i) => ({
        dueDate: i.dueDate,
        totalDue: Number(i.totalDue),
        principalPaid: Number(i.principalPaid),
        interestPaid: Number(i.interestPaid),
      })),
      today
    );

    if (
      result.classification !== loan.arrearsClassification ||
      result.daysInArrears !== loan.daysInArrears ||
      Math.abs(result.arrearsAmount - Number(loan.arrearsAmount)) > 0.01
    ) {
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          arrearsClassification: result.classification,
          daysInArrears: result.daysInArrears,
          arrearsAmount: result.arrearsAmount,
          lastArrearsCheckAt: today,
        },
      });
      updated++;
    } else {
      await prisma.loan.update({ where: { id: loan.id }, data: { lastArrearsCheckAt: today } });
    }
  }

  console.log(`[scheduler] arrears check: ${loans.length} loan(s) checked, ${updated} reclassified, ${Date.now() - startedAt}ms`);
}

// doc §58 Standing Instructions — executed for real: an internal transfer
// genuinely moves balance between two savings accounts (or pays down a
// real loan), not a simulated record. §58.5 "Failed executions generate
// alerts" / "Retry policies are configurable" — insufficient balance
// skips this run and increments a failure counter; too many consecutive
// failures auto-suspends the instruction rather than retrying forever
// silently.
async function runStandingInstructions() {
  const startedAt = Date.now();
  const due = await prisma.standingInstruction.findMany({
    where: { status: "ACTIVE", nextExecutionDate: { lte: new Date() } },
  });

  let executed = 0;
  let failed = 0;

  for (const si of due) {
    const source = await prisma.savingsAccount.findUnique({ where: { id: si.sourceAccountId } });
    const amount = Number(si.amount);
    const insufficientOrMissing = !source || Number(source.balance) < amount;

    if (insufficientOrMissing) {
      failed++;
      const consecutiveFailures = si.consecutiveFailures + 1;
      const shouldSuspend = consecutiveFailures >= si.maxRetries;
      await prisma.standingInstruction.update({
        where: { id: si.id },
        data: { consecutiveFailures, status: shouldSuspend ? "SUSPENDED" : "ACTIVE" },
      });
      await prisma.standingInstructionExecution.create({
        data: { instructionId: si.id, status: "FAILED", amount, failureReason: !source ? "Source account not found" : "Insufficient balance" },
      });
      continue;
    }

    const newSourceBalance = Number(source.balance) - amount;

    if (si.type === "INTERNAL_TRANSFER" && si.destinationAccountId) {
      const dest = await prisma.savingsAccount.findUnique({ where: { id: si.destinationAccountId } });
      if (!dest) {
        failed++;
        await prisma.standingInstructionExecution.create({ data: { instructionId: si.id, status: "FAILED", amount, failureReason: "Destination account not found" } });
        continue;
      }
      const newDestBalance = Number(dest.balance) + amount;
      await prisma.$transaction([
        prisma.savingsAccount.update({ where: { id: source.id }, data: { balance: newSourceBalance, ledgerBalance: newSourceBalance } }),
        prisma.savingsAccount.update({ where: { id: dest.id }, data: { balance: newDestBalance, ledgerBalance: newDestBalance } }),
        prisma.savingsTransaction.create({ data: { accountId: source.id, type: "WITHDRAWAL", amount, balanceAfter: newSourceBalance, recordedById: si.createdById } }),
        prisma.savingsTransaction.create({ data: { accountId: dest.id, type: "DEPOSIT", amount, balanceAfter: newDestBalance, recordedById: si.createdById } }),
      ]);
    } else if (si.type === "LOAN_REPAYMENT" && si.destinationLoanId) {
      await prisma.$transaction([
        prisma.savingsAccount.update({ where: { id: source.id }, data: { balance: newSourceBalance, ledgerBalance: newSourceBalance } }),
        prisma.savingsTransaction.create({ data: { accountId: source.id, type: "WITHDRAWAL", amount, balanceAfter: newSourceBalance, recordedById: si.createdById } }),
        prisma.loanRepayment.create({ data: { loanId: si.destinationLoanId, amount, recordedById: si.createdById } }),
      ]);
    } else if (si.type === "SCHEDULED_WITHDRAWAL") {
      await prisma.$transaction([
        prisma.savingsAccount.update({ where: { id: source.id }, data: { balance: newSourceBalance, ledgerBalance: newSourceBalance } }),
        prisma.savingsTransaction.create({ data: { accountId: source.id, type: "WITHDRAWAL", amount, balanceAfter: newSourceBalance, recordedById: si.createdById } }),
      ]);
    }

    await prisma.standingInstructionExecution.create({ data: { instructionId: si.id, status: "SUCCESS", amount } });
    await prisma.standingInstruction.update({
      where: { id: si.id },
      data: { nextExecutionDate: nextExecutionDate(si.nextExecutionDate, si.frequency as any, si.customIntervalDays ?? undefined), consecutiveFailures: 0 },
    });
    executed++;
  }

  console.log(`[scheduler] standing instructions: ${due.length} due, ${executed} executed, ${failed} failed, ${Date.now() - startedAt}ms`);
}

// doc §122 Recurring Journal Management — each due execution generates
// and posts a REAL Journal, using the exact same balance-effect and
// debit=credit logic every other journal in the app relies on. Respects
// the same rules a manual journal would: the covering financial period
// must be OPEN, and every account in the template must still be ACTIVE.
// Either failing counts as a failed execution (same retry-then-suspend
// policy as Standing Instructions), not a silent skip.
async function runRecurringJournals() {
  const startedAt = Date.now();
  const due = await prisma.recurringJournal.findMany({ where: { status: "ACTIVE", nextExecutionDate: { lte: new Date() } } });

  let executed = 0;
  let failed = 0;

  for (const rj of due) {
    const lines = rj.lineTemplate as { accountId: string; debit: number; credit: number }[];
    const accounts = await prisma.gLAccount.findMany({ where: { id: { in: lines.map((l) => l.accountId) } } });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const allAccountsExist = lines.every((l) => accountById.has(l.accountId));
    const allActive = allAccountsExist && lines.every((l) => accountById.get(l.accountId)!.status === "ACTIVE");
    const stillBalanced = isBalanced(lines);
    const period: { id: string; status: string } | null = await findPostablePeriod(prisma, rj.institutionId, rj.nextExecutionDate);
    const periodOpen = !!period && period.status === "OPEN";

    if (!allActive || !stillBalanced || !periodOpen) {
      failed++;
      const consecutiveFailures = rj.consecutiveFailures + 1;
      const shouldSuspend = consecutiveFailures >= rj.maxRetries;
      const reason = !allAccountsExist || !allActive ? "one or more template accounts are missing or inactive" : !stillBalanced ? "template no longer balances" : period ? `financial period is ${period.status}` : "no financial period covers this date";
      await prisma.recurringJournal.update({ where: { id: rj.id }, data: { consecutiveFailures, status: shouldSuspend ? "SUSPENDED" : "ACTIVE" } });
      await prisma.recurringJournalExecution.create({ data: { recurringJournalId: rj.id, status: "FAILED", failureReason: reason } });
      continue;
    }

    const journal = await prisma.journal.create({
      data: {
        institutionId: rj.institutionId, journalNumber: generateJournalNumber(), type: "RECURRING", description: rj.description,
        postingDate: rj.nextExecutionDate, status: "POSTED", postedAt: new Date(), createdById: rj.createdById, postedById: rj.createdById,
        lines: { create: lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })) },
      },
    });

    for (const line of lines) {
      const account: { category: string } = accountById.get(line.accountId)!;
      const effect = balanceEffect(account.category as any, line.debit, line.credit);
      await prisma.gLAccount.update({ where: { id: line.accountId }, data: { balance: { increment: effect } } });
    }

    await prisma.recurringJournalExecution.create({ data: { recurringJournalId: rj.id, status: "SUCCESS", journalId: journal.id } });
    await prisma.recurringJournal.update({
      where: { id: rj.id },
      data: { nextExecutionDate: nextExecutionDate(rj.nextExecutionDate, rj.frequency as any, rj.customIntervalDays ?? undefined), consecutiveFailures: 0 },
    });
    executed++;
  }

  console.log(`[scheduler] recurring journals: ${due.length} due, ${executed} executed, ${failed} failed, ${Date.now() - startedAt}ms`);
}

// EFS §52.3 "Interest Posting" / §52.2 "Automate interest calculations,
// reduce manual intervention" — the accrual half of the previously-named
// gap ("Scheduled/automated Savings interest posting — currently
// staff-triggered"). Runs daily across every institution's active,
// non-suspended savings accounts, same as the existing manual
// /accrue-all route but institution-agnostic. See
// docs/scheduled-jobs.md for the disclosed default this pairs with.
async function runSavingsInterestAccrual() {
  const startedAt = Date.now();
  const result = await runSavingsInterestAccrualAllInstitutions();
  console.log(
    `[scheduler] savings interest accrual: ${result.accountsProcessed} account(s) processed, ${result.accrualRowsCreated} accrual row(s) created/updated, ${Date.now() - startedAt}ms`
  );
}

// The posting half. Disclosed default cadence — monthly, on the 1st — not
// sourced from any working document (checked directly against EFS §52.3,
// which names "Interest Posting" as a requirement without specifying a
// frequency). Chosen because it matches how AVERAGE_DAILY_BALANCE and
// MINIMUM_MONTHLY_BALANCE already compute per calendar month, and because
// it's the standard real-world convention for savings interest crediting.
// See docs/scheduled-jobs.md.
async function runSavingsInterestPosting() {
  const startedAt = Date.now();
  const result = await runSavingsInterestPostingAllInstitutions();
  console.log(
    `[scheduler] savings interest posting: ${result.accountsPosted} account(s) posted, GHS ${result.totalPosted} total, batch ${result.batchId}, ${Date.now() - startedAt}ms`
  );
}

// EFS §160.3 "Escalations occur automatically where configured" — driven
// here by the disclosed SLA-target default (SLA_TARGET_HOURS_BY_PRIORITY
// in crm.routes.ts), not a configurable rule engine. Any OPEN or
// INVESTIGATING complaint whose slaTargetAt has passed gets flagged.
async function runComplaintEscalationCheck() {
  const startedAt = Date.now();
  const overdue = await prisma.customerComplaint.updateMany({
    where: { status: { in: ["OPEN", "INVESTIGATING"] }, escalated: false, slaTargetAt: { lt: new Date() } },
    data: { escalated: true, escalatedAt: new Date() },
  });
  console.log(`[scheduler] complaint escalation check: ${overdue.count} complaint(s) escalated, ${Date.now() - startedAt}ms`);
}

// EFS §299.2 "Overdue Action Monitoring" — same disclosed-default
// pattern as complaint escalation: any finding whose
// targetRemediationDate has passed and isn't yet IMPLEMENTED/VERIFIED/
// CLOSED gets flagged.
async function runAuditFindingOverdueCheck() {
  const startedAt = Date.now();
  const overdue = await prisma.auditFinding.updateMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, overdue: false, targetRemediationDate: { not: null, lt: new Date() } },
    data: { overdue: true },
  });
  console.log(`[scheduler] audit finding overdue check: ${overdue.count} finding(s) flagged overdue, ${Date.now() - startedAt}ms`);
}

export function startScheduler() {
  // 01:00 every day, server time — after any prior day's end-of-day
  // activity, before the next business day starts.
  cron.schedule("0 1 * * *", () => {
    claimAndRun("ARREARS_CHECK", runArrearsCheck).catch((err) => console.error("[scheduler] arrears check failed:", err));
    claimAndRun("STANDING_INSTRUCTIONS", runStandingInstructions).catch((err) => console.error("[scheduler] standing instructions failed:", err));
    claimAndRun("RECURRING_JOURNALS", runRecurringJournals).catch((err) => console.error("[scheduler] recurring journals failed:", err));
    claimAndRun("SAVINGS_INTEREST_ACCRUAL", runSavingsInterestAccrual).catch((err) => console.error("[scheduler] savings interest accrual failed:", err));
    claimAndRun("COMPLAINT_ESCALATION_CHECK", runComplaintEscalationCheck).catch((err) => console.error("[scheduler] complaint escalation check failed:", err));
    claimAndRun("AUDIT_FINDING_OVERDUE_CHECK", runAuditFindingOverdueCheck).catch((err) => console.error("[scheduler] audit finding overdue check failed:", err));
  });
  // 02:00 on the 1st of the month — after the same day's 01:00 accrual
  // run has already captured the final day of the prior month, so
  // posting never runs against a stale figure.
  cron.schedule("0 2 1 * *", () => {
    claimAndRun("SAVINGS_INTEREST_POSTING", runSavingsInterestPosting).catch((err) => console.error("[scheduler] savings interest posting failed:", err));
  });
  console.log(
    "[scheduler] started (distributed-claim guarded, process " + PROCESS_ID + ") — arrears check + standing instructions + recurring journals + savings interest accrual + complaint escalation check + audit finding overdue check scheduled daily at 01:00; savings interest posting scheduled monthly at 02:00 on the 1st"
  );
}

// Exported so an admin route (or a manual run during testing/pilot setup)
// can trigger these on demand rather than waiting for the next scheduled run.
export { runArrearsCheck, runStandingInstructions, runRecurringJournals, runSavingsInterestAccrual, runSavingsInterestPosting, runComplaintEscalationCheck, runAuditFindingOverdueCheck };
