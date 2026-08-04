import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { calculatePAYE, calculateStatutoryContribution, round2 } from "../lib/payrollCalc";

// doc §206-208 Payroll Management: Overview, Configuration, Salary
// Structure. Tax tables and statutory rates get real infrastructure here
// but are deliberately shipped inactive and unpopulated — see
// schema.prisma's comment. Payroll Processing, Approval/Disbursement, and
// Statutory Compliance (§209-212) are a separate, later piece, blocked on
// the person confirming current GRA/SSNIT rates.
export const payrollRouter = Router();
payrollRouter.use(requireAuth);

// -------------------------------------------------------------------------
// §207 Payroll Configuration
// -------------------------------------------------------------------------

payrollRouter.get("/calendars", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const calendars = await prisma.payrollCalendar.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ calendars });
});

const calendarSchema = z.object({ name: z.string().min(1), frequency: z.enum(["MONTHLY", "BI_WEEKLY", "WEEKLY"]), payDayOfMonth: z.number().int().min(1).max(31).optional() });

payrollRouter.post("/calendars", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = calendarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const calendar = await prisma.payrollCalendar.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "payroll_calendar.create", resource: "payroll_calendar", resourceId: calendar.id } });
  res.status(201).json({ calendar });
});

payrollRouter.get("/periods", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const periods = await prisma.payrollPeriod.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { startDate: "desc" } });
  res.json({ periods });
});

const periodSchema = z.object({ calendarId: z.string(), name: z.string().min(1), startDate: z.string(), endDate: z.string(), payDate: z.string() });

// §207.3 "Payroll periods cannot overlap" — checked against every other
// period at this institution, not just within the same calendar, since
// two calendars still share one payroll timeline for reporting purposes.
payrollRouter.post("/periods", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = periodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const startDate = new Date(parsed.data.startDate);
  const endDate = new Date(parsed.data.endDate);

  const overlap = await prisma.payrollPeriod.findFirst({
    where: { institutionId: req.auth!.institutionId, calendarId: parsed.data.calendarId, OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }] },
  });
  if (overlap) return res.status(400).json({ error: `This date range overlaps an existing payroll period (${overlap.name})` });

  const period = await prisma.payrollPeriod.create({ data: { institutionId: req.auth!.institutionId, calendarId: parsed.data.calendarId, name: parsed.data.name, startDate, endDate, payDate: new Date(parsed.data.payDate) } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "payroll_period.create", resource: "payroll_period", resourceId: period.id } });
  res.status(201).json({ period });
});

payrollRouter.get("/salary-grades", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const grades = await prisma.salaryGrade.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { minSalary: "asc" } });
  res.json({ grades });
});

const gradeSchema = z.object({ name: z.string().min(1), minSalary: z.number().positive(), maxSalary: z.number().positive() });

payrollRouter.post("/salary-grades", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = gradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.maxSalary <= parsed.data.minSalary) return res.status(400).json({ error: "maxSalary must exceed minSalary" });
  const grade = await prisma.salaryGrade.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  res.status(201).json({ grade });
});

payrollRouter.get("/pay-groups", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const groups = await prisma.payGroup.findMany({ where: { institutionId: req.auth!.institutionId } });
  res.json({ groups });
});

payrollRouter.post("/pay-groups", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { name, calendarId } = req.body as { name?: string; calendarId?: string };
  if (!name || !calendarId) return res.status(400).json({ error: "name and calendarId are required" });
  const group = await prisma.payGroup.create({ data: { institutionId: req.auth!.institutionId, name, calendarId } });
  res.status(201).json({ group });
});

payrollRouter.get("/earning-codes", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const codes = await prisma.earningCode.findMany({ where: { institutionId: req.auth!.institutionId } });
  res.json({ codes });
});

const earningCodeSchema = z.object({ code: z.string().min(1), name: z.string().min(1), category: z.enum(["BASIC", "ALLOWANCE", "BONUS", "OVERTIME", "OTHER"]), taxable: z.boolean() });

payrollRouter.post("/earning-codes", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = earningCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.earningCode.findFirst({ where: { institutionId: req.auth!.institutionId, code: parsed.data.code } });
  if (existing) return res.status(400).json({ error: `Earning code ${parsed.data.code} is already in use` });
  const earningCode = await prisma.earningCode.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  res.status(201).json({ earningCode });
});

payrollRouter.get("/deduction-codes", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const codes = await prisma.deductionCode.findMany({ where: { institutionId: req.auth!.institutionId } });
  res.json({ codes });
});

