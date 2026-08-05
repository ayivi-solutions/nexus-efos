import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { calculateMonthlyDepreciation } from "../lib/assetDepreciation";
import { buildAssetDepreciationLines } from "../lib/assetAccounting";
import { round2 } from "../lib/payrollCalc";
import { findPostablePeriod, generateJournalNumber, balanceEffect } from "../lib/generalLedger";

// doc §186-195 Asset Management.
export const assetRouter = Router();
assetRouter.use(requireAuth);

// -------------------------------------------------------------------------
// §187 Asset Categories
// -------------------------------------------------------------------------

assetRouter.get("/categories", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const categories = await prisma.assetCategory.findMany({ where: { institutionId: req.auth!.institutionId } });
  res.json({ categories });
});

const categorySchema = z.object({
  name: z.string().min(1), defaultUsefulLifeMonths: z.number().int().positive(),
  defaultDepreciationMethod: z.enum(["STRAIGHT_LINE", "REDUCING_BALANCE"]), defaultDepreciationRate: z.number().min(0).max(100).optional(),
});

assetRouter.post("/categories", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.defaultDepreciationMethod === "REDUCING_BALANCE" && !parsed.data.defaultDepreciationRate) {
    return res.status(400).json({ error: "A default depreciation rate is required for the reducing-balance method" });
  }
  const category = await prisma.assetCategory.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  res.status(201).json({ category });
});

// -------------------------------------------------------------------------
// §187 Asset Master Management. §187.3 "Asset codes are unique" — a real
// DB unique constraint, not just a route-level check.
// -------------------------------------------------------------------------

assetRouter.get("/assets", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const status = (req.query as any).status as string | undefined;
  const assets = await prisma.asset.findMany({
    where: { institutionId: req.auth!.institutionId, status: status ? (status as any) : undefined },
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ assets });
});

assetRouter.get("/assets/:id", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const asset = await prisma.asset.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: { category: true, allocations: { orderBy: { allocatedAt: "desc" } }, maintenanceRecords: { orderBy: { createdAt: "desc" } }, maintenanceSchedule: true, depreciationEntries: { orderBy: { postedAt: "desc" } }, disposal: true, verificationRecords: { orderBy: { verifiedAt: "desc" } } },
  });
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  res.json({ asset });
});

const assetSchema = z.object({
  assetCode: z.string().min(1), name: z.string().min(1), categoryId: z.string(),
  serialNumber: z.string().optional(), manufacturer: z.string().optional(), model: z.string().optional(),
  acquisitionDate: z.string(), acquisitionCost: z.number().positive(),
  supplierName: z.string().optional(), warrantyExpiryDate: z.string().optional(), installationDate: z.string().optional(), commissionedDate: z.string().optional(),
  usefulLifeMonths: z.number().int().positive(), residualValue: z.number().min(0).default(0),
  depreciationMethod: z.enum(["STRAIGHT_LINE", "REDUCING_BALANCE"]).optional(), depreciationRate: z.number().min(0).max(100).optional(),
  barcodeValue: z.string().optional(), qrCodeValue: z.string().optional(),
  latitude: z.number().optional(), longitude: z.number().optional(),
});

// §188 Asset Acquisition Management, folded into registration itself
// rather than a separate model — supplier, warranty, and installation
// details are 1:1 with the asset, not a repeating history.
assetRouter.post("/assets", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.asset.findFirst({ where: { institutionId: req.auth!.institutionId, assetCode: parsed.data.assetCode } });
  if (existing) return res.status(400).json({ error: `Asset code ${parsed.data.assetCode} is already in use` });

  const category = await prisma.assetCategory.findFirst({ where: { id: parsed.data.categoryId, institutionId: req.auth!.institutionId } });
  if (!category) return res.status(404).json({ error: "Asset category not found" });

  const depreciationMethod = parsed.data.depreciationMethod || category.defaultDepreciationMethod;
  const depreciationRate = parsed.data.depreciationRate ?? (category.defaultDepreciationRate ? Number(category.defaultDepreciationRate) : undefined);
  if (depreciationMethod === "REDUCING_BALANCE" && !depreciationRate) {
    return res.status(400).json({ error: "A depreciation rate is required for the reducing-balance method (set on the asset or its category)" });
  }

  const asset = await prisma.asset.create({
    data: {
      institutionId: req.auth!.institutionId, assetCode: parsed.data.assetCode, name: parsed.data.name, categoryId: parsed.data.categoryId,
      serialNumber: parsed.data.serialNumber, manufacturer: parsed.data.manufacturer, model: parsed.data.model,
      acquisitionDate: new Date(parsed.data.acquisitionDate), acquisitionCost: parsed.data.acquisitionCost,
      supplierName: parsed.data.supplierName,
      warrantyExpiryDate: parsed.data.warrantyExpiryDate ? new Date(parsed.data.warrantyExpiryDate) : undefined,
      installationDate: parsed.data.installationDate ? new Date(parsed.data.installationDate) : undefined,
      commissionedDate: parsed.data.commissionedDate ? new Date(parsed.data.commissionedDate) : undefined,
      usefulLifeMonths: parsed.data.usefulLifeMonths, residualValue: parsed.data.residualValue,
      depreciationMethod, depreciationRate,
      barcodeValue: parsed.data.barcodeValue, qrCodeValue: parsed.data.qrCodeValue,
      latitude: parsed.data.latitude, longitude: parsed.data.longitude,
      createdById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "asset.register", resource: "asset", resourceId: asset.id, metadata: { assetCode: asset.assetCode } } });
  res.status(201).json({ asset });
});

