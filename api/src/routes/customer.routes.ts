import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const customerRouter = Router();
customerRouter.use(requireAuth);

// PENDING_APPROVAL and BLACKLISTED both lock the record — the former until
// the pending request resolves, the latter until compliance clears it via
// the AML_ADJUDICATION approval.
const LOCKED_STATUSES = ["CLOSED", "ARCHIVED", "BLACKLISTED", "PENDING_APPROVAL"];

function assertNotLocked(status: string) {
  if (LOCKED_STATUSES.includes(status)) {
    return `This customer is ${status} and locked. No fields can be changed until the record is reopened.`;
  }
  return null;
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const STATUS_VALUES = ["REGISTERED", "PENDING_VERIFICATION", "PENDING_APPROVAL", "VERIFIED", "ACTIVE", "DORMANT", "RESTRICTED", "SUSPENDED", "BLACKLISTED", "CLOSED", "ARCHIVED"] as const;
// Fields the doc treats as identity-critical (§24.3: "critical updates
// require approval where configured") — changing these on an already
// ACTIVE/VERIFIED customer goes through the approval workflow instead of
// applying immediately.
const CRITICAL_FIELDS = ["fullName", "idType", "idNumber", "segment"] as const;

customerRouter.get("/", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const { segment, stage, includeArchived, search, watchlistFlag, possibleDuplicate } = req.query as {
    segment?: string; stage?: string; includeArchived?: string; search?: string; watchlistFlag?: string; possibleDuplicate?: string;
  };
  const customers = await prisma.customer.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(segment ? { segment: segment as any } : {}),
      ...(stage ? { lifecycleStage: stage as any } : {}),
      ...(includeArchived === "true" ? {} : { archived: false }),
      ...(watchlistFlag === "true" ? { watchlistFlag: true } : {}),
      ...(possibleDuplicate === "true" ? { possibleDuplicate: true } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { idNumber: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
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
      nextOfKin: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      beneficiaries: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      beneficialOwners: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
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

// doc §34 AML and Sanctions Screening — now a HARD BLOCK, not a soft flag
// (23 Jul stock-take finding). A watchlist match sets the customer straight
// to BLACKLISTED and opens an AML_ADJUDICATION approval request; the
// customer cannot transact or be edited until a compliance officer (who
// did not create the record) resolves it. Duplicate detection remains a
// soft flag — §35 doesn't call for a hard block there.
customerRouter.post("/", requirePermission("customers.create"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const normalized = normalizeName(parsed.data.fullName);

  const [watchlistMatch, existingCustomers] = await Promise.all([
    prisma.watchlistEntry.findFirst({
      where: { institutionId: req.auth!.institutionId, fullName: { equals: parsed.data.fullName, mode: "insensitive" }, deletedAt: null },
    }),
    prisma.customer.findMany({
      where: { institutionId: req.auth!.institutionId, archived: false },
      select: { id: true, fullName: true },
    }),
  ]);
  const duplicateMatch = existingCustomers.find((c) => normalizeName(c.fullName) === normalized) || null;

  const customer = await prisma.customer.create({
    data: {
      institutionId: req.auth!.institutionId,
      ...parsed.data,
      status: watchlistMatch ? "BLACKLISTED" : "REGISTERED",
      watchlistFlag: !!watchlistMatch,
      possibleDuplicate: !!duplicateMatch,
    },
  });

  let approvalRequestId: string | null = null;
  if (watchlistMatch) {
    const approval = await prisma.approvalRequest.create({
      data: {
        institutionId: req.auth!.institutionId,
        type: "AML_ADJUDICATION",
        targetType: "Customer",
        targetId: customer.id,
        payload: { previousStatus: "REGISTERED" },
        reason: `Name matches watchlist entry: ${watchlistMatch.reason || "no reason recorded"}`,
        requestedById: req.auth!.userId,
      },
    });
    approvalRequestId = approval.id;
  }

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "customer.create",
      resource: "customer",
      resourceId: customer.id,
      metadata: { watchlistMatch: !!watchlistMatch, possibleDuplicateOf: duplicateMatch?.id || null, approvalRequestId },
    },
  });

  res.status(201).json({
    customer,
    warnings: {
      watchlist: watchlistMatch
        ? `Name matches a watchlist entry — customer BLACKLISTED pending compliance adjudication: ${watchlistMatch.reason || "no reason recorded"}`
        : null,
      duplicate: duplicateMatch ? `Possible duplicate of existing customer: ${duplicateMatch.fullName}` : null,
    },
  });
});

const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(6).optional(),
  email: z.string().email().optional().nullable(),
  idType: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  segment: z.enum(["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"]).optional(),
  riskRating: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().nullable(),
  preferredChannel: z.string().optional().nullable(),
  preferredLanguage: z.string().optional().nullable(),
  smsEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
  transactionAlertsEnabled: z.boolean().optional(),
  statementDeliveryEnabled: z.boolean().optional(),
});

