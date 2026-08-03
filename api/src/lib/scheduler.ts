import cron from "node-cron";
import { prisma } from "./prisma";
import { calculateArrears } from "./arrears";

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

export function startScheduler() {
  // 01:00 every day, server time — after any prior day's end-of-day
  // activity, before the next business day starts.
  cron.schedule("0 1 * * *", () => {
    runArrearsCheck().catch((err) => console.error("[scheduler] arrears check failed:", err));
  });
  console.log("[scheduler] started — arrears check scheduled daily at 01:00");
}

// Exported so an admin route (or a manual run during testing/pilot setup)
// can trigger this on demand rather than waiting for the next scheduled run.
export { runArrearsCheck };