// -------------------------------------------------------------------------
// §189 Asset Allocation Management. §189.3 "Allocation history is
// permanently retained" — a new row per allocation/return, never
// overwritten.
// -------------------------------------------------------------------------

const allocationSchema = z.object({ assetId: z.string(), employeeId: z.string().optional(), departmentId: z.string().optional(), branchId: z.string().optional(), notes: z.string().optional() });

assetRouter.post("/allocations", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = allocationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!parsed.data.employeeId && !parsed.data.departmentId && !parsed.data.branchId) return res.status(400).json({ error: "At least one of employeeId, departmentId, or branchId is required" });

  const asset = await prisma.asset.findFirst({ where: { id: parsed.data.assetId, institutionId: req.auth!.institutionId } });
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (asset.status === "DISPOSED") return res.status(400).json({ error: "A disposed asset cannot be reassigned" });

  const existingAllocation = await prisma.assetAllocation.findFirst({ where: { assetId: asset.id, returnedAt: null } });
  if (existingAllocation) return res.status(400).json({ error: "This asset is already allocated — return it first before reallocating" });

  const allocation = await prisma.assetAllocation.create({
    data: { institutionId: req.auth!.institutionId, assetId: asset.id, employeeId: parsed.data.employeeId, departmentId: parsed.data.departmentId, branchId: parsed.data.branchId, allocatedById: req.auth!.userId, notes: parsed.data.notes },
  });
  await prisma.asset.update({ where: { id: asset.id }, data: { currentEmployeeId: parsed.data.employeeId, currentDepartmentId: parsed.data.departmentId, currentBranchId: parsed.data.branchId } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "asset.allocate", resource: "asset", resourceId: asset.id, metadata: { allocationId: allocation.id } } });
  res.status(201).json({ allocation });
});

// §189.3 "Returned assets are inspected" — a condition note is required
// at return time, not optional.
assetRouter.post("/allocations/:id/return", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { returnCondition } = req.body as { returnCondition?: string };
  if (!returnCondition) return res.status(400).json({ error: "A return condition note is required" });

  const allocation = await prisma.assetAllocation.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId, returnedAt: null } });
  if (!allocation) return res.status(404).json({ error: "Active allocation not found" });

  const updated = await prisma.assetAllocation.update({ where: { id: allocation.id }, data: { returnedAt: new Date(), returnCondition } });
  await prisma.asset.update({ where: { id: allocation.assetId }, data: { currentEmployeeId: null, currentDepartmentId: null, currentBranchId: null } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "asset.return", resource: "asset", resourceId: allocation.assetId, metadata: { allocationId: allocation.id } } });
  res.json({ allocation: updated });
});

// -------------------------------------------------------------------------
// §190 Asset Transfer Management. §190.3 "Transfers require
// authorisation" — via the real Approval Workflow.
// -------------------------------------------------------------------------

const transferSchema = z.object({
  assetId: z.string(), toEmployeeId: z.string().optional(), toDepartmentId: z.string().optional(), toBranchId: z.string().optional(), reason: z.string().min(2),
});