// doc §24.3 "Critical updates require approval where configured" — changing
// an identity-critical field on an ACTIVE/VERIFIED customer now creates an
// approval request instead of applying immediately. Everything else
// (contact info, preferences, risk rating) still applies directly.
customerRouter.patch("/:id", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });
  const lockError = assertNotLocked(existing.status);
  if (lockError) return res.status(409).json({ error: lockError });

  const touchesCriticalField = CRITICAL_FIELDS.some((f) => parsed.data[f] !== undefined);
  const needsApproval = touchesCriticalField && ["ACTIVE", "VERIFIED"].includes(existing.status);

  if (needsApproval) {
    const approval = await prisma.approvalRequest.create({
      data: {
        institutionId: req.auth!.institutionId,
        type: "CUSTOMER_PROFILE_UPDATE",
        targetType: "Customer",
        targetId: existing.id,
        payload: parsed.data,
        reason: "Critical field change on an active/verified customer",
        requestedById: req.auth!.userId,
      },
    });
    await prisma.customer.update({ where: { id: existing.id }, data: { status: "PENDING_APPROVAL" } });
    await prisma.auditLog.create({
      data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.update_requested", resource: "customer", resourceId: existing.id, metadata: { approvalRequestId: approval.id, previousStatus: existing.status } },
    });
    return res.status(202).json({ pendingApproval: true, approvalRequestId: approval.id });
  }

  const customer = await prisma.customer.update({ where: { id: existing.id }, data: parsed.data });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.update", resource: "customer", resourceId: customer.id },
  });

  res.json({ customer });
});

customerRouter.post("/:id/clear-duplicate-flag", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { possibleDuplicate: false },
  });
  if (customer.count === 0) return res.status(404).json({ error: "Customer not found" });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.duplicate_cleared", resource: "customer", resourceId: req.params.id },
  });
  res.json({ ok: true });
});

const stageSchema = z.object({
  lifecycleStage: z.enum(["AWARENESS", "ACQUISITION", "ONBOARDING", "ACTIVATION", "GROWTH", "RETENTION", "ADVOCACY", "RE_ENGAGEMENT"]),
});

customerRouter.patch("/:id/stage", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = stageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });
  const lockError = assertNotLocked(existing.status);
  if (lockError) return res.status(409).json({ error: lockError });

  await prisma.customer.update({ where: { id: existing.id }, data: { lifecycleStage: parsed.data.lifecycleStage } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.stage_change", resource: "customer", resourceId: req.params.id, metadata: { lifecycleStage: parsed.data.lifecycleStage } },
  });

  res.json({ ok: true });
});

const statusSchema = z.object({ status: z.enum(STATUS_VALUES) });