const deductionCodeSchema = z.object({ code: z.string().min(1), name: z.string().min(1), category: z.enum(["STATUTORY", "LOAN", "INSURANCE", "UNION", "OTHER"]) });

payrollRouter.post("/deduction-codes", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = deductionCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.deductionCode.findFirst({ where: { institutionId: req.auth!.institutionId, code: parsed.data.code } });
  if (existing) return res.status(400).json({ error: `Deduction code ${parsed.data.code} is already in use` });
  const deductionCode = await prisma.deductionCode.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  res.status(201).json({ deductionCode });
});

payrollRouter.get("/overtime-rules", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const rules = await prisma.overtimeRule.findMany({ where: { institutionId: req.auth!.institutionId } });
  res.json({ rules });
});

payrollRouter.post("/overtime-rules", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { name, multiplier } = req.body as { name?: string; multiplier?: number };
  if (!name || !multiplier || multiplier <= 0) return res.status(400).json({ error: "name and a positive multiplier are required" });
  const rule = await prisma.overtimeRule.create({ data: { institutionId: req.auth!.institutionId, name, multiplier } });
  res.status(201).json({ rule });
});

// -------------------------------------------------------------------------
// §207.2 Tax Tables / Statutory Contribution Rates — real structure, kept
// inactive by default (see schema.prisma). Creating one here does NOT
// activate it; no calculation logic reads these yet at all.
// -------------------------------------------------------------------------

payrollRouter.get("/tax-tables", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const tables = await prisma.taxTable.findMany({ where: { institutionId: req.auth!.institutionId }, include: { bands: { orderBy: { sequence: "asc" } } } });
  res.json({ tables });
});

const taxTableSchema = z.object({
  name: z.string().min(1), effectiveDate: z.string(),
  bands: z.array(z.object({ sequence: z.number().int(), lowerBound: z.number().nonnegative(), upperBound: z.number().positive().optional(), rate: z.number().min(0).max(100) })).min(1),
});

payrollRouter.post("/tax-tables", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = taxTableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const table = await prisma.taxTable.create({
    data: {
      institutionId: req.auth!.institutionId, name: parsed.data.name, effectiveDate: new Date(parsed.data.effectiveDate), active: false,
      bands: { create: parsed.data.bands.map((b) => ({ sequence: b.sequence, lowerBound: b.lowerBound, upperBound: b.upperBound, rate: b.rate })) },
    },
    include: { bands: true },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "tax_table.create", resource: "tax_table", resourceId: table.id } });
  res.status(201).json({ table });
});

payrollRouter.get("/statutory-rates", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const rates = await prisma.statutoryContributionRate.findMany({ where: { institutionId: req.auth!.institutionId } });
  res.json({ rates });
});

const statutoryRateSchema = z.object({ name: z.string().min(1), rate: z.number().min(0).max(100), ceiling: z.number().positive().optional(), effectiveDate: z.string() });

payrollRouter.post("/statutory-rates", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = statutoryRateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const rate = await prisma.statutoryContributionRate.create({ data: { institutionId: req.auth!.institutionId, name: parsed.data.name, rate: parsed.data.rate, ceiling: parsed.data.ceiling, effectiveDate: new Date(parsed.data.effectiveDate), active: false } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "statutory_rate.create", resource: "statutory_contribution_rate", resourceId: rate.id } });
  res.status(201).json({ rate });
});

// -------------------------------------------------------------------------
// §208 Salary Structure Management. §208.3 "Salary changes follow
// approval workflows" — a new structure is created as DRAFT, requires
// approval to become ACTIVE, and the previously-ACTIVE structure is
// marked SUPERSEDED (never deleted) — history comes free from this, the
// same pattern as Loan Restructuring and Journal reversals.
// -------------------------------------------------------------------------

payrollRouter.get("/salary-structures/:employeeId", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const structures = await prisma.employeeSalaryStructure.findMany({
    where: { employeeId: req.params.employeeId, institutionId: req.auth!.institutionId },
    include: { allowances: true },
    orderBy: { effectiveDate: "desc" },
  });
  res.json({ structures });
});

const allowanceSchema = z.object({ earningCodeId: z.string(), amount: z.number().positive(), isPercentageOfBasic: z.boolean().optional() });
const salaryStructureSchema = z.object({
  employeeId: z.string(), payGroupId: z.string().optional(), salaryGradeId: z.string().optional(),
  basicSalary: z.number().positive(), effectiveDate: z.string(), allowances: z.array(allowanceSchema).optional(),
});

