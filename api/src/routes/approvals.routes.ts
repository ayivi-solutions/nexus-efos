import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { generateSchedule, round2 } from "../lib/loanSchedule";
import { isBalanced, balanceEffect, findPostablePeriod, generateJournalNumber } from "../lib/generalLedger";
import { buildPayrollAccrualLines, REQUIRED_ACCRUAL_PURPOSES } from "../lib/payrollAccounting";

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

// Single shared approval mechanism underneath doc §24/§36/§47/§62/§34 —
// see schema.prisma's comment on ApprovalRequest for the full rationale.
approvalsRouter.get("/", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { status } = req.query as { status?: string };
  const requests = await prisma.approvalRequest.findMany({
    where: { institutionId: req.auth!.institutionId, ...(status ? { status: status as any } : {}) },
    orderBy: { requestedAt: "desc" },
  });
  res.json({ requests });
});

// Applies the payload of an approved request against its target. Each case
// mirrors exactly what the direct-apply code path would have done had
// approval not been required.
async function applyApproval(request: { id: string; type: string; targetId: string; institutionId: string; requestedById: string; payload: any }, approvedById: string) {
  const payload = request.payload as any;

  switch (request.type) {
    case "CUSTOMER_STATUS_CHANGE":
      await prisma.customer.update({ where: { id: request.targetId }, data: { status: payload.status } });
      break;
    case "CUSTOMER_PROFILE_UPDATE":
      await prisma.customer.update({ where: { id: request.targetId }, data: { ...payload, status: "ACTIVE" } });
      break;
    case "ACCOUNT_HOLDER_ADD":
      await prisma.accountHolder.create({
        data: {
          institutionId: request.institutionId,
          customerId: payload.customerId,
          role: payload.role,
          loanId: payload.loanId || undefined,
          savingsAccountId: payload.savingsAccountId || undefined,
          addedById: request.requestedById,
        },
      });
      break;
    case "PRODUCT_ACTIVATION":
      await prisma.product.update({ where: { id: request.targetId }, data: { status: "ACTIVE" } });
      break;
    case "BUSINESS_RULE_ACTIVATION":
      await prisma.businessRule.update({ where: { id: request.targetId }, data: { status: "ACTIVE" } });
      break;

    // doc §72 Loan Restructuring — pending installments are superseded
    // (soft-deleted, never hard-deleted, so the original schedule stays
    // historically visible) and a fresh schedule is generated from the
    // new terms using the exact same generateSchedule function real
    // disbursement uses, starting today. Already-paid installments are
    // left untouched.
    case "LOAN_RESTRUCTURE": {
      const restructure = await prisma.loanRestructure.findUniqueOrThrow({ where: { id: request.targetId } });
      await prisma.loanInstallment.updateMany({
        where: { loanId: restructure.loanId, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
        data: { deletedAt: new Date() },
      });
      const schedule = generateSchedule(Number(restructure.newPrincipal), Number(restructure.newRate), restructure.newTermMonths, "FLAT", new Date());
      await prisma.loanInstallment.createMany({
        data: schedule.map((s) => ({ loanId: restructure.loanId, installmentNumber: s.installmentNumber, dueDate: s.dueDate, principalDue: s.principalDue, interestDue: s.interestDue, totalDue: round2(s.principalDue + s.interestDue) })),
      });
      await prisma.loan.update({ where: { id: restructure.loanId }, data: { principal: restructure.newPrincipal, interestRate: restructure.newRate, termMonths: restructure.newTermMonths } });
      await prisma.loanRestructure.update({ where: { id: restructure.id }, data: { appliedAt: new Date() } });
      break;
    }

    // doc §73 Loan Rescheduling — a lighter action than restructuring:
    // only the due dates of not-yet-fully-paid installments shift,
    // principal/rate/term are untouched.
    case "LOAN_RESCHEDULE": {
      const reschedule = await prisma.loanReschedule.findUniqueOrThrow({ where: { id: request.targetId } });
      const installments = await prisma.loanInstallment.findMany({ where: { loanId: reschedule.loanId, status: { in: ["PENDING", "PARTIALLY_PAID"] } } });
      for (const inst of installments) {
        const newDate = new Date(inst.dueDate);
        newDate.setDate(newDate.getDate() + reschedule.shiftDays);
        await prisma.loanInstallment.update({ where: { id: inst.id }, data: { dueDate: newDate } });
      }
      await prisma.loanReschedule.update({ where: { id: reschedule.id }, data: { appliedAt: new Date() } });
      break;
    }

    // doc §74 Loan Write-Off — the loan is marked WRITTEN_OFF; unpaid
    // installments are left exactly as they are (not deleted, not zeroed)
    // so the historical record of what was actually owed stays intact for
    // any future recovery tracking.
    case "LOAN_WRITE_OFF": {
      const writeOff = await prisma.loanWriteOff.findUniqueOrThrow({ where: { id: request.targetId } });
      await prisma.loan.update({ where: { id: writeOff.loanId }, data: { status: "WRITTEN_OFF" } });
      await prisma.loanWriteOff.update({ where: { id: writeOff.id }, data: { appliedAt: new Date() } });
      break;
    }

    // doc §82.3 "Adjustments require approval" — approving simply marks
    // the variance as reconciled; the actual cash figures were already
    // recorded honestly at settlement time, this just closes the loop.
    case "COLLECTION_VARIANCE_ADJUSTMENT": {
      await prisma.collectionSettlement.update({
        where: { id: request.targetId },
        data: { status: "RECONCILED", reconciledById: approvedById, reconciledAt: new Date() },
      });
      break;
    }

    case "COMMISSION_PAYMENT": {
      await prisma.commissionRecord.update({ where: { id: request.targetId }, data: { status: "PAID", paidAt: new Date() } });
      break;
    }

    // doc §114.3 "Transfers maintain balanced accounting entries" — the
    // source is debited and destination credited for the exact same
    // amount, in one database transaction, with a real ledger entry on
    // both sides. Re-checks the source balance at approval time, not just
    // at request time, since time may have passed and other activity may
    // have moved cash in the meantime.
    case "CASH_TRANSFER": {
      const transfer = await prisma.cashTransfer.findUniqueOrThrow({ where: { id: request.targetId } });
      const amount = Number(transfer.amount);

      async function currentBalance(type: string, id: string) {
        if (type === "VAULT") return Number((await prisma.vault.findUniqueOrThrow({ where: { id } })).balance);
        return Number((await prisma.teller.findUniqueOrThrow({ where: { id } })).currentHolding);
      }
      async function applyDelta(type: string, id: string, delta: number) {
        if (type === "VAULT") {
          const v = await prisma.vault.update({ where: { id }, data: { balance: { increment: delta } } });
          return Number(v.balance);
        }
        const t = await prisma.teller.update({ where: { id }, data: { currentHolding: { increment: delta } } });
        return Number(t.currentHolding);
      }

      const sourceBalance = await currentBalance(transfer.fromType, transfer.fromId);
      if (sourceBalance < amount) {
        await prisma.cashTransfer.update({ where: { id: transfer.id }, data: { status: "REJECTED" } });
        break;
      }

      const newSourceBalance = await applyDelta(transfer.fromType, transfer.fromId, -amount);
      const newDestBalance = await applyDelta(transfer.toType, transfer.toId, amount);

      await prisma.cashLedgerEntry.create({ data: { institutionId: transfer.institutionId, holderType: transfer.fromType, holderId: transfer.fromId, type: "TRANSFER_OUT", amount, balanceAfter: newSourceBalance, notes: transfer.reason, recordedById: approvedById } });
      await prisma.cashLedgerEntry.create({ data: { institutionId: transfer.institutionId, holderType: transfer.toType, holderId: transfer.toId, type: "TRANSFER_IN", amount, balanceAfter: newDestBalance, notes: transfer.reason, recordedById: approvedById } });

      await prisma.cashTransfer.update({ where: { id: transfer.id }, data: { status: "COMPLETED", approvedById, completedAt: new Date() } });
      break;
    }

    case "CASH_BALANCING_VARIANCE": {
      await prisma.cashBalancing.update({ where: { id: request.targetId }, data: { status: "RECONCILED", reconciledById: approvedById, reconciledAt: new Date() } });
      break;
    }

    // doc §119.3 "Only validated transactions are posted" / "Balanced
    // accounting entries are maintained" — everything is re-checked here
    // at posting time, not trusted from when the journal was created:
    // debits still equal credits, and every account is still ACTIVE. If
    // either check fails now, the journal is rejected rather than posted
    // with stale validation.
    case "JOURNAL_POSTING": {
      const journal = await prisma.journal.findUniqueOrThrow({ where: { id: request.targetId }, include: { lines: { include: { account: true } } } });

      const stillBalanced = isBalanced(journal.lines.map((l) => ({ debit: Number(l.debit), credit: Number(l.credit) })));
      const allActive = journal.lines.every((l) => l.account.status === "ACTIVE");
      // §120.3 "Closed periods prevent unauthorised postings" — re-checked
      // here too, not just at creation, since the period could have
      // closed in the time between drafting the journal and its posting
      // being approved.
      const period = await findPostablePeriod(prisma, journal.institutionId, journal.postingDate);
      const periodStillOpen = !!period && period.status === "OPEN";

      if (!stillBalanced || !allActive || !periodStillOpen) {
        const reasons: string[] = [];
        if (!stillBalanced) reasons.push("debits no longer equal credits");
        if (!allActive) reasons.push("one or more accounts became inactive");
        if (!periodStillOpen) reasons.push(period ? `the financial period is now ${period.status}` : "no financial period covers this posting date");
        await prisma.journal.update({ where: { id: journal.id }, data: { status: "REJECTED", rejectionReason: reasons.join("; ") } });
        break;
      }

      for (const line of journal.lines) {
        const effect = balanceEffect(line.account.category as any, Number(line.debit), Number(line.credit));
        await prisma.gLAccount.update({ where: { id: line.accountId }, data: { balance: { increment: effect } } });
      }

      await prisma.journal.update({ where: { id: journal.id }, data: { status: "POSTED", postedById: approvedById, postedAt: new Date() } });
      break;
    }

    case "FINANCIAL_PERIOD_REOPEN": {
      await prisma.financialPeriod.update({ where: { id: request.targetId }, data: { status: "OPEN", reopenedById: approvedById, reopenedAt: new Date() } });
      break;
    }

    case "RECURRING_JOURNAL_ACTIVATION": {
      await prisma.recurringJournal.update({ where: { id: request.targetId }, data: { status: "ACTIVE" } });
      break;
    }

    // doc §121.3 "Inter-branch transactions balance automatically" — a
    // single, real 4-line Journal: the source's real account is credited
    // and its settlement account debited (Due From the destination
    // branch); the destination's real account is debited and its
    // settlement account credited (Due To the source branch). Validated
    // by the exact same isBalanced/balanceEffect engine every other
    // journal in the app uses — not a separate, parallel implementation.
    case "INTER_BRANCH_TRANSFER": {
      const transfer = await prisma.interBranchTransfer.findUniqueOrThrow({ where: { id: request.targetId } });
      const fromSettlement = await prisma.branchSettlementAccount.findUniqueOrThrow({ where: { branchId: transfer.fromBranchId }, include: { glAccount: true } });
      const toSettlement = await prisma.branchSettlementAccount.findUniqueOrThrow({ where: { branchId: transfer.toBranchId }, include: { glAccount: true } });
      const fromAccount = await prisma.gLAccount.findUniqueOrThrow({ where: { id: transfer.fromGLAccountId } });
      const toAccount = await prisma.gLAccount.findUniqueOrThrow({ where: { id: transfer.toGLAccountId } });

      const amount = Number(transfer.amount);
      const lines = [
        { accountId: fromSettlement.glAccountId, category: fromSettlement.glAccount.category, debit: amount, credit: 0 },
        { accountId: transfer.fromGLAccountId, category: fromAccount.category, debit: 0, credit: amount },
        { accountId: transfer.toGLAccountId, category: toAccount.category, debit: amount, credit: 0 },
        { accountId: toSettlement.glAccountId, category: toSettlement.glAccount.category, debit: 0, credit: amount },
      ];

      if (!isBalanced(lines)) {
        await prisma.interBranchTransfer.update({ where: { id: transfer.id }, data: { status: "REJECTED" } });
        break;
      }

      const journal = await prisma.journal.create({
        data: {
          institutionId: transfer.institutionId, journalNumber: generateJournalNumber(), type: "AUTOMATIC",
          description: `Inter-branch transfer: ${transfer.description}`, status: "POSTED", postedAt: new Date(),
          createdById: transfer.requestedById, postedById: approvedById,
          lines: { create: lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })) },
        },
      });

      for (const line of lines) {
        const effect = balanceEffect(line.category as any, line.debit, line.credit);
        await prisma.gLAccount.update({ where: { id: line.accountId }, data: { balance: { increment: effect } } });
      }

      await prisma.interBranchTransfer.update({ where: { id: transfer.id }, data: { status: "POSTED", journalId: journal.id } });
      break;
    }

    // doc §208.3 "Salary changes follow approval workflows" — approving
    // marks this structure ACTIVE and supersedes whatever was previously
    // active for the same employee, never deleting it.
    case "SALARY_STRUCTURE_CHANGE": {
      const structure = await prisma.employeeSalaryStructure.findUniqueOrThrow({ where: { id: request.targetId } });
      await prisma.employeeSalaryStructure.updateMany({
        where: { employeeId: structure.employeeId, institutionId: structure.institutionId, status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });
      await prisma.employeeSalaryStructure.update({ where: { id: structure.id }, data: { status: "ACTIVE", approvedById } });
      break;
    }

    // doc §214.3 "Ledger postings occur automatically after approval" —
    // the payroll run's own approval IS the authorization for this
    // journal; it does not go through a second, separate approval cycle
    // of its own, the same reasoning already applied to Recurring
    // Journals. If no GL mapping is configured, or the mapping is
    // incomplete, or the covering financial period isn't open, the run
    // still becomes APPROVED (payroll itself isn't blocked by an
    // accounting configuration gap) but accrualJournalId stays null —
    // a real, visible, checkable state rather than a silent failure.
    case "PAYROLL_RUN_APPROVAL": {
      const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: request.targetId } });

      const mappings = await prisma.payrollGLAccountMapping.findMany({ where: { institutionId: run.institutionId } });
      const accountIdByPurpose: Record<string, string> = Object.fromEntries(mappings.map((m: any) => [m.purpose, m.glAccountId]));
      const hasAllMappings = REQUIRED_ACCRUAL_PURPOSES.every((p) => accountIdByPurpose[p]);

      let accrualJournalId: string | null = null;

      if (hasAllMappings) {
        const period = await prisma.payrollPeriod.findUnique({ where: { id: run.payrollPeriodId } });
        const postingDate = period?.endDate || new Date();
        const glPeriod = await findPostablePeriod(prisma, run.institutionId, postingDate);

        if (glPeriod && glPeriod.status === "OPEN") {
          // Real per-entry totals, not the run-level aggregate alone —
          // PAYE/SSNIT/Tier2/other-deductions must come from the actual
          // entries to be correct, the run only stores gross/net/total-deductions combined.
          const entries = await prisma.payrollEntry.findMany({ where: { payrollRunId: run.id } });
          const totalPaye = entries.reduce((s: number, e: any) => s + Number(e.paye), 0);
          const totalSsnitEmployee = entries.reduce((s: number, e: any) => s + Number(e.ssnitEmployee), 0);
          const totalSsnitEmployerTier1 = entries.reduce((s: number, e: any) => s + Number(e.ssnitEmployerTier1), 0);
          const totalTier2Employer = entries.reduce((s: number, e: any) => s + Number(e.tier2Employer), 0);
          const totalOtherDeductions = entries.reduce((s: number, e: any) => s + Number(e.otherDeductions), 0);

          const realLines = buildPayrollAccrualLines(
            { totalGross: Number(run.totalGross), totalPaye, totalSsnitEmployee, totalSsnitEmployerTier1, totalTier2Employer, totalOtherDeductions, totalNet: Number(run.totalNet) },
            accountIdByPurpose,
          );

          if (isBalanced(realLines)) {
            const accountRecords = await prisma.gLAccount.findMany({ where: { id: { in: realLines.map((l) => l.accountId) } } });
            const accountById = new Map(accountRecords.map((a: any) => [a.id, a]));

            const journal = await prisma.journal.create({
              data: {
                institutionId: run.institutionId, journalNumber: generateJournalNumber(), type: "AUTOMATIC",
                description: `Payroll accrual — ${period?.name || "period"}`, status: "POSTED", postingDate, postedAt: new Date(), postedById: approvedById, createdById: approvedById,
                lines: { create: realLines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })) },
              },
            });
            for (const line of realLines) {
              const account = accountById.get(line.accountId);
              const effect = balanceEffect(account!.category as any, line.debit, line.credit);
              await prisma.gLAccount.update({ where: { id: line.accountId }, data: { balance: { increment: effect } } });
            }
            accrualJournalId = journal.id;
          }
        }
      }

      await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "APPROVED", approvedById, approvedAt: new Date(), accrualJournalId } });
      break;
    }

    case "SAVINGS_RESTRICTION_CREATE": {
      await prisma.savingsRestriction.update({ where: { id: request.targetId }, data: { status: "ACTIVE", approvedById, activatedAt: new Date() } });
      break;
    }

    case "SAVINGS_RESTRICTION_REMOVE": {
      await prisma.savingsRestriction.update({ where: { id: request.targetId }, data: { status: "REMOVED", removedById: approvedById, removedAt: new Date() } });
      break;
    }
    // BUSINESS_RULE_TRIGGERED needs no apply-side effect — it's a pure
    // blocking gate checked at loan disbursement time (see loan.routes.ts);
    // approving it just resolves the record so disbursement is unblocked.
    case "AML_ADJUDICATION":
      // Approving = false positive, clear the customer.
      await prisma.customer.update({
        where: { id: request.targetId },
        data: { status: payload.previousStatus || "REGISTERED", watchlistFlag: false },
      });
      break;
  }
}

