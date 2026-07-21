import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const customerRouter = Router();
customerRouter.use(requireAuth);

customerRouter.get("/", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const { segment, stage, includeArchived } = req.query as { segment?: string; stage?: string; includeArchived?: string };
  const customers = await prisma.customer.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(segment ? { segment: segment as any } : {}),
      ...(stage ? { lifecycleStage: stage as any } : {}),
      ...(includeArchived === "true" ? {} : { archived: false }),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ customers });
});

customerRouter.get("/:id", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: {
      loans: { include: { repayments: { orderBy: { paidAt: "desc" } } }, orderBy: { createdAt: "desc" } },
      savingsAccounts: { include: { transactions: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ customer });
});

const createSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  branchId: z.string().optional(),
  segment: z.enum(["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"]).default("INDIVIDUAL"),
});

customerRouter.post("/", requirePermission("customers.create"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.create({
    data: { institutionId: req.auth!.institutionId, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.create", resource: "customer", resourceId: customer.id },
  });

  res.status(201).json({ customer });
});

// CRUAA — general Update, distinct from the stage/KYC business-flow patches below.
const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(6).optional(),
  email: z.string().email().optional().nullable(),
  idType: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  segment: z.enum(["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"]).optional(),
});

customerRouter.patch("/:id", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });

  const customer = await prisma.customer.update({ where: { id: existing.id }, data: parsed.data });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.update", resource: "customer", resourceId: customer.id },
  });

  res.json({ customer });
});

const stageSchema = z.object({
  lifecycleStage: z.enum(["AWARENESS", "ACQUISITION", "ONBOARDING", "ACTIVATION", "GROWTH", "RETENTION", "ADVOCACY", "RE_ENGAGEMENT"]),
});

customerRouter.patch("/:id/stage", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = stageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { lifecycleStage: parsed.data.lifecycleStage },
  });
  if (customer.count === 0) return res.status(404).json({ error: "Customer not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.stage_change", resource: "customer", resourceId: req.params.id, metadata: { lifecycleStage: parsed.data.lifecycleStage } },
  });

  res.json({ ok: true });
});

// AccountStatus — separate axis from lifecycleStage. Gates transactability
// (Technical Spec §26.4 / §57.6 / §59.6): "Customers cannot transact before
// activation... Closed customers cannot initiate new transactions."
const statusSchema = z.object({
  status: z.enum(["REGISTERED", "PENDING_VERIFICATION", "VERIFIED", "ACTIVE", "DORMANT", "RESTRICTED", "SUSPENDED", "CLOSED", "ARCHIVED"]),
});

customerRouter.patch("/:id/status", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: parsed.data.status },
  });
  if (customer.count === 0) return res.status(404).json({ error: "Customer not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.status_change", resource: "customer", resourceId: req.params.id, metadata: { status: parsed.data.status } },
  });

  res.json({ ok: true });
});

customerRouter.patch("/:id/kyc", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const { kycStatus } = req.body as { kycStatus?: "PENDING" | "VERIFIED" | "REJECTED" };
  if (!kycStatus) return res.status(400).json({ error: "kycStatus required" });

  const customer = await prisma.customer.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { kycStatus },
  });
  if (customer.count === 0) return res.status(404).json({ error: "Customer not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.kyc_change", resource: "customer", resourceId: req.params.id, metadata: { kycStatus } },
  });

  res.json({ ok: true });
});

// CRUAA — Archive (soft-delete; preserves history, hides from default lists).
customerRouter.post("/:id/archive", requirePermission("customers.delete"), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { archived: true, archivedAt: new Date() },
  });
  if (customer.count === 0) return res.status(404).json({ error: "Customer not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.archive", resource: "customer", resourceId: req.params.id },
  });

  res.json({ ok: true });
});

customerRouter.post("/:id/unarchive", requirePermission("customers.delete"), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { archived: false, archivedAt: null },
  });
  if (customer.count === 0) return res.status(404).json({ error: "Customer not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.unarchive", resource: "customer", resourceId: req.params.id },
  });

  res.json({ ok: true });
});