payrollRouter.post("/salary-structures", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = salaryStructureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.salaryGradeId) {
    const grade = await prisma.salaryGrade.findFirst({ where: { id: parsed.data.salaryGradeId, institutionId: req.auth!.institutionId } });
    if (grade && (parsed.data.basicSalary < Number(grade.minSalary) || parsed.data.basicSalary > Number(grade.maxSalary))) {
      return res.status(400).json({ error: `Basic salary must fall within grade ${grade.name}'s range (GHS ${grade.minSalary} - ${grade.maxSalary})` });
    }
  }

  const structure = await prisma.employeeSalaryStructure.create({
    data: {
      institutionId: req.auth!.institutionId, employeeId: parsed.data.employeeId, payGroupId: parsed.data.payGroupId, salaryGradeId: parsed.data.salaryGradeId,
      basicSalary: parsed.data.basicSalary, effectiveDate: new Date(parsed.data.effectiveDate), createdById: req.auth!.userId,
      allowances: parsed.data.allowances ? { create: parsed.data.allowances.map((a) => ({ earningCodeId: a.earningCodeId, amount: a.amount, isPercentageOfBasic: a.isPercentageOfBasic || false })) } : undefined,
    },
    include: { allowances: true },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "salary_structure.create", resource: "employee_salary_structure", resourceId: structure.id, metadata: { employeeId: parsed.data.employeeId } } });
  res.status(201).json({ structure });
});

payrollRouter.post("/salary-structures/:id/request-approval", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const structure = await prisma.employeeSalaryStructure.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!structure) return res.status(404).json({ error: "Salary structure not found" });
  if (structure.status !== "DRAFT") return res.status(400).json({ error: `Only a DRAFT structure can request approval (currently ${structure.status})` });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "SALARY_STRUCTURE_CHANGE", targetType: "EmployeeSalaryStructure", targetId: structure.id, payload: {}, reason: `Salary structure change for employee, effective ${structure.effectiveDate.toISOString().slice(0, 10)}`, requestedById: req.auth!.userId },
  });
  await prisma.employeeSalaryStructure.update({ where: { id: structure.id }, data: { status: "PENDING_APPROVAL" } });
  res.status(202).json({ pendingApproval: true });
});

// -------------------------------------------------------------------------
// Activation — flips a confirmed-rate table/rate from inactive to active.
// Deactivates any other active one of the same kind first, so exactly one
// tax table and one of each named statutory rate is ever active at a
// time (no ambiguity about which rate a calculation should use).
// -------------------------------------------------------------------------

payrollRouter.post("/tax-tables/:id/activate", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const table = await prisma.taxTable.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!table) return res.status(404).json({ error: "Tax table not found" });
  await prisma.taxTable.updateMany({ where: { institutionId: req.auth!.institutionId, active: true }, data: { active: false } });
  const updated = await prisma.taxTable.update({ where: { id: table.id }, data: { active: true } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "tax_table.activate", resource: "tax_table", resourceId: table.id } });
  res.json({ table: updated });
});

payrollRouter.post("/statutory-rates/:id/activate", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const rate = await prisma.statutoryContributionRate.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!rate) return res.status(404).json({ error: "Statutory rate not found" });
  await prisma.statutoryContributionRate.updateMany({ where: { institutionId: req.auth!.institutionId, name: rate.name, active: true }, data: { active: false } });
  const updated = await prisma.statutoryContributionRate.update({ where: { id: rate.id }, data: { active: true } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "statutory_rate.activate", resource: "statutory_contribution_rate", resourceId: rate.id } });
  res.json({ rate: updated });
});

// -------------------------------------------------------------------------
// §210 Payroll Processing. §210.3 "Duplicate payroll processing is
// prevented" via the unique payrollPeriodId constraint; the DB itself
// rejects a second run for the same period, not just this route.
// -------------------------------------------------------------------------

payrollRouter.get("/runs", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const runs = await prisma.payrollRun.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ runs });
});

payrollRouter.get("/runs/:id", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const run = await prisma.payrollRun.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, include: { entries: true } });
  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  res.json({ run });
});