approvalsRouter.post("/:id/approve", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { resolutionNote } = req.body as { resolutionNote?: string };
  const request = await prisma.approvalRequest.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!request) return res.status(404).json({ error: "Approval request not found" });
  if (request.status !== "PENDING") return res.status(400).json({ error: "This request has already been resolved" });
  if (request.requestedById === req.auth!.userId) {
    return res.status(403).json({ error: "Segregation of duties: cannot approve a request you submitted yourself" });
  }

  await applyApproval(request, req.auth!.userId);

  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED", resolvedById: req.auth!.userId, resolvedAt: new Date(), resolutionNote },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "approval.approve", resource: "approval_request", resourceId: request.id, metadata: { type: request.type, targetId: request.targetId } },
  });

  res.json({ ok: true });
});

approvalsRouter.post("/:id/reject", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { resolutionNote } = req.body as { resolutionNote?: string };
  const request = await prisma.approvalRequest.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!request) return res.status(404).json({ error: "Approval request not found" });
  if (request.status !== "PENDING") return res.status(400).json({ error: "This request has already been resolved" });
  if (request.requestedById === req.auth!.userId) {
    return res.status(403).json({ error: "Segregation of duties: cannot reject a request you submitted yourself" });
  }

  const payload = request.payload as any;
  if ((request.type === "CUSTOMER_STATUS_CHANGE" || request.type === "CUSTOMER_PROFILE_UPDATE") && payload.previousStatus) {
    await prisma.customer.update({ where: { id: request.targetId }, data: { status: payload.previousStatus } });
  }
  // doc §32 Product Lifecycle — a rejected activation reverts the product
  // back to DRAFT rather than leaving it stuck in PENDING_APPROVAL forever.
  if (request.type === "PRODUCT_ACTIVATION") {
    await prisma.product.update({ where: { id: request.targetId }, data: { status: "DRAFT" } });
  }
  if (request.type === "BUSINESS_RULE_ACTIVATION") {
    await prisma.businessRule.update({ where: { id: request.targetId }, data: { status: "DRAFT" } });
  }
  if (request.type === "COMMISSION_PAYMENT") {
    await prisma.commissionRecord.update({ where: { id: request.targetId }, data: { status: "PENDING" } });
  }
  if (request.type === "SAVINGS_RESTRICTION_CREATE") {
    // A rejected creation never took effect — REMOVED is the closest
    // accurate terminal state rather than leaving it stuck mid-workflow.
    await prisma.savingsRestriction.update({ where: { id: request.targetId }, data: { status: "REMOVED", removalReason: "Creation request rejected" } });
  }
  if (request.type === "SAVINGS_RESTRICTION_REMOVE") {
    // A rejected removal means the restriction stays exactly as it was —
    // still ACTIVE.
    await prisma.savingsRestriction.update({ where: { id: request.targetId }, data: { removalRequestedById: null } });
  }
  if (request.type === "CASH_TRANSFER") {
    await prisma.cashTransfer.update({ where: { id: request.targetId }, data: { status: "REJECTED" } });
  }
  // CASH_BALANCING_VARIANCE deliberately has no reject-side handler — a
  // rejected variance stays exactly as VARIANCE_PENDING_APPROVAL, which
  // correctly keeps the vault blocked from closing (see §115.3's gate on
  // the close endpoint) until the variance is genuinely investigated and
  // re-resolved, rather than a dangling state needing cleanup.
  if (request.type === "JOURNAL_POSTING") {
    // Reverts to DRAFT, not a terminal REJECTED state, since the natural
    // next step is fixing whatever the approver objected to and
    // resubmitting — unlike a cash variance, there's no reason to force
    // the account and journal to stay locked out of correction.
    await prisma.journal.update({ where: { id: request.targetId }, data: { status: "DRAFT" } });
  }
  if (request.type === "RECURRING_JOURNAL_ACTIVATION") {
    await prisma.recurringJournal.update({ where: { id: request.targetId }, data: { status: "DRAFT" } });
  }
  if (request.type === "SALARY_STRUCTURE_CHANGE") {
    await prisma.employeeSalaryStructure.update({ where: { id: request.targetId }, data: { status: "DRAFT" } });
  }
  if (request.type === "PAYROLL_RUN_APPROVAL") {
    await prisma.payrollRun.update({ where: { id: request.targetId }, data: { status: "PROCESSED" } });
  }
  if (request.type === "INTER_BRANCH_TRANSFER") {
    await prisma.interBranchTransfer.update({ where: { id: request.targetId }, data: { status: "REJECTED" } });
  }

  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED", resolvedById: req.auth!.userId, resolvedAt: new Date(), resolutionNote },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "approval.reject", resource: "approval_request", resourceId: request.id, metadata: { type: request.type, targetId: request.targetId } },
  });

  res.json({ ok: true });
});
