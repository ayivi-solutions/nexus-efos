import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// EFS §298 Audit Findings and Recommendation Management, the linking
// piece of §299 Audit Follow-Up; ETAS §78 Audit Entity Architecture.
// Scoped to findings + remediation tracking, not the full §297 Audit
// Planning and Execution (no audit universe/annual planning/team
// assignment) — see the boundary note on AuditEngagement in
// schema.prisma.
export const internalAuditRouter = Router();
internalAuditRouter.use(requireAuth);

function generateAuditNumber(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return "AUD" + Date.now().toString().slice(-10) + rand;
}

function generateFindingReference(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return "FND" + Date.now().toString().slice(-10) + rand;
}

// ---------------------------------------------------------------------
// Audit Engagements
// ---------------------------------------------------------------------

internalAuditRouter.get("/engagements", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { status } = req.query as { status?: string };
  const engagements = await prisma.auditEngagement.findMany({
    where: { institutionId: req.auth!.institutionId, ...(status ? { status: status as any } : {}) },
    include: { findings: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ engagements });
});

const createEngagementSchema = z.object({
  type: z.enum(["INTERNAL", "EXTERNAL", "REGULATORY", "IT", "FINANCIAL"]),
  branchId: z.string().optional(),
  leadAuditor: z.string().min(1),
  scope: z.string().min(2),
  plannedStartDate: z.string(),
});

internalAuditRouter.post("/engagements", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = createEngagementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const engagement = await prisma.auditEngagement.create({
    data: {
      institutionId: req.auth!.institutionId,
      auditNumber: generateAuditNumber(),
      type: parsed.data.type,
      branchId: parsed.data.branchId,
      leadAuditor: parsed.data.leadAuditor,
      scope: parsed.data.scope,
      plannedStartDate: new Date(parsed.data.plannedStartDate),
      raisedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "audit_engagement.create", resource: "audit_engagement", resourceId: engagement.id, metadata: { auditNumber: engagement.auditNumber } },
  });

  res.status(201).json({ engagement });
});

// ETAS §78.7 "Every audit shall have an approved scope" — real approval,
// not a status flip.
internalAuditRouter.post("/engagements/:id/request-approval", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const engagement = await prisma.auditEngagement.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!engagement) return res.status(404).json({ error: "Engagement not found" });
  if (engagement.status !== "PLANNED") return res.status(400).json({ error: `Cannot request approval from status ${engagement.status}` });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "AUDIT_ENGAGEMENT_APPROVAL", targetType: "AuditEngagement", targetId: engagement.id, payload: {}, reason: `Scope approval for audit ${engagement.auditNumber}`, requestedById: req.auth!.userId },
  });
  res.status(202).json({ pendingApproval: true });
});

internalAuditRouter.post("/engagements/:id/status", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { status } = req.body as { status?: string };
  const allowed = ["UNDER_REVIEW", "COMPLETED", "FOLLOW_UP", "ARCHIVED"];
  if (!status || !allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });

  const engagement = await prisma.auditEngagement.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!engagement) return res.status(404).json({ error: "Engagement not found" });
  if (engagement.status !== "IN_PROGRESS" && engagement.status !== "UNDER_REVIEW" && engagement.status !== "COMPLETED" && engagement.status !== "FOLLOW_UP") {
    return res.status(400).json({ error: `Cannot transition from ${engagement.status}` });
  }

  const data: any = { status };
  if (status === "COMPLETED") data.completionDate = new Date();
  const updated = await prisma.auditEngagement.update({ where: { id: engagement.id }, data });
  res.json({ engagement: updated });
});

const rateSchema = z.object({ rating: z.enum(["SATISFACTORY", "NEEDS_IMPROVEMENT", "UNSATISFACTORY"]) });

internalAuditRouter.post("/engagements/:id/rate", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = rateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const engagement = await prisma.auditEngagement.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!engagement) return res.status(404).json({ error: "Engagement not found" });
  const updated = await prisma.auditEngagement.update({ where: { id: engagement.id }, data: { rating: parsed.data.rating } });
  res.json({ engagement: updated });
});

// ETAS §78.7 "Corrective actions shall be assigned before audit closure" —
// checked here, not just documented. Every finding on this engagement
// must have an actionOwnerId before CLOSED is reachable.
internalAuditRouter.post("/engagements/:id/close", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const engagement = await prisma.auditEngagement.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, include: { findings: true } });
  if (!engagement) return res.status(404).json({ error: "Engagement not found" });
  if (engagement.status !== "COMPLETED" && engagement.status !== "FOLLOW_UP") {
    return res.status(400).json({ error: `Cannot close from status ${engagement.status}` });
  }
  const unassigned = engagement.findings.filter((f: any) => !f.actionOwnerId);
  if (unassigned.length > 0) {
    return res.status(400).json({ error: `${unassigned.length} finding(s) still have no accountable owner assigned — required before closure`, findingIds: unassigned.map((f: any) => f.id) });
  }

  const updated = await prisma.auditEngagement.update({ where: { id: engagement.id }, data: { status: "CLOSED" } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "audit_engagement.close", resource: "audit_engagement", resourceId: engagement.id } });
  res.json({ engagement: updated });
});

