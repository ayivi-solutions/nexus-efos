import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { matchRules, executeMatchedRules } from "../lib/businessRules";
import { checkVersion, VersionConflictError } from "../lib/optimisticLock";
import { generateCustomerNumber } from "../lib/customerNumber";
import { calculateCustomerRiskScore, calculateCustomerSimilarity } from "../lib/customerRiskScoring";
import { rollbackCustomerMerge } from "../lib/customerMerge";

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
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ customers });
});

customerRouter.get("/:id", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: {
      branch: { select: { id: true, name: true } },
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
  // doc §23.4 "Assign branch ownership" is a "shall" requirement — made
  // genuinely mandatory server-side too, not just a frontend nicety a
  // direct API call could bypass.
  branchId: z.string().min(1, "Branch is required"),
  address: z.string().optional(),
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

  // doc §41 — checked BEFORE the customer is created: a "check first"
  // trigger point (see lib/businessRules.ts), so REJECT blocks creation
  // entirely rather than creating a customer record and rejecting it after.
  const ruleContext = { ...parsed.data };
  const matched = await matchRules(prisma, req.auth!.institutionId, "CUSTOMER_CREATION", ruleContext);
  const blockingRule = matched.find((m) => m.hasReject);
  if (blockingRule) {
    return res.status(400).json({ error: `Customer creation blocked by business rule ${blockingRule.rule.ruleCode}: ${blockingRule.rule.name}` });
  }

  const customer = await prisma.customer.create({
    data: {
      institutionId: req.auth!.institutionId,
      customerNumber: generateCustomerNumber(),
      ...parsed.data,
      status: watchlistMatch ? "BLACKLISTED" : "REGISTERED",
      watchlistFlag: !!watchlistMatch,
      possibleDuplicate: !!duplicateMatch,
    },
  });

  const ruleWarnings = await executeMatchedRules(prisma, req.auth!.institutionId, req.auth!.userId, "Customer", customer.id, matched);

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
    ruleWarnings,
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
  address: z.string().optional().nullable(),
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
  // expectedVersion is request metadata, not a Customer field — kept out
  // of updateSchema deliberately, since that schema's fields are spread
  // directly into the Prisma update payload.
  const { expectedVersion, ...body } = req.body as { expectedVersion?: number; [key: string]: any };
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });
  const lockError = assertNotLocked(existing.status);
  if (lockError) return res.status(409).json({ error: lockError });

  try {
    await checkVersion(prisma, "customer", existing.id, expectedVersion);
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return res.status(409).json({ error: err.message, currentVersion: err.currentVersion });
    }
    throw err;
  }

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

// doc §58 Compliance — PEP classification + CDD. cddLevel is auto-derived
// (ENHANCED whenever pepStatus isn't NOT_PEP, or riskRating is HIGH) rather
// than independently settable, so it can never silently drift out of sync
// with the very risk factors that are supposed to drive it.
const cddSchema = z.object({
  pepStatus: z.enum(["NOT_PEP", "DOMESTIC_PEP", "FOREIGN_PEP", "PEP_ASSOCIATE"]).optional(),
  cddNotes: z.string().optional(),
});

customerRouter.patch("/:id/cdd", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = cddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });
  const lockError = assertNotLocked(existing.status);
  if (lockError) return res.status(409).json({ error: lockError });

  const effectivePepStatus = parsed.data.pepStatus ?? existing.pepStatus;
  const cddLevel = (effectivePepStatus !== "NOT_PEP" || existing.riskRating === "HIGH") ? "ENHANCED" : "STANDARD";

  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      cddLevel,
      cddCompletedAt: new Date(),
      cddCompletedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.cdd_update", resource: "customer", resourceId: existing.id, metadata: { pepStatus: effectivePepStatus, cddLevel } },
  });

  res.json({ customer });
});

