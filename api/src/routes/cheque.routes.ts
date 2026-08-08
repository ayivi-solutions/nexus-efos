import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// Operations Supervisor role schedule (Neighbourhood Microfinance Ltd,
// June 2026) — "Monitor and confirm outgoing cheques daily and during
// disbursements." Built as a standard, complete cheque register for a
// financial institution (both directions, a real clearing lifecycle),
// not narrowed to only that one line — see the reasoning on the Cheque
// model in schema.prisma. Not named in the ECD/EFS/ETAS/PDDS/ESS at all.
//
// This is a tracking/audit register, not a money-movement engine: it
// doesn't itself create SavingsTransaction rows on CLEARED or touch
// Loan.disbursedAt — those remain whatever existing workflow already
// handles the actual deposit/disbursement. customerId/savingsAccountId/
// loanId here are for cross-reference (so a cheque can be found from the
// account or loan it relates to), not a trigger for other tables.
export const chequeRouter = Router();
chequeRouter.use(requireAuth);

chequeRouter.get("/", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { direction, status } = req.query as { direction?: string; status?: string };
  const cheques = await prisma.cheque.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(direction ? { direction: direction as any } : {}),
      ...(status ? { status: status as any } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ cheques });
});

// The doc's actual daily task, made queryable directly rather than
// leaving the person to filter the full register by eye every morning:
// every cheque not yet confirmed today, regardless of status.
chequeRouter.get("/pending-confirmation", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cheques = await prisma.cheque.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      status: { notIn: ["CLEARED", "BOUNCED", "STOPPED", "CANCELLED"] },
      OR: [{ confirmedAt: null }, { confirmedAt: { lt: todayStart } }],
    },
    orderBy: { chequeDate: "asc" },
  });
  res.json({ cheques });
});

const createChequeSchema = z.object({
  direction: z.enum(["INWARD", "OUTWARD"]),
  chequeNumber: z.string().min(1),
  bankName: z.string().min(1),
  chequeDate: z.string(), // may be in the future — a post-dated cheque is just this
  amount: z.number().positive(),
  payerName: z.string().optional(),
  payeeName: z.string().optional(),
  customerId: z.string().optional(),
  savingsAccountId: z.string().optional(),
  loanId: z.string().optional(),
});

chequeRouter.post("/", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = createChequeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  if (d.direction === "INWARD" && !d.payerName) {
    return res.status(400).json({ error: "payerName is required for an inward cheque" });
  }
  if (d.direction === "OUTWARD" && !d.payeeName) {
    return res.status(400).json({ error: "payeeName is required for an outward cheque" });
  }

  const cheque = await prisma.cheque.create({
    data: {
      institutionId: req.auth!.institutionId,
      direction: d.direction,
      chequeNumber: d.chequeNumber,
      bankName: d.bankName,
      chequeDate: new Date(d.chequeDate),
      amount: d.amount,
      payerName: d.payerName,
      payeeName: d.payeeName,
      customerId: d.customerId,
      savingsAccountId: d.savingsAccountId,
      loanId: d.loanId,
      status: d.direction === "INWARD" ? "RECEIVED" : "ISSUED",
      recordedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cheque.record", resource: "cheque", resourceId: cheque.id, metadata: { direction: d.direction, amount: d.amount, chequeNumber: d.chequeNumber } },
  });

  res.status(201).json({ cheque });
});

async function findChequeOr404(req: AuthedRequest, res: any) {
  const cheque = await prisma.cheque.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!cheque) {
    res.status(404).json({ error: "Cheque not found" });
    return null;
  }
  return cheque;
}

// The doc's actual daily task: confirming a cheque was checked, without
// necessarily changing its clearing status yet.
chequeRouter.post("/:id/confirm", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const cheque = await findChequeOr404(req, res);
  if (!cheque) return;
  const updated = await prisma.cheque.update({ where: { id: cheque.id }, data: { confirmedById: req.auth!.userId, confirmedAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cheque.confirm", resource: "cheque", resourceId: cheque.id } });
  res.json({ cheque: updated });
});

chequeRouter.post("/:id/submit-clearing", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const cheque = await findChequeOr404(req, res);
  if (!cheque) return;
  if (cheque.status !== "RECEIVED" && cheque.status !== "ISSUED") {
    return res.status(400).json({ error: `Cannot submit for clearing from status ${cheque.status}` });
  }
  const updated = await prisma.cheque.update({ where: { id: cheque.id }, data: { status: "PENDING_CLEARING", clearingSubmittedAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cheque.submit_clearing", resource: "cheque", resourceId: cheque.id } });
  res.json({ cheque: updated });
});

chequeRouter.post("/:id/clear", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const cheque = await findChequeOr404(req, res);
  if (!cheque) return;
  if (cheque.status !== "PENDING_CLEARING") return res.status(400).json({ error: "Cheque is not pending clearing" });
  const updated = await prisma.cheque.update({ where: { id: cheque.id }, data: { status: "CLEARED", clearedAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cheque.clear", resource: "cheque", resourceId: cheque.id } });
  res.json({ cheque: updated });
});

const bounceSchema = z.object({ reason: z.string().min(2) });

chequeRouter.post("/:id/bounce", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = bounceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cheque = await findChequeOr404(req, res);
  if (!cheque) return;
  if (cheque.status !== "PENDING_CLEARING") return res.status(400).json({ error: "Cheque is not pending clearing" });
  const updated = await prisma.cheque.update({ where: { id: cheque.id }, data: { status: "BOUNCED", bouncedAt: new Date(), bounceReason: parsed.data.reason } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cheque.bounce", resource: "cheque", resourceId: cheque.id, metadata: { reason: parsed.data.reason } } });
  res.json({ cheque: updated });
});

// Outward only — payment stopped before the bank processes it.
chequeRouter.post("/:id/stop", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const cheque = await findChequeOr404(req, res);
  if (!cheque) return;
  if (cheque.direction !== "OUTWARD") return res.status(400).json({ error: "Only outward cheques can be stopped" });
  if (cheque.status === "CLEARED" || cheque.status === "BOUNCED") {
    return res.status(400).json({ error: `Cannot stop a cheque that is already ${cheque.status}` });
  }
  const updated = await prisma.cheque.update({ where: { id: cheque.id }, data: { status: "STOPPED" } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cheque.stop", resource: "cheque", resourceId: cheque.id } });
  res.json({ cheque: updated });
});

chequeRouter.post("/:id/cancel", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const cheque = await findChequeOr404(req, res);
  if (!cheque) return;
  if (cheque.status !== "RECEIVED" && cheque.status !== "ISSUED") {
    return res.status(400).json({ error: "Only a cheque not yet submitted for clearing can be cancelled" });
  }
  const updated = await prisma.cheque.update({ where: { id: cheque.id }, data: { status: "CANCELLED" } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cheque.cancel", resource: "cheque", resourceId: cheque.id } });
  res.json({ cheque: updated });
});