assetRouter.post("/transfers", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!parsed.data.toEmployeeId && !parsed.data.toDepartmentId && !parsed.data.toBranchId) return res.status(400).json({ error: "A destination (employee, department, or branch) is required" });

  const asset = await prisma.asset.findFirst({ where: { id: parsed.data.assetId, institutionId: req.auth!.institutionId } });
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (asset.status === "DISPOSED") return res.status(400).json({ error: "A disposed asset cannot be transferred" });

  const transfer = await prisma.assetTransfer.create({
    data: {
      institutionId: req.auth!.institutionId, assetId: asset.id,
      fromEmployeeId: asset.currentEmployeeId, fromDepartmentId: asset.currentDepartmentId, fromBranchId: asset.currentBranchId,
      toEmployeeId: parsed.data.toEmployeeId, toDepartmentId: parsed.data.toDepartmentId, toBranchId: parsed.data.toBranchId,
      reason: parsed.data.reason, requestedById: req.auth!.userId,
    },
  });
  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "ASSET_TRANSFER", targetType: "AssetTransfer", targetId: transfer.id, payload: {}, reason: parsed.data.reason, requestedById: req.auth!.userId },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "asset_transfer.requested", resource: "asset_transfer", resourceId: transfer.id } });
  res.status(202).json({ pendingApproval: true, transfer });
});

assetRouter.get("/transfers", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const transfers = await prisma.assetTransfer.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ transfers });
});

// -------------------------------------------------------------------------
// §191 Asset Maintenance Management. §191.3 "Overdue maintenance
// generates alerts" — a real, queryable overdue-items report (see
// /reports/overdue-maintenance below); no notification provider exists
// in this platform to push an actual alert.
// -------------------------------------------------------------------------

const scheduleSchema = z.object({ assetId: z.string(), frequencyMonths: z.number().int().positive(), lastMaintenanceDate: z.string().optional() });

assetRouter.post("/maintenance-schedules", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const lastDate = parsed.data.lastMaintenanceDate ? new Date(parsed.data.lastMaintenanceDate) : new Date();
  const nextDue = new Date(lastDate); nextDue.setMonth(nextDue.getMonth() + parsed.data.frequencyMonths);

  const schedule = await prisma.assetMaintenanceSchedule.upsert({
    where: { assetId: parsed.data.assetId },
    create: { institutionId: req.auth!.institutionId, assetId: parsed.data.assetId, frequencyMonths: parsed.data.frequencyMonths, lastMaintenanceDate: parsed.data.lastMaintenanceDate ? lastDate : undefined, nextDueDate: nextDue },
    update: { frequencyMonths: parsed.data.frequencyMonths, nextDueDate: nextDue },
  });
  res.status(201).json({ schedule });
});

const maintenanceRecordSchema = z.object({ assetId: z.string(), type: z.enum(["PREVENTIVE", "CORRECTIVE"]), scheduledDate: z.string().optional(), completedDate: z.string().optional(), serviceProvider: z.string().optional(), cost: z.number().min(0).optional(), notes: z.string().optional() });

assetRouter.post("/maintenance-records", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = maintenanceRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const record = await prisma.assetMaintenanceRecord.create({
    data: {
      institutionId: req.auth!.institutionId, assetId: parsed.data.assetId, type: parsed.data.type,
      scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : undefined,
      completedDate: parsed.data.completedDate ? new Date(parsed.data.completedDate) : undefined,
      serviceProvider: parsed.data.serviceProvider, cost: parsed.data.cost || 0, notes: parsed.data.notes, createdById: req.auth!.userId,
    },
  });

  if (parsed.data.completedDate) {
    const schedule = await prisma.assetMaintenanceSchedule.findUnique({ where: { assetId: parsed.data.assetId } });
    if (schedule) {
      const nextDue = new Date(parsed.data.completedDate); nextDue.setMonth(nextDue.getMonth() + schedule.frequencyMonths);
      await prisma.assetMaintenanceSchedule.update({ where: { assetId: parsed.data.assetId }, data: { lastMaintenanceDate: new Date(parsed.data.completedDate), nextDueDate: nextDue } });
    }
  }

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "asset.maintenance_record", resource: "asset", resourceId: parsed.data.assetId, metadata: { recordId: record.id } } });
  res.status(201).json({ record });
});

// -------------------------------------------------------------------------
// §192 Asset Depreciation Management. §192.3 "Depreciation postings
// generate balanced journal entries" — real GL posting via the same
// configurable mapping pattern as Payroll. If mapping is incomplete or
// the period isn't open, the depreciation entry still records (the
// figures themselves are real and correct) but journalId stays null —
// a visible, checkable gap, not a silent failure.
// -------------------------------------------------------------------------