// §210.2 "Payroll Calculation" — every active employee's basic salary
// structure (§208) is pulled fresh, taxable vs non-taxable allowances
// are split using each EarningCode's own taxable flag (§207), PAYE is
// computed from the currently ACTIVE tax table using the tested
// calculatePAYE function, and SSNIT/Tier 2 from the currently ACTIVE
// statutory rates using calculateStatutoryContribution. Nothing here
// invents a number — every figure traces back to real configuration.
payrollRouter.post("/periods/:periodId/process", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const period = await prisma.payrollPeriod.findFirst({ where: { id: req.params.periodId, institutionId: req.auth!.institutionId } });
  if (!period) return res.status(404).json({ error: "Payroll period not found" });

  const existingRun = await prisma.payrollRun.findUnique({ where: { payrollPeriodId: period.id } });
  if (existingRun) return res.status(400).json({ error: "This period has already been processed — duplicate processing is not allowed" });

  const taxTable = await prisma.taxTable.findFirst({ where: { institutionId: req.auth!.institutionId, active: true }, include: { bands: { orderBy: { sequence: "asc" } } } });
  if (!taxTable) return res.status(400).json({ error: "No active tax table — activate one before processing payroll" });

  const statutoryRates = await prisma.statutoryContributionRate.findMany({ where: { institutionId: req.auth!.institutionId, active: true } });
  const ssnitEmployeeRate = statutoryRates.find((r) => r.name === "SSNIT Employee");
  const ssnitEmployerRate = statutoryRates.find((r) => r.name === "SSNIT Employer Tier 1");
  const tier2Rate = statutoryRates.find((r) => r.name === "Tier 2 Employer");
  if (!ssnitEmployeeRate || !ssnitEmployerRate || !tier2Rate) {
    return res.status(400).json({ error: "Active 'SSNIT Employee', 'SSNIT Employer Tier 1', and 'Tier 2 Employer' rates are all required before processing payroll" });
  }

  const activeStructures = await prisma.employeeSalaryStructure.findMany({
    where: { institutionId: req.auth!.institutionId, status: "ACTIVE" },
    include: { allowances: true },
  });
  const earningCodes = await prisma.earningCode.findMany({ where: { institutionId: req.auth!.institutionId } });
  const earningCodeById = new Map(earningCodes.map((e) => [e.id, e]));

  const bands = taxTable.bands.map((b) => ({ lowerBound: Number(b.lowerBound), upperBound: b.upperBound === null ? null : Number(b.upperBound), rate: Number(b.rate) }));

  const entries = [];
  let totalGross = 0, totalDeductions = 0, totalNet = 0;

  for (const structure of activeStructures) {
    const basicSalary = Number(structure.basicSalary);
    let totalAllowances = 0, taxableAllowances = 0;
    for (const allowance of structure.allowances) {
      const code = earningCodeById.get(allowance.earningCodeId);
      const amount = allowance.isPercentageOfBasic ? round2(basicSalary * (Number(allowance.amount) / 100)) : Number(allowance.amount);
      totalAllowances += amount;
      if (code?.taxable) taxableAllowances += amount;
    }

    const grossPay = round2(basicSalary + totalAllowances);
    const taxableIncome = round2(basicSalary + taxableAllowances);
    const paye = calculatePAYE(taxableIncome, bands);
    const ssnitEmployee = calculateStatutoryContribution(basicSalary, Number(ssnitEmployeeRate.rate), ssnitEmployeeRate.ceiling ? Number(ssnitEmployeeRate.ceiling) : null, null);
    const ssnitEmployerTier1 = calculateStatutoryContribution(basicSalary, Number(ssnitEmployerRate.rate), ssnitEmployerRate.ceiling ? Number(ssnitEmployerRate.ceiling) : null, null);
    const tier2Employer = calculateStatutoryContribution(basicSalary, Number(tier2Rate.rate), tier2Rate.ceiling ? Number(tier2Rate.ceiling) : null, null);
    const netPay = round2(grossPay - paye - ssnitEmployee);

    entries.push({ employeeId: structure.employeeId, basicSalary, grossPay, taxableIncome, paye, ssnitEmployee, ssnitEmployerTier1, tier2Employer, otherDeductions: 0, netPay });
    totalGross += grossPay;
    totalDeductions += paye + ssnitEmployee;
    totalNet += netPay;
  }

  const run = await prisma.payrollRun.create({
    data: {
      institutionId: req.auth!.institutionId, payrollPeriodId: period.id, status: "PROCESSED",
      totalGross: round2(totalGross), totalDeductions: round2(totalDeductions), totalNet: round2(totalNet),
      processedById: req.auth!.userId, processedAt: new Date(),
      entries: { create: entries },
    },
    include: { entries: true },
  });

  await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "PROCESSING" } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "payroll_run.process", resource: "payroll_run", resourceId: run.id, metadata: { periodId: period.id, employeeCount: entries.length } } });

  res.status(201).json({ run });
});
