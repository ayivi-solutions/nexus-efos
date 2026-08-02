// Shared amortization + repayment-allocation logic. Previously lived only
// as private functions inside loan.routes.ts; extracted so Data Migration's
// Full History import can replay real historical repayments through the
// exact same allocation rules real-time repayments use, rather than a
// second, subtly-different reimplementation that could drift out of sync.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ScheduleRow = { installmentNumber: number; dueDate: Date; principalDue: number; interestDue: number };

export function generateSchedule(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  method: string,
  startDate: Date
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];

  if (method === "REDUCING_BALANCE") {
    const monthlyRate = annualRatePct / 100 / 12;
    let balance = principal;
    const payment =
      monthlyRate === 0
        ? principal / termMonths
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);

    for (let i = 1; i <= termMonths; i++) {
      const interestDue = monthlyRate === 0 ? 0 : balance * monthlyRate;
      let principalDue = payment - interestDue;
      if (i === termMonths) principalDue = balance;
      balance -= principalDue;

      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      rows.push({ installmentNumber: i, dueDate, principalDue: round2(principalDue), interestDue: round2(interestDue) });
    }
  } else {
    const totalInterest = principal * (annualRatePct / 100) * (termMonths / 12);
    const principalPerInstallment = principal / termMonths;
    const interestPerInstallment = totalInterest / termMonths;

    for (let i = 1; i <= termMonths; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      rows.push({
        installmentNumber: i,
        dueDate,
        principalDue: round2(principalPerInstallment),
        interestDue: round2(interestPerInstallment),
      });
    }
  }

  return rows;
}

export interface InstallmentState {
  id: string;
  interestDue: number;
  principalDue: number;
  interestPaid: number;
  principalPaid: number;
  status: string;
}

export interface AllocationUpdate {
  id: string;
  newInterestPaid: number;
  newPrincipalPaid: number;
  newStatus: "PAID" | "PARTIALLY_PAID";
}

// Oldest-installment-first, interest-before-principal — the same rule real
// repayments have always used. Mutates each installment object in `installments`
// in place (so a caller replaying several repayments in sequence, like Full
// History migration, sees correctly-updated state on every subsequent call)
// and also returns the list of what changed, for the caller to persist.
export function allocateRepayment(installments: InstallmentState[], amount: number): AllocationUpdate[] {
  let remaining = amount;
  const updates: AllocationUpdate[] = [];

  for (const inst of installments) {
    if (remaining <= 0) break;
    const interestOutstanding = inst.interestDue - inst.interestPaid;
    const principalOutstanding = inst.principalDue - inst.principalPaid;
    if (interestOutstanding <= 0.005 && principalOutstanding <= 0.005) continue;

    let interestPaidNow = 0;
    let principalPaidNow = 0;
    if (interestOutstanding > 0.005) {
      interestPaidNow = Math.min(remaining, interestOutstanding);
      remaining -= interestPaidNow;
    }
    if (remaining > 0 && principalOutstanding > 0.005) {
      principalPaidNow = Math.min(remaining, principalOutstanding);
      remaining -= principalPaidNow;
    }
    if (interestPaidNow > 0 || principalPaidNow > 0) {
      const newInterestPaid = round2(inst.interestPaid + interestPaidNow);
      const newPrincipalPaid = round2(inst.principalPaid + principalPaidNow);
      const fullyPaid = newInterestPaid >= inst.interestDue - 0.01 && newPrincipalPaid >= inst.principalDue - 0.01;
      const newStatus = fullyPaid ? "PAID" : "PARTIALLY_PAID";

      inst.interestPaid = newInterestPaid;
      inst.principalPaid = newPrincipalPaid;
      inst.status = newStatus;
      updates.push({ id: inst.id, newInterestPaid, newPrincipalPaid, newStatus });
    }
  }

  return updates;
}