// doc §30 Customer Document Management + §58 KYC — a real completion
// checklist computed live against the customer's actual uploaded
// documents, rather than a bare status flag. Deliberately does NOT include
// expiry monitoring or periodic re-screening — both need a job scheduler
// that doesn't exist in this app yet.
const KYC_REQUIREMENTS: Record<string, { label: string; anyOf: string[] }[]> = {
  INDIVIDUAL: [
    { label: "Identity document", anyOf: ["NATIONAL_ID", "PASSPORT", "DRIVERS_LICENCE", "VOTER_ID"] },
    { label: "Proof of address", anyOf: ["PROOF_OF_ADDRESS", "UTILITY_BILL"] },
    { label: "Photograph", anyOf: ["PHOTOGRAPH"] },
  ],
  FARMER_GROUP: [
    { label: "Identity document", anyOf: ["NATIONAL_ID", "PASSPORT", "DRIVERS_LICENCE", "VOTER_ID"] },
    { label: "Proof of address", anyOf: ["PROOF_OF_ADDRESS", "UTILITY_BILL"] },
    { label: "Photograph", anyOf: ["PHOTOGRAPH"] },
  ],
  WOMENS_GROUP: [
    { label: "Identity document", anyOf: ["NATIONAL_ID", "PASSPORT", "DRIVERS_LICENCE", "VOTER_ID"] },
    { label: "Proof of address", anyOf: ["PROOF_OF_ADDRESS", "UTILITY_BILL"] },
    { label: "Photograph", anyOf: ["PHOTOGRAPH"] },
  ],
  YOUTH: [
    { label: "Identity document", anyOf: ["NATIONAL_ID", "PASSPORT", "DRIVERS_LICENCE", "VOTER_ID"] },
    { label: "Proof of address", anyOf: ["PROOF_OF_ADDRESS", "UTILITY_BILL"] },
    { label: "Photograph", anyOf: ["PHOTOGRAPH"] },
  ],
  BUSINESS: [
    { label: "Business registration", anyOf: ["BUSINESS_REGISTRATION"] },
    { label: "Tax certificate", anyOf: ["TAX_CERTIFICATE"] },
    { label: "Proof of address", anyOf: ["PROOF_OF_ADDRESS", "UTILITY_BILL"] },
  ],
  CORPORATE: [
    { label: "Business registration", anyOf: ["BUSINESS_REGISTRATION"] },
    { label: "Tax certificate", anyOf: ["TAX_CERTIFICATE"] },
    { label: "Proof of address", anyOf: ["PROOF_OF_ADDRESS", "UTILITY_BILL"] },
  ],
};

customerRouter.get("/:id/kyc-checklist", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const customer = await findOwnedCustomer(req.params.id, req.auth!.institutionId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const documents = await prisma.document.findMany({
    where: { customerId: customer.id, status: { not: "DISPOSED" } },
  });
  const presentTypes = new Set(documents.map((d) => d.documentType));

  const requirements = KYC_REQUIREMENTS[customer.segment] ?? KYC_REQUIREMENTS.INDIVIDUAL;
  const checklist = requirements.map((r) => ({
    label: r.label,
    satisfied: r.anyOf.some((t) => presentTypes.has(t as any)),
    acceptedTypes: r.anyOf,
  }));
  const satisfiedCount = checklist.filter((c) => c.satisfied).length;

  res.json({
    checklist,
    percentComplete: Math.round((satisfiedCount / checklist.length) * 100),
    complete: satisfiedCount === checklist.length,
    missing: checklist.filter((c) => !c.satisfied).map((c) => c.label),
  });
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

// -------------------------------------------------------------------------
// §25 Customer Search and Retrieval. §25.5 "Restrict search results based
// on user permissions" — the existing customers.view permission gate
// already does this; nothing here bypasses it. "Fuzzy Search" here is
// honest, disclosed partial/case-insensitive matching (ILIKE) — real
// trigram similarity (pg_trgm) isn't confirmed enabled on this database,
// and claiming it without checking would overstate what this actually
// does.
// -------------------------------------------------------------------------

customerRouter.get("/search", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const q = (req.query as any).q as string | undefined;
  const branchId = (req.query as any).branchId as string | undefined;
  const status = (req.query as any).status as string | undefined;
  const kycStatus = (req.query as any).kycStatus as string | undefined;

  if (!q && !branchId && !status && !kycStatus) return res.status(400).json({ error: "At least one search parameter is required" });

  const where: any = { institutionId: req.auth!.institutionId, mergeStatus: "ACTIVE" };
  if (branchId) where.branchId = branchId;
  if (status) where.status = status;
  if (kycStatus) where.kycStatus = kycStatus;
  if (q) {
    where.OR = [
      { customerNumber: { equals: q } },
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { idNumber: { equals: q } },
    ];
  }

  const customers = await prisma.customer.findMany({
    where, take: 50,
    select: { id: true, customerNumber: true, fullName: true, phone: true, email: true, branchId: true, status: true, riskRating: true, segment: true, createdAt: true },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.searched", resource: "customer_search", resourceId: "search", metadata: { q, resultCount: customers.length } } });
  res.json({ customers });
});

// §25 "QR Code" / "Barcode" search — reuses the same lookup pattern
// already built for Assets, extended to customers.
customerRouter.get("/search/by-code", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const code = (req.query as any).code as string | undefined;
  if (!code) return res.status(400).json({ error: "code query parameter is required" });
  const customer = await prisma.customer.findFirst({ where: { institutionId: req.auth!.institutionId, OR: [{ customerNumber: code }, { idNumber: code }] } });
  if (!customer) return res.status(404).json({ error: "No customer found matching that code" });
  res.json({ customer });
});

const savedSearchSchema = z.object({ name: z.string().min(1), criteria: z.record(z.any()) });

customerRouter.post("/saved-searches", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const parsed = savedSearchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const saved = await prisma.savedSearch.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, name: parsed.data.name, criteria: parsed.data.criteria } });
  res.status(201).json({ saved });
});

