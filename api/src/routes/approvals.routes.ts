import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

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
async function applyApproval(request: { id: string; type: string; targetId: string; institutionId: string; requestedById: string; payload: any }) {
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

  await applyApproval(request);

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

  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED", resolvedById: req.auth!.userId, resolvedAt: new Date(), resolutionNote },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "approval.reject", resource: "approval_request", resourceId: request.id, metadata: { type: request.type, targetId: request.targetId } },
  });

  res.json({ ok: true });
});