assetRouter.post("/assets/:id/process-depreciation", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { periodLabel } = req.body as { periodLabel?: string };
  if (!periodLabel) return res.status(400).json({ error: "periodLabel is required (e.g. 'January 2026')" });

  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (asset.status === "DISPOSED") return res.status(400).json({ error: "A disposed asset cannot be depreciated further" });

  const existing = await prisma.assetDepreciationEntry.findUnique({ where: { assetId_periodLabel: { assetId: asset.id, periodLabel } } });
  if (existing) return res.status(400).json({ error: `Depreciation for ${periodLabel} has already been posted for this asset` });

  const monthsElapsed = await prisma.assetDepreciationEntry.count({ where: { assetId: asset.id } });

  const amount = calculateMonthlyDepreciation({
    acquisitionCost: Number(asset.acquisitionCost), residualValue: Number(asset.residualValue), usefulLifeMonths: asset.usefulLifeMonths,
    method: asset.depreciationMethod as any, annualRate: asset.depreciationRate ? Number(asset.depreciationRate) : undefined,
    accumulatedDepreciationSoFar: Number(asset.accumulatedDepreciation), monthsElapsed,
  });

  if (amount <= 0) return res.status(400).json({ error: "This asset is already fully depreciated" });

  const newAccumulated = round2(Number(asset.accumulatedDepreciation) + amount);
  const newNetBookValue = round2(Number(asset.acquisitionCost) - newAccumulated);

  let journalId: string | null = null;
  const mappings = await prisma.assetGLAccountMapping.findMany({ where: { institutionId: req.auth!.institutionId, purpose: { in: ["Depreciation Expense", "Accumulated Depreciation"] } } });
  const expenseId = mappings.find((m) => m.purpose === "Depreciation Expense")?.glAccountId;
  const accumId = mappings.find((m) => m.purpose === "Accumulated Depreciation")?.glAccountId;

  if (expenseId && accumId) {
    const glPeriod = await findPostablePeriod(prisma, req.auth!.institutionId, new Date());
    if (glPeriod && glPeriod.status === "OPEN") {
      const lines = buildAssetDepreciationLines(amount, expenseId, accumId);
      const accountRecords = await prisma.gLAccount.findMany({ where: { id: { in: [expenseId, accumId] } } });
      const accountById = new Map(accountRecords.map((a: any) => [a.id, a]));

      const journal = await prisma.journal.create({
        data: {
          institutionId: req.auth!.institutionId, journalNumber: generateJournalNumber(), type: "AUTOMATIC",
          description: `Depreciation — ${asset.assetCode} — ${periodLabel}`, status: "POSTED", postingDate: new Date(), postedAt: new Date(), postedById: req.auth!.userId, createdById: req.auth!.userId,
          lines: { create: lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })) },
        },
      });
      for (const line of lines) {
        const account = accountById.get(line.accountId);
        const effect = balanceEffect(account!.category as any, line.debit, line.credit);
        await prisma.gLAccount.update({ where: { id: line.accountId }, data: { balance: { increment: effect } } });
      }
      journalId = journal.id;
    }
  }

  const entry = await prisma.assetDepreciationEntry.create({
    data: { institutionId: req.auth!.institutionId, assetId: asset.id, periodLabel, depreciationAmount: amount, accumulatedDepreciation: newAccumulated, netBookValue: newNetBookValue, journalId, postedById: req.auth!.userId },
  });
  await prisma.asset.update({ where: { id: asset.id }, data: { accumulatedDepreciation: newAccumulated } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "asset.depreciation_posted", resource: "asset", resourceId: asset.id, metadata: { periodLabel, amount, journalId } } });

  res.status(201).json({ entry });
});

// -------------------------------------------------------------------------
// §193 Asset Disposal Management. §193.3 "Disposals require
// authorisation" via the real Approval Workflow. §193.3 "Financial
// gains or losses are calculated automatically" — genuinely computed at
// request time, then posted for real once approved.
// -------------------------------------------------------------------------

const disposalSchema = z.object({ assetId: z.string(), disposalType: z.enum(["SALE", "DONATION", "WRITE_OFF", "SCRAP"]), disposalDate: z.string(), saleProceeds: z.number().min(0).optional(), reason: z.string().min(2) });

