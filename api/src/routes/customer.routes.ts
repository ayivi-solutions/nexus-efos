import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const customerRouter = Router();
customerRouter.use(requireAuth);

customerRouter.get("/", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const { segment, stage } = req.query as { segment?: string; stage?: string };
  const customers = await prisma.customer.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(segment ? { segment: segment as any } : {}),
      ...(stage ? { lifecycleStage: stage as any } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ customers });
});

customerRouter.get("/:id", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
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
  segment: z
    .enum(["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"])
    .default("INDIVIDUAL"),
});

customerRouter.post("/", requirePermission("customers.create"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.create({
    data: { institutionId: req.auth!.institutionId, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "customer.create",
      resource: "customer",
      resourceId: customer.id,
    },
  });

  res.status(201).json({ customer });
});

const stageSchema = z.object({
  lifecycleStage: z.enum([
    "AWARENESS", "ACQUISITION", "ONBOARDING", "ACTIVATION", "GROWTH", "RETENTION", "ADVOCACY", "RE_ENGAGEMENT",
  ]),
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
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "customer.stage_change",
      resource: "customer",
      resourceId: req.params.id,
      metadata: { lifecycleStage: parsed.data.lifecycleStage },
    },
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

  res.json({ ok: true });
});