customerRouter.get("/saved-searches", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const searches = await prisma.savedSearch.findMany({ where: { institutionId: req.auth!.institutionId, userId: req.auth!.userId }, orderBy: { createdAt: "desc" } });
  res.json({ searches });
});

// -------------------------------------------------------------------------
// §29 KYC — Risk Scoring. §29.5 "Every KYC action is audited". Recomputes
// on demand from the customer's real current state, rather than expecting
// a scheduler to keep it fresh — periodic re-screening would need a job
// scheduler this app doesn't have, the same disclosed boundary already
// documented for KYC expiry monitoring.
// -------------------------------------------------------------------------

customerRouter.post("/:id/recompute-risk-score", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const result = calculateCustomerRiskScore({
    watchlistFlag: customer.watchlistFlag, pepStatus: customer.pepStatus as any, kycStatus: customer.kycStatus as any,
    possibleDuplicate: customer.possibleDuplicate, cddLevel: customer.cddLevel as any,
  });

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { kycRiskScore: result.score, kycRiskScoreBreakdown: result.breakdown as any, riskRating: result.rating },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer.risk_score_recomputed", resource: "customer", resourceId: customer.id, metadata: { score: result.score, rating: result.rating } } });
  res.json({ customer: updated, breakdown: result.breakdown });
});

// -------------------------------------------------------------------------
// §43 Customer Consent Management. §43.5 "Consent records cannot be
// deleted" — no delete route exists here, deliberately. Withdrawal is a
// real update to the SAME row (withdrawnAt), and "immediate effect" means
// any consuming code (e.g. a future SMS/Email send) should check
// granted && !withdrawnAt && (!expiresAt || expiresAt > now) — the
// consent record itself is the single source of truth, not a derived
// cache that could drift.
// -------------------------------------------------------------------------

const consentSchema = z.object({
  customerId: z.string(), consentType: z.enum(["DATA_PROCESSING", "MARKETING", "SMS", "EMAIL", "PUSH_NOTIFICATION", "BIOMETRIC", "CREDIT_BUREAU", "INFORMATION_SHARING", "DIGITAL_SIGNATURE", "OTHER"]),
  otherTypeLabel: z.string().optional(), granted: z.boolean(), expiresAt: z.string().optional(), documentId: z.string().optional(), notes: z.string().optional(),
});

customerRouter.post("/consents", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.consentType === "OTHER" && !parsed.data.otherTypeLabel) return res.status(400).json({ error: "otherTypeLabel is required when consentType is OTHER" });

  const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, institutionId: req.auth!.institutionId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const consent = await prisma.customerConsent.create({
    data: {
      institutionId: req.auth!.institutionId, customerId: parsed.data.customerId, consentType: parsed.data.consentType, otherTypeLabel: parsed.data.otherTypeLabel,
      granted: parsed.data.granted, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined, documentId: parsed.data.documentId,
      capturedById: req.auth!.userId, notes: parsed.data.notes,
    },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer_consent.captured", resource: "customer_consent", resourceId: consent.id, metadata: { consentType: parsed.data.consentType, granted: parsed.data.granted } } });
  res.status(201).json({ consent });
});

customerRouter.get("/:id/consents", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const consents = await prisma.customerConsent.findMany({ where: { customerId: req.params.id, institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ consents });
});