assetRouter.post("/disposals", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = disposalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.disposalType === "SALE" && !parsed.data.saleProceeds) return res.status(400).json({ error: "saleProceeds is required for a SALE disposal" });

  const asset = await prisma.asset.findFirst({ where: { id: parsed.data.assetId, institutionId: req.auth!.institutionId } });
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (asset.status === "DISPOSED") return res.status(400).json({ error: "This asset has already been disposed" });

  const netBookValueAtDisposal = round2(Number(asset.acquisitionCost) - Number(asset.accumulatedDepreciation));
  const saleProceeds = parsed.data.saleProceeds || 0;
  const gainLoss = round2(saleProceeds - netBookValueAtDisposal);

  const disposal = await prisma.assetDisposal.create({
    data: {
      institutionId: req.auth!.institutionId, assetId: asset.id, disposalType: parsed.data.disposalType, disposalDate: new Date(parsed.data.disposalDate),
      saleProceeds: parsed.data.saleProceeds, netBookValueAtDisposal, gainLoss, reason: parsed.data.reason, requestedById: req.auth!.userId,
    },
  });
  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "ASSET_DISPOSAL", targetType: "AssetDisposal", targetId: disposal.id, payload: {}, reason: parsed.data.reason, requestedById: req.auth!.userId },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "asset_disposal.requested", resource: "asset_disposal", resourceId: disposal.id, metadata: { gainLoss } } });
  res.status(202).json({ pendingApproval: true, disposal });
});

assetRouter.get("/disposals", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const disposals = await prisma.assetDisposal.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ disposals });
});

// -------------------------------------------------------------------------
// §194 Asset Verification and Audit. §194.3 "Missing assets are flagged
// automatically" — variance is a real computed boolean.
// -------------------------------------------------------------------------

const verificationSchema = z.object({
  assetId: z.string(), locationConfirmed: z.boolean(), custodianConfirmed: z.boolean(), condition: z.enum(["GOOD", "FAIR", "POOR", "DAMAGED", "MISSING"]),
  latitude: z.number().optional(), longitude: z.number().optional(), notes: z.string().optional(),
});

assetRouter.post("/verifications", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = verificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const asset = await prisma.asset.findFirst({ where: { id: parsed.data.assetId, institutionId: req.auth!.institutionId } });
  if (!asset) return res.status(404).json({ error: "Asset not found" });

  const variance = !parsed.data.locationConfirmed || !parsed.data.custodianConfirmed || parsed.data.condition === "MISSING" || parsed.data.condition === "DAMAGED";

  const record = await prisma.assetVerificationRecord.create({
    data: {
      institutionId: req.auth!.institutionId, assetId: asset.id, verifiedById: req.auth!.userId,
      locationConfirmed: parsed.data.locationConfirmed, custodianConfirmed: parsed.data.custodianConfirmed, condition: parsed.data.condition,
      latitude: parsed.data.latitude, longitude: parsed.data.longitude, notes: parsed.data.notes, variance,
    },
  });

  if (parsed.data.condition === "MISSING") await prisma.asset.update({ where: { id: asset.id }, data: { status: "LOST" } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "asset.verified", resource: "asset", resourceId: asset.id, metadata: { variance, condition: parsed.data.condition } } });

  res.status(201).json({ record });
});

assetRouter.get("/assets/lookup", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const code = (req.query as any).code as string | undefined;
  if (!code) return res.status(400).json({ error: "code query parameter is required" });
  const asset = await prisma.asset.findFirst({ where: { institutionId: req.auth!.institutionId, OR: [{ barcodeValue: code }, { qrCodeValue: code }, { assetCode: code }] } });
  if (!asset) return res.status(404).json({ error: "No asset found matching that code" });
  res.json({ asset });
});

// -------------------------------------------------------------------------
// Asset GL Account Mapping configuration
// -------------------------------------------------------------------------

const ASSET_GL_PURPOSES = ["Fixed Asset", "Depreciation Expense", "Accumulated Depreciation", "Cash/Bank (Acquisition)", "Cash/Bank (Disposal Proceeds)", "Gain on Disposal", "Loss on Disposal"];

assetRouter.get("/gl-mappings", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const mappings = await prisma.assetGLAccountMapping.findMany({ where: { institutionId: req.auth!.institutionId } });
  const glAccounts = await prisma.gLAccount.findMany({ where: { institutionId: req.auth!.institutionId, status: "ACTIVE" }, select: { id: true, code: true, name: true } });
  const accountById = new Map(glAccounts.map((a) => [a.id, a]));
  res.json({ mappings: mappings.map((m: any) => ({ ...m, account: accountById.get(m.glAccountId) || null })), purposes: ASSET_GL_PURPOSES, accounts: glAccounts });
});

