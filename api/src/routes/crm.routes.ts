import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// EFS §157 Customer Interaction Management + §160 Customer Complaint
// Management. Also directly covers the Operations Supervisor role
// schedule's named task ("make follow-up calls on loan defaulters and
// weekly payment clients") via CustomerInteraction.followUpScheduledAt.
export const crmRouter = Router();
crmRouter.use(requireAuth);

// ---------------------------------------------------------------------
// §157 Customer Interaction Management
// ---------------------------------------------------------------------

crmRouter.get("/interactions", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const { customerId, dueForFollowUp } = req.query as { customerId?: string; dueForFollowUp?: string };
  const interactions = await prisma.customerInteraction.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(customerId ? { customerId } : {}),
      ...(dueForFollowUp === "true"
        ? { followUpScheduledAt: { not: null, lte: new Date() }, followUpCompleted: false }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ interactions });
});

const createInteractionSchema = z.object({
  customerId: z.string(),
  channel: z.enum(["CALL", "BRANCH_VISIT", "EMAIL", "SMS", "LIVE_CHAT", "SOCIAL_MEDIA", "MEETING"]),
  summary: z.string().min(1),
  followUpScheduledAt: z.string().optional(),
});

crmRouter.post("/interactions", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = createInteractionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, institutionId: req.auth!.institutionId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const interaction = await prisma.customerInteraction.create({
    data: {
      institutionId: req.auth!.institutionId,
      customerId: parsed.data.customerId,
      channel: parsed.data.channel,
      summary: parsed.data.summary,
      followUpScheduledAt: parsed.data.followUpScheduledAt ? new Date(parsed.data.followUpScheduledAt) : undefined,
      recordedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer_interaction.record", resource: "customer_interaction", resourceId: interaction.id, metadata: { customerId: parsed.data.customerId, channel: parsed.data.channel } },
  });

  res.status(201).json({ interaction });
});

const followUpSchema = z.object({ notes: z.string().optional() });

crmRouter.post("/interactions/:id/complete-follow-up", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = followUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const interaction = await prisma.customerInteraction.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!interaction) return res.status(404).json({ error: "Interaction not found" });
  if (!interaction.followUpScheduledAt) return res.status(400).json({ error: "This interaction has no follow-up scheduled" });
  if (interaction.followUpCompleted) return res.status(400).json({ error: "Follow-up already completed" });

  const updated = await prisma.customerInteraction.update({
    where: { id: interaction.id },
    data: { followUpCompleted: true, followUpCompletedAt: new Date(), followUpCompletedById: req.auth!.userId, followUpNotes: parsed.data.notes },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer_interaction.complete_follow_up", resource: "customer_interaction", resourceId: interaction.id } });
  res.json({ interaction: updated });
});

// ---------------------------------------------------------------------
// §160 Customer Complaint Management
// ---------------------------------------------------------------------

function generateComplaintReference(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return "CMP" + Date.now().toString().slice(-10) + rand;
}

// §160.3 "Service level targets are configurable" — disclosed default,
// no configuration screen exists, flagged the same as the interest
// posting cadence and the security thresholds. In business hours, not
// calendar hours — a CRITICAL complaint logged Friday evening isn't
// meant to breach SLA purely because the weekend happened.
export const SLA_TARGET_HOURS_BY_PRIORITY: Record<string, number> = {
  CRITICAL: 24,
  HIGH: 48,
  MEDIUM: 120, // 5 business days
  LOW: 240, // 10 business days
};

function computeSlaTarget(priority: string, from: Date = new Date()): Date {
  const hours = SLA_TARGET_HOURS_BY_PRIORITY[priority] ?? SLA_TARGET_HOURS_BY_PRIORITY.MEDIUM;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

crmRouter.get("/complaints", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const { customerId, status, escalatedOnly } = req.query as { customerId?: string; status?: string; escalatedOnly?: string };
  const complaints = await prisma.customerComplaint.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(customerId ? { customerId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(escalatedOnly === "true" ? { escalated: true } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ complaints });
});

const createComplaintSchema = z.object({
  customerId: z.string(),
  category: z.enum(["SERVICE_QUALITY", "LOAN_TERMS", "FEES_CHARGES", "STAFF_CONDUCT", "TRANSACTION_ERROR", "FRAUD_SECURITY", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  description: z.string().min(2),
  assignedToId: z.string().optional(),
});

crmRouter.post("/complaints", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = createComplaintSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, institutionId: req.auth!.institutionId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const priority = parsed.data.priority ?? "MEDIUM";
  const complaint = await prisma.customerComplaint.create({
    data: {
      institutionId: req.auth!.institutionId,
      customerId: parsed.data.customerId,
      referenceNumber: generateComplaintReference(),
      category: parsed.data.category,
      priority,
      description: parsed.data.description,
      assignedToId: parsed.data.assignedToId,
      slaTargetAt: computeSlaTarget(priority),
      raisedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "complaint.register", resource: "customer_complaint", resourceId: complaint.id, metadata: { referenceNumber: complaint.referenceNumber, category: parsed.data.category, priority } },
  });

  res.status(201).json({ complaint });
});

async function findComplaintOr404(req: AuthedRequest, res: any) {
  const complaint = await prisma.customerComplaint.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!complaint) {
    res.status(404).json({ error: "Complaint not found" });
    return null;
  }
  return complaint;
}

const investigateSchema = z.object({ assignedToId: z.string().optional(), investigationNotes: z.string().optional() });

crmRouter.post("/complaints/:id/investigate", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = investigateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const complaint = await findComplaintOr404(req, res);
  if (!complaint) return;
  if (complaint.status !== "OPEN") return res.status(400).json({ error: `Cannot move to investigating from ${complaint.status}` });

  const updated = await prisma.customerComplaint.update({
    where: { id: complaint.id },
    data: { status: "INVESTIGATING", assignedToId: parsed.data.assignedToId ?? complaint.assignedToId, investigationNotes: parsed.data.investigationNotes },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "complaint.investigate", resource: "customer_complaint", resourceId: complaint.id } });
  res.json({ complaint: updated });
});

const resolveSchema = z.object({ resolutionNotes: z.string().min(2), customerNotified: z.boolean().optional() });

crmRouter.post("/complaints/:id/resolve", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const complaint = await findComplaintOr404(req, res);
  if (!complaint) return;
  if (complaint.status !== "OPEN" && complaint.status !== "INVESTIGATING") {
    return res.status(400).json({ error: `Cannot resolve from status ${complaint.status}` });
  }

  const updated = await prisma.customerComplaint.update({
    where: { id: complaint.id },
    data: {
      status: "RESOLVED",
      resolutionNotes: parsed.data.resolutionNotes,
      resolvedAt: new Date(),
      resolvedById: req.auth!.userId,
      customerNotifiedAt: parsed.data.customerNotified ? new Date() : undefined,
    },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "complaint.resolve", resource: "customer_complaint", resourceId: complaint.id } });
  res.json({ complaint: updated });
});

crmRouter.post("/complaints/:id/close", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const complaint = await findComplaintOr404(req, res);
  if (!complaint) return;
  if (complaint.status !== "RESOLVED") return res.status(400).json({ error: "Only a resolved complaint can be closed" });
  const updated = await prisma.customerComplaint.update({ where: { id: complaint.id }, data: { status: "CLOSED" } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "complaint.close", resource: "customer_complaint", resourceId: complaint.id } });
  res.json({ complaint: updated });
});