// doc §24.3 pattern applied to status changes too: changing an ACTIVE
// customer's status is inherently sensitive, so it now routes through
// approval rather than applying immediately. Status changes on any other
// current status (REGISTERED, VERIFIED, DORMANT, etc.) still apply
// directly — those customers aren't yet fully onboarded/active.
customerRouter.patch("/:id/status", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });
  const lockError = assertNotLocked(existing.status);
  if (lockError) return res.status(409).json({ error: lockError });

  if (["VERIFIED", "ACTIVE"].includes(parsed.data.status) && existing.kycStatus !== "VERIFIED") {
    return res.status(409).json({ error: `Cannot set status to ${parsed.data.status} — KYC must be VERIFIED first (currently ${existing.kycStatus})` });
  }

  if (existing.status === "ACTIVE" && parsed.data.status !== "ACTIVE") {
    const approval = await prisma.approvalRequest.create({
      data: {
        institutionId: req.auth!.institutionId,
        type: "CUSTOMER_STATUS_CHANGE",
        targetType: "Customer",
        targetId: existing.id,
        payload: { status: parsed.data.status, previousStatus: existing.status },
        reason: "Status change requested on an ACTIVE customer",
        requestedById: req.auth!.userId,
      },
    });
    await prisma.customer.update({ where: { id: existing.id }, data: { status: "PENDING_APPROVAL" } });
    await prisma.auditLog.create({
      data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.status_change_requested", resource: "customer", resourceId: existing.id, metadata: { approvalRequestId: approval.id, requestedStatus: parsed.data.status } },
    });
    return res.status(202).json({ pendingApproval: true, approvalRequestId: approval.id });
  }

  await prisma.customer.update({ where: { id: existing.id }, data: { status: parsed.data.status } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.status_change", resource: "customer", resourceId: req.params.id, metadata: { status: parsed.data.status } },
  });

  res.json({ ok: true });
});

customerRouter.patch("/:id/kyc", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const { kycStatus } = req.body as { kycStatus?: "PENDING" | "VERIFIED" | "REJECTED" };
  if (!kycStatus) return res.status(400).json({ error: "kycStatus required" });

  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });
  const lockError = assertNotLocked(existing.status);
  if (lockError) return res.status(409).json({ error: lockError });

  await prisma.customer.update({ where: { id: existing.id }, data: { kycStatus } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.kyc_change", resource: "customer", resourceId: req.params.id, metadata: { kycStatus } },
  });

  res.json({ ok: true });
});

const archiveSchema = z.object({
  closureReason: z.enum(["CUSTOMER_REQUEST", "DEATH", "BUSINESS_CLOSURE", "FRAUD", "REGULATORY_DIRECTIVE", "DUPLICATE_MERGE", "MIGRATION", "INACTIVITY", "INSTITUTIONAL_DECISION", "COURT_ORDER", "OTHER"]),
  closureNote: z.string().optional(),
});