assetRouter.post("/gl-mappings", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { purpose, glAccountId } = req.body as { purpose?: string; glAccountId?: string };
  if (!purpose || !glAccountId) return res.status(400).json({ error: "purpose and glAccountId are required" });
  const account = await prisma.gLAccount.findFirst({ where: { id: glAccountId, institutionId: req.auth!.institutionId } });
  if (!account) return res.status(404).json({ error: "GL account not found" });

  const mapping = await prisma.assetGLAccountMapping.upsert({
    where: { institutionId_purpose: { institutionId: req.auth!.institutionId, purpose } },
    create: { institutionId: req.auth!.institutionId, purpose, glAccountId },
    update: { glAccountId },
  });
  res.status(201).json({ mapping });
});

// -------------------------------------------------------------------------
// §195 Asset Reporting and Analytics
// -------------------------------------------------------------------------

assetRouter.get("/reports/register", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const assets = await prisma.asset.findMany({ where: { institutionId: req.auth!.institutionId }, include: { category: { select: { name: true } } } });
  res.json({
    assets: assets.map((a) => ({ id: a.id, assetCode: a.assetCode, name: a.name, category: a.category.name, status: a.status, acquisitionCost: Number(a.acquisitionCost), accumulatedDepreciation: Number(a.accumulatedDepreciation), netBookValue: round2(Number(a.acquisitionCost) - Number(a.accumulatedDepreciation)) })),
  });
});

assetRouter.get("/reports/valuation", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const assets = await prisma.asset.findMany({ where: { institutionId: req.auth!.institutionId, status: { not: "DISPOSED" } } });
  const totalCost = round2(assets.reduce((s, a) => s + Number(a.acquisitionCost), 0));
  const totalAccumulatedDepreciation = round2(assets.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0));
  res.json({ assetCount: assets.length, totalCost, totalAccumulatedDepreciation, totalNetBookValue: round2(totalCost - totalAccumulatedDepreciation) });
});

// §195.3 "Replacement Forecasting" — a real, deterministic remaining
// useful life figure per asset, not a speculative prediction.
assetRouter.get("/reports/lifecycle", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const assets = await prisma.asset.findMany({ where: { institutionId: req.auth!.institutionId, status: { not: "DISPOSED" } }, include: { category: { select: { name: true } }, depreciationEntries: true } });
  res.json({
    assets: assets.map((a) => {
      const monthsElapsed = a.depreciationEntries.length;
      const remainingMonths = Math.max(0, a.usefulLifeMonths - monthsElapsed);
      const ageMonths = Math.floor((Date.now() - a.acquisitionDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      return { id: a.id, assetCode: a.assetCode, name: a.name, category: a.category.name, ageMonths, usefulLifeMonths: a.usefulLifeMonths, remainingUsefulLifeMonths: remainingMonths, netBookValue: round2(Number(a.acquisitionCost) - Number(a.accumulatedDepreciation)) };
    }),
  });
});

assetRouter.get("/reports/overdue-maintenance", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const schedules = await prisma.assetMaintenanceSchedule.findMany({ where: { institutionId: req.auth!.institutionId, nextDueDate: { lt: new Date() } }, include: { asset: { select: { assetCode: true, name: true } } } });
  res.json({ overdue: schedules.map((s: any) => ({ assetCode: s.asset.assetCode, assetName: s.asset.name, nextDueDate: s.nextDueDate, daysOverdue: Math.floor((Date.now() - s.nextDueDate.getTime()) / (1000 * 60 * 60 * 24)) })) });
});

assetRouter.get("/reports/by-branch", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const assets = await prisma.asset.findMany({ where: { institutionId: req.auth!.institutionId, status: { not: "DISPOSED" } } });
  const branchIds = [...new Set(assets.map((a) => a.currentBranchId).filter(Boolean))] as string[];
  const branches = await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const byBranch = new Map<string, { name: string; count: number; totalCost: number }>();
  for (const a of assets) {
    const key = a.currentBranchId || "unassigned";
    const name = a.currentBranchId ? branchName.get(a.currentBranchId) || "Unknown" : "Unassigned";
    if (!byBranch.has(key)) byBranch.set(key, { name, count: 0, totalCost: 0 });
    const b = byBranch.get(key)!;
    b.count += 1;
    b.totalCost += Number(a.acquisitionCost);
  }
  res.json({ branches: Array.from(byBranch.values()).map((b) => ({ ...b, totalCost: round2(b.totalCost) })) });
});
