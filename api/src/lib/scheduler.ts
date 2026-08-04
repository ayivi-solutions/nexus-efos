import cron from "node-cron";
import { prisma } from "./prisma";
import { calculateArrears } from "./arrears";
import { nextExecutionDate } from "./standingInstructions";
import { isBalanced, balanceEffect, generateJournalNumber, findPostablePeriod } from "./generalLedger";

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

export function startScheduler() {
  // 01:00 every day, server time — after any prior day's end-of-day
  // activity, before the next business day starts.
  cron.schedule("0 1 * * *", () => {
    runArrearsCheck().catch((err) => console.error("[scheduler] arrears check failed:", err));
    runStandingInstructions().catch((err) => console.error("[scheduler] standing instructions failed:", err));
    runRecurringJournals().catch((err) => console.error("[scheduler] recurring journals failed:", err));
  });
  console.log("[scheduler] started — arrears check + standing instructions + recurring journals scheduled daily at 01:00");
}

// Exported so an admin route (or a manual run during testing/pilot setup)
// can trigger these on demand rather than waiting for the next scheduled run.
export { runArrearsCheck, runStandingInstructions, runRecurringJournals };
