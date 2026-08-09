// GAP-GL-001 follow-up: extracted from loan.routes.ts's /repayments
// endpoint (GAP-FIN-002) after finding collections.routes.ts's
// /transactions endpoint had its own SEPARATE, divergent loan-repayment
// path that never got that fix — it created a bare LoanRepayment row and
// deliberately skipped installment allocation and loan status updates,
// deferring them to some later, unspecified "next installment view."
// Two implementations of the same operation drift; this is the one
// correct implementation, used by both the direct repayment endpoint and
// the field-collections endpoint, so they can never disagree again.
//
// Deliberately takes `tx` (the caller's transaction client) rather than
// managing its own transaction — the caller decides isolation level and
// what else needs to commit atomically alongside this (GL posting, a
// CollectionTransaction record, etc.).
import { allocateRepayment } from "./loanSchedule";

export async function applyLoanRepaymentInTx(tx: any, loanId: string, amount: number, recordedById: string) {
  const loan = await tx.loan.findUniqueOrThrow({
    where: { id: loanId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });

  const repayment = await tx.loanRepayment.create({
    data: { loanId: loan.id, amount, recordedById },
  });

  const installmentStates = loan.installments.map((inst: any) => ({
    id: inst.id,
    interestDue: Number(inst.interestDue),
    principalDue: Number(inst.principalDue),
    interestPaid: Number(inst.interestPaid),
    principalPaid: Number(inst.principalPaid),
    status: inst.status,
  }));
  const updates = allocateRepayment(installmentStates, amount);
  for (const u of updates) {
    await tx.loanInstallment.update({
      where: { id: u.id },
      data: { interestPaid: u.newInterestPaid, principalPaid: u.newPrincipalPaid, status: u.newStatus },
    });
  }

  const allInstallments = await tx.loanInstallment.findMany({ where: { loanId: loan.id } });
  const loanClosed = allInstallments.length > 0 && allInstallments.every((i: any) => i.status === "PAID");

  if (loanClosed) {
    await tx.loan.update({ where: { id: loan.id }, data: { status: "CLOSED" } });
  } else if (loan.status === "DISBURSED") {
    await tx.loan.update({ where: { id: loan.id }, data: { status: "ACTIVE" } });
  }

  return { repayment, loanClosed };
}
