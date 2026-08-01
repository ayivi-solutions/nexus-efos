import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const productsRouter = Router();
productsRouter.use(requireAuth);

// doc §47/§62 Product Management, Technical Spec §84 Entity Architecture.
// No dedicated "products.*" permission exists in the catalog yet — reusing
// institution.configure for write actions (product definitions are an
// institutional configuration concern) and reports.view for reads, matching
// the existing convention on Loans/Savings list endpoints.

productsRouter.get("/", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { type } = req.query as { type?: string };
  const products = await prisma.product.findMany({
    where: { institutionId: req.auth!.institutionId, ...(type ? { type: type as any } : {}) },
    include: { currentVersion: true, versions: { orderBy: { versionNumber: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ products });
});

productsRouter.get("/:id", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: { currentVersion: true, versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ product });
});

// doc §52.4 — Savings interestMethod values added alongside Loan's
// FLAT/REDUCING_BALANCE. interestRateType (§52.3) distinguishes how the
// rate itself is determined: FIXED, TIERED (via InterestRateTier rows),
// VARIABLE (current ProductVersion's rate — versioning already gives
// "changes over time" meaning), or PROMOTIONAL (base config for the
// account-level promo applied at opening).
const versionFieldsSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  currency: z.string().default("GHS"),
  minOpeningBalance: z.number().optional(),
  minOperatingBalance: z.number().optional(),
  maxBalance: z.number().optional(),
  minDeposit: z.number().optional(),
  maxDeposit: z.number().optional(),
  minLoanAmount: z.number().optional(),
  maxLoanAmount: z.number().optional(),
  minTenureMonths: z.number().int().optional(),
  maxTenureMonths: z.number().int().optional(),
  interestMethod: z.enum(["FLAT", "REDUCING_BALANCE", "DAILY_BALANCE", "AVERAGE_DAILY_BALANCE", "MINIMUM_MONTHLY_BALANCE"]).default("FLAT"),
  interestRate: z.number().min(0),
  interestRateType: z.enum(["FIXED", "TIERED", "VARIABLE", "PROMOTIONAL"]).default("FIXED"),
  promoInterestRate: z.number().min(0).optional(),
  promoDurationDays: z.number().int().positive().optional(),
});

const createProductSchema = z.object({
  code: z.string().min(1),
  type: z.enum(["SAVINGS", "LOAN"]),
}).merge(versionFieldsSchema);

// Creates a Product and its first ProductVersion together, in DRAFT status.
// Not usable for real business (loans/savings can't reference it) until
// activated — matches doc §47.4/§62: "Inactive products cannot be opened."
productsRouter.post("/", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { code, type, ...versionFields } = parsed.data;

  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: { institutionId: req.auth!.institutionId, code, type, status: "DRAFT" } });
    const v = await tx.productVersion.create({ data: { productId: p.id, versionNumber: 1, ...versionFields } });
    await tx.product.update({ where: { id: p.id }, data: { currentVersionId: v.id } });
    return tx.product.findUnique({ where: { id: p.id }, include: { currentVersion: true, versions: true } });
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "product.create", resource: "product", resourceId: product!.id },
  });

  res.status(201).json({ product });
});

// New version — used when revising terms. The new version becomes current;
// existing loans/savings accounts keep referencing whichever version they
// were opened under, so their locked-in terms never silently change.
productsRouter.post("/:id/versions", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = versionFieldsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const product = await prisma.product.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!product) return res.status(404).json({ error: "Product not found" });

  const latest = await prisma.productVersion.findFirst({ where: { productId: product.id }, orderBy: { versionNumber: "desc" } });
  const nextVersionNumber = (latest?.versionNumber || 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    const v = await tx.productVersion.create({ data: { productId: product.id, versionNumber: nextVersionNumber, ...parsed.data } });
    await tx.product.update({ where: { id: product.id }, data: { currentVersionId: v.id } });
    return v;
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "product.new_version", resource: "product", resourceId: product.id, metadata: { versionNumber: nextVersionNumber } },
  });

  res.status(201).json({ version });
});

// doc §52.4 Tiered Interest Rates — managed against the product's CURRENT
// version. Existing accounts already opened under an older version keep
// referencing that version's own tiers (or lack thereof), untouched.
const tierSchema = z.object({
  minBalance: z.number().min(0),
  maxBalance: z.number().min(0).optional(),
  interestRate: z.number().min(0),
});

productsRouter.get("/:id/tiers", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!product || !product.currentVersionId) return res.status(404).json({ error: "Product or current version not found" });

  const tiers = await prisma.interestRateTier.findMany({
    where: { productVersionId: product.currentVersionId, deletedAt: null },
    orderBy: { minBalance: "asc" },
  });
  res.json({ tiers });
});

productsRouter.post("/:id/tiers", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = tierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const product = await prisma.product.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!product || !product.currentVersionId) return res.status(404).json({ error: "Product or current version not found" });

  const tier = await prisma.interestRateTier.create({
    data: { productVersionId: product.currentVersionId, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "product.tier_add", resource: "product", resourceId: product.id, metadata: { tierId: tier.id } },
  });

  res.status(201).json({ tier });
});

productsRouter.delete("/:id/tiers/:tierId", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!product || !product.currentVersionId) return res.status(404).json({ error: "Product or current version not found" });

  // PDDS Phase 3 — soft-delete, not a real delete
  await prisma.interestRateTier.updateMany({ where: { id: req.params.tierId, productVersionId: product.currentVersionId }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "product.tier_remove", resource: "product", resourceId: product.id, metadata: { tierId: req.params.tierId } },
  });
  res.status(204).send();
});

// doc §47.4/§62.4 "Approval is required before activation where
// configured" — activation now opens an ApprovalRequest instead of
// applying immediately; a different authorised user must approve it.
productsRouter.post("/:id/activate", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!product) return res.status(404).json({ error: "Product not found" });

  const approval = await prisma.approvalRequest.create({
    data: {
      institutionId: req.auth!.institutionId,
      type: "PRODUCT_ACTIVATION",
      targetType: "Product",
      targetId: product.id,
      payload: {},
      reason: `Activate product ${product.code}`,
      requestedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "product.activation_requested", resource: "product", resourceId: req.params.id, metadata: { approvalRequestId: approval.id } },
  });

  res.status(202).json({ pendingApproval: true, approvalRequestId: approval.id });
});

productsRouter.post("/:id/withdraw", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const product = await prisma.product.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "WITHDRAWN" },
  });
  if (product.count === 0) return res.status(404).json({ error: "Product not found" });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "product.withdraw", resource: "product", resourceId: req.params.id },
  });
  res.json({ ok: true });
});

productsRouter.post("/:id/archive", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const product = await prisma.product.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "ARCHIVED" },
  });
  if (product.count === 0) return res.status(404).json({ error: "Product not found" });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "product.archive", resource: "product", resourceId: req.params.id },
  });
  res.json({ ok: true });
});