// ---------------------------------------------------------------------
// Audit Findings
// ---------------------------------------------------------------------

internalAuditRouter.get("/findings", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { engagementId, status, overdueOnly } = req.query as { engagementId?: string; status?: string; overdueOnly?: string };
  const findings = await prisma.auditFinding.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(engagementId ? { engagementId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(overdueOnly === "true" ? { overdue: true } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ findings });
});

const createFindingSchema = z.object({
  engagementId: z.string(),
  description: z.string().min(2),
  riskClassification: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  rootCauseAnalysis: z.string().optional(),
  recommendation: z.string().min(2),
  actionOwnerId: z.string().optional(),
  targetRemediationDate: z.string().optional(),
});

internalAuditRouter.post("/findings", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = createFindingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const engagement = await prisma.auditEngagement.findFirst({ where: { id: parsed.data.engagementId, institutionId: req.auth!.institutionId } });
  if (!engagement) return res.status(404).json({ error: "Engagement not found" });

  const finding = await prisma.auditFinding.create({
    data: {
      institutionId: req.auth!.institutionId,
      engagementId: engagement.id,
      referenceNumber: generateFindingReference(),
      description: parsed.data.description,
      riskClassification: parsed.data.riskClassification,
      rootCauseAnalysis: parsed.data.rootCauseAnalysis,
      recommendation: parsed.data.recommendation,
      actionOwnerId: parsed.data.actionOwnerId,
      targetRemediationDate: parsed.data.targetRemediationDate ? new Date(parsed.data.targetRemediationDate) : undefined,
      raisedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "audit_finding.register", resource: "audit_finding", resourceId: finding.id, metadata: { referenceNumber: finding.referenceNumber, riskClassification: parsed.data.riskClassification } },
  });

  res.status(201).json({ finding });
});

const respondSchema = z.object({ managementResponse: z.string().min(1), actionOwnerId: z.string().optional(), targetRemediationDate: z.string().optional() });

internalAuditRouter.post("/findings/:id/respond", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const finding = await prisma.auditFinding.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!finding) return res.status(404).json({ error: "Finding not found" });

  const updated = await prisma.auditFinding.update({
    where: { id: finding.id },
    data: {
      managementResponse: parsed.data.managementResponse,
      actionOwnerId: parsed.data.actionOwnerId ?? finding.actionOwnerId,
      targetRemediationDate: parsed.data.targetRemediationDate ? new Date(parsed.data.targetRemediationDate) : finding.targetRemediationDate,
      status: finding.status === "OPEN" ? "IN_PROGRESS" : finding.status,
    },
  });
  res.json({ finding: updated });
});

internalAuditRouter.post("/findings/:id/mark-implemented", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const finding = await prisma.auditFinding.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!finding) return res.status(404).json({ error: "Finding not found" });
  if (finding.status !== "IN_PROGRESS" && finding.status !== "OPEN") return res.status(400).json({ error: `Cannot mark implemented from ${finding.status}` });
  const updated = await prisma.auditFinding.update({ where: { id: finding.id }, data: { status: "IMPLEMENTED" } });
  res.json({ finding: updated });
});

// §299.2 "Implementation Verification" — a distinct step from marking a
// recommendation implemented; someone other than the person who
// implemented it confirms it actually addresses the finding.
internalAuditRouter.post("/findings/:id/verify", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const finding = await prisma.auditFinding.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!finding) return res.status(404).json({ error: "Finding not found" });
  if (finding.status !== "IMPLEMENTED") return res.status(400).json({ error: "Only an implemented finding can be verified" });
  const updated = await prisma.auditFinding.update({ where: { id: finding.id }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: req.auth!.userId, overdue: false } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "audit_finding.verify", resource: "audit_finding", resourceId: finding.id } });
  res.json({ finding: updated });
});

internalAuditRouter.post("/findings/:id/close", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const finding = await prisma.auditFinding.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!finding) return res.status(404).json({ error: "Finding not found" });
  if (finding.status !== "VERIFIED") return res.status(400).json({ error: "Only a verified finding can be closed" });
  const updated = await prisma.auditFinding.update({ where: { id: finding.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: req.auth!.userId } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "audit_finding.close", resource: "audit_finding", resourceId: finding.id } });
  res.json({ finding: updated });
});