customerRouter.post("/consents/:id/withdraw", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const consent = await prisma.customerConsent.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!consent) return res.status(404).json({ error: "Consent record not found" });
  if (consent.withdrawnAt) return res.status(400).json({ error: "This consent has already been withdrawn" });

  const updated = await prisma.customerConsent.update({ where: { id: consent.id }, data: { withdrawnAt: new Date(), withdrawnById: req.auth!.userId } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer_consent.withdrawn", resource: "customer_consent", resourceId: consent.id } });
  res.json({ consent: updated });
});

// -------------------------------------------------------------------------
// §35 Customer Merge and Duplicate Management. §35.4 "Merge operations
// require authorised approval" — via the real Approval Workflow, the
// actual reassignment only happens once approved, not at request time.
// -------------------------------------------------------------------------

customerRouter.get("/duplicates/detect", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const customers = await prisma.customer.findMany({
    where: { institutionId: req.auth!.institutionId, mergeStatus: "ACTIVE" },
    select: { id: true, fullName: true, phone: true, email: true, idNumber: true, customerNumber: true },
  });

  // Genuinely O(n²) — fine for the scale a single MFI institution's
  // customer base runs at in this context, not built for a
  // multi-million-record search.
  const candidates: { customerA: any; customerB: any; score: number; matchedFields: string[] }[] = [];
  for (let i = 0; i < customers.length; i++) {
    for (let j = i + 1; j < customers.length; j++) {
      const result = calculateCustomerSimilarity(customers[i], customers[j]);
      if (result.score >= 30) candidates.push({ customerA: customers[i], customerB: customers[j], score: result.score, matchedFields: result.matchedFields });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  res.json({ candidates: candidates.slice(0, 100) });
});

const mergeRequestSchema = z.object({ primaryCustomerId: z.string(), mergedCustomerId: z.string() });

customerRouter.post("/merge-requests", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const parsed = mergeRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.primaryCustomerId === parsed.data.mergedCustomerId) return res.status(400).json({ error: "primaryCustomerId and mergedCustomerId must differ" });

  const [primary, merged] = await Promise.all([
    prisma.customer.findFirst({ where: { id: parsed.data.primaryCustomerId, institutionId: req.auth!.institutionId, mergeStatus: "ACTIVE" } }),
    prisma.customer.findFirst({ where: { id: parsed.data.mergedCustomerId, institutionId: req.auth!.institutionId, mergeStatus: "ACTIVE" } }),
  ]);
  if (!primary || !merged) return res.status(404).json({ error: "Both customers must exist and not already be merged" });

  const similarity = calculateCustomerSimilarity(primary, merged);

  const mergeRecord = await prisma.customerMergeRecord.create({
    data: { institutionId: req.auth!.institutionId, primaryCustomerId: primary.id, mergedCustomerId: merged.id, similarityScore: similarity.score, matchedFields: similarity.matchedFields, requestedById: req.auth!.userId },
  });
  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "CUSTOMER_MERGE", targetType: "CustomerMergeRecord", targetId: mergeRecord.id, payload: {}, reason: `Merge ${merged.fullName} into ${primary.fullName} — similarity ${similarity.score}`, requestedById: req.auth!.userId },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer_merge.requested", resource: "customer_merge_record", resourceId: mergeRecord.id } });
  res.status(202).json({ pendingApproval: true, mergeRecord });
});

customerRouter.get("/merge-requests", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const records = await prisma.customerMergeRecord.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ records });
});

// §35.4 "Merge Rollback where authorised" — reverses the exact captured
// list of reassigned records, atomically.
customerRouter.post("/merge-requests/:id/rollback", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  if (!reason) return res.status(400).json({ error: "A reason is required to roll back a merge" });

  const record = await prisma.customerMergeRecord.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId, status: "APPROVED" } });
  if (!record) return res.status(404).json({ error: "Approved merge record not found" });
  if (!record.reassignedRecords) return res.status(400).json({ error: "No reassignment record found to roll back" });

  try {
    await prisma.$transaction(async (tx: any) => {
      await rollbackCustomerMerge(tx, record.mergedCustomerId, record.reassignedRecords as any);
      await tx.customerMergeRecord.update({ where: { id: record.id }, data: { status: "ROLLED_BACK", rolledBackById: req.auth!.userId, rolledBackAt: new Date(), rollbackReason: reason } });
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Rollback failed, nothing was changed: ${err.message}` });
  }

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "customer_merge.rolled_back", resource: "customer_merge_record", resourceId: record.id, metadata: { reason } } });
  res.json({ success: true });
});
