import cron from "node-cron";
import { prisma } from "./prisma";
import { calculateArrears } from "./arrears";
import { nextExecutionDate } from "./standingInstructions";

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
      data: { nextExecutionDate: nextExecutionDate(si.nextExecutionDate, si.frequency as any), consecutiveFailures: 0 },
    });
    executed++;
  }

  console.log(`[scheduler] standing instructions: ${due.length} due, ${executed} executed, ${failed} failed, ${Date.now() - startedAt}ms`);
}

export function startScheduler() {
  // 01:00 every day, server time — after any prior day's end-of-day
  // activity, before the next business day starts.
  cron.schedule("0 1 * * *", () => {
    runArrearsCheck().catch((err) => console.error("[scheduler] arrears check failed:", err));
    runStandingInstructions().catch((err) => console.error("[scheduler] standing instructions failed:", err));
  });
  console.log("[scheduler] started — arrears check + standing instructions scheduled daily at 01:00");
}

// Exported so an admin route (or a manual run during testing/pilot setup)
// can trigger these on demand rather than waiting for the next scheduled run.
export { runArrearsCheck, runStandingInstructions };