// doc §45.3/§45.4 — closure reason now captured (was previously not asked
// at all); active-obligations check unchanged.
customerRouter.post("/:id/archive", requirePermission("customers.delete"), async (req: AuthedRequest, res) => {
  const parsed = archiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: { loans: true, savingsAccounts: true },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const openLoans = customer.loans.filter((l) => ["PENDING", "APPROVED", "DISBURSED", "ACTIVE"].includes(l.status));
  const fundedSavings = customer.savingsAccounts.filter((a) => a.status === "ACTIVE" && Number(a.balance) !== 0);
  if (openLoans.length > 0 || fundedSavings.length > 0) {
    return res.status(409).json({
      error: `This customer has active financial obligations (${openLoans.length} open loan(s), ${fundedSavings.length} funded savings account(s)) and cannot be archived until they're resolved.`,
    });
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      archived: true,
      archivedAt: new Date(),
      closureReason: parsed.data.closureReason,
      closureNote: parsed.data.closureNote,
      closedById: req.auth!.userId,
      closedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.archive", resource: "customer", resourceId: req.params.id, metadata: { closureReason: parsed.data.closureReason } },
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

async function findOwnedCustomer(customerId: string, institutionId: string) {
  return prisma.customer.findFirst({ where: { id: customerId, institutionId } });
}

const nextOfKinSchema = z.object({ fullName: z.string().min(2), relationship: z.string().min(1), phone: z.string().min(6), email: z.string().email().optional(), address: z.string().optional() });

customerRouter.post("/:id/next-of-kin", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = nextOfKinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await findOwnedCustomer(req.params.id, req.auth!.institutionId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const kin = await prisma.nextOfKin.create({ data: { customerId: customer.id, ...parsed.data } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.next_of_kin_add", resource: "customer", resourceId: customer.id },
  });
  res.status(201).json({ nextOfKin: kin });
});

customerRouter.delete("/:id/next-of-kin/:kinId", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const customer = await findOwnedCustomer(req.params.id, req.auth!.institutionId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  // PDDS Phase 3 — soft-delete, not a real delete
  await prisma.nextOfKin.updateMany({ where: { id: req.params.kinId, customerId: customer.id }, data: { deletedAt: new Date() } });
  res.status(204).send();
});

const noteSchema = z.object({ note: z.string().min(1) });

customerRouter.post("/:id/notes", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await findOwnedCustomer(req.params.id, req.auth!.institutionId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const note = await prisma.customerNote.create({ data: { customerId: customer.id, authorId: req.auth!.userId, note: parsed.data.note } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.note_add", resource: "customer", resourceId: customer.id },
  });
  res.status(201).json({ note });
});

const beneficiarySchema = z.object({ fullName: z.string().min(2), relationship: z.string().min(1), allocationPct: z.number().min(0).max(100), phone: z.string().optional() });

// doc §37.4 "Total allocation equals 100% where applicable" — enforced as
// "the running total across all of a customer's beneficiaries can never
// exceed 100%" (was previously not validated at all).
customerRouter.post("/:id/beneficiaries", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = beneficiarySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await findOwnedCustomer(req.params.id, req.auth!.institutionId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const existingBeneficiaries = await prisma.beneficiary.findMany({ where: { customerId: customer.id, deletedAt: null } });
  const currentTotal = existingBeneficiaries.reduce((sum, b) => sum + Number(b.allocationPct), 0);
  const newTotal = currentTotal + parsed.data.allocationPct;
  if (newTotal > 100) {
    return res.status(400).json({ error: `Total beneficiary allocation cannot exceed 100% (currently ${currentTotal}%, this would bring it to ${newTotal}%)` });
  }

  const beneficiary = await prisma.beneficiary.create({ data: { customerId: customer.id, ...parsed.data } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.beneficiary_add", resource: "customer", resourceId: customer.id },
  });
  res.status(201).json({ beneficiary, totalAllocation: newTotal });
});

customerRouter.delete("/:id/beneficiaries/:beneficiaryId", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const customer = await findOwnedCustomer(req.params.id, req.auth!.institutionId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  // PDDS Phase 3 — soft-delete, not a real delete. Also frees up allocation
  // headroom for the 100%-cap check, since deleted rows are excluded there.
  await prisma.beneficiary.updateMany({ where: { id: req.params.beneficiaryId, customerId: customer.id }, data: { deletedAt: new Date() } });
  res.status(204).send();
});

const beneficialOwnerSchema = z.object({ fullName: z.string().min(2), ownershipPct: z.number().min(0).max(100), idType: z.string().optional(), idNumber: z.string().optional() });

customerRouter.post("/:id/beneficial-owners", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = beneficialOwnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await findOwnedCustomer(req.params.id, req.auth!.institutionId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const owner = await prisma.beneficialOwner.create({ data: { customerId: customer.id, ...parsed.data } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.beneficial_owner_add", resource: "customer", resourceId: customer.id },
  });
  res.status(201).json({ owner });
});

customerRouter.delete("/:id/beneficial-owners/:ownerId", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const customer = await findOwnedCustomer(req.params.id, req.auth!.institutionId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  // PDDS Phase 3 — soft-delete, not a real delete
  await prisma.beneficialOwner.updateMany({ where: { id: req.params.ownerId, customerId: customer.id }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
