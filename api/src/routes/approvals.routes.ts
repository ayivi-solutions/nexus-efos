import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { generateSchedule, round2 } from "../lib/loanSchedule";

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

  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED", resolvedById: req.auth!.userId, resolvedAt: new Date(), resolutionNote },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "approval.reject", resource: "approval_request", resourceId: request.id, metadata: { type: request.type, targetId: request.targetId } },
  });

  res.json({ ok: true });
});
