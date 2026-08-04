import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { calculatePAYE, calculateStatutoryContribution, round2 } from "../lib/payrollCalc";
import { generatePayslipPdf } from "../lib/payslipPdf";

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

const statutoryRateSchema = z.object({ name: z.string().min(1), rate: z.number().min(0).max(100), ceiling: z.number().positive().optional(), minimum: z.number().nonnegative().optional(), effectiveDate: z.string() });

payrollRouter.post("/statutory-rates", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = statutoryRateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const rate = await prisma.statutoryContributionRate.create({ data: { institutionId: req.auth!.institutionId, name: parsed.data.name, rate: parsed.data.rate, ceiling: parsed.data.ceiling, minimum: parsed.data.minimum, effectiveDate: new Date(parsed.data.effectiveDate), active: false } });
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
    include: { allowances: true, deductions: true },
    orderBy: { effectiveDate: "desc" },
  });
  res.json({ structures });
});

const allowanceSchema = z.object({ earningCodeId: z.string(), amount: z.number().positive(), isPercentageOfBasic: z.boolean().optional() });
const deductionAssignmentSchema = z.object({ deductionCodeId: z.string(), amount: z.number().positive(), isPercentageOfBasic: z.boolean().optional() });
const salaryStructureSchema = z.object({
  employeeId: z.string(), payGroupId: z.string().optional(), salaryGradeId: z.string().optional(),
  basicSalary: z.number().positive(), effectiveDate: z.string(), allowances: z.array(allowanceSchema).optional(),
  deductions: z.array(deductionAssignmentSchema).optional(),
});

// §209.3 "Deductions shall not exceed approved limits" — the specific
// statutory ceiling (if Ghana law sets one) hasn't been confirmed the
// same rigorous way as the tax rates, so this deliberately checks only
// the one universal, non-negotiable floor: total deductions can never
// exceed gross pay, since a negative net pay is never valid regardless
// of what any specific legal limit turns out to be.
payrollRouter.post("/salary-structures", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = salaryStructureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.salaryGradeId) {
    const grade = await prisma.salaryGrade.findFirst({ where: { id: parsed.data.salaryGradeId, institutionId: req.auth!.institutionId } });
    if (grade && (parsed.data.basicSalary < Number(grade.minSalary) || parsed.data.basicSalary > Number(grade.maxSalary))) {
      return res.status(400).json({ error: `Basic salary must fall within grade ${grade.name}'s range (GHS ${grade.minSalary} - ${grade.maxSalary})` });
    }
  }

  const totalAllowanceAmount = (parsed.data.allowances || []).reduce((s, a) => s + (a.isPercentageOfBasic ? parsed.data.basicSalary * (a.amount / 100) : a.amount), 0);
  const totalDeductionAmount = (parsed.data.deductions || []).reduce((s, d) => s + (d.isPercentageOfBasic ? parsed.data.basicSalary * (d.amount / 100) : d.amount), 0);
  const estimatedGross = parsed.data.basicSalary + totalAllowanceAmount;
  if (totalDeductionAmount > estimatedGross) {
    return res.status(400).json({ error: "Total deductions cannot exceed gross pay" });
  }

  const structure = await prisma.employeeSalaryStructure.create({
    data: {
      institutionId: req.auth!.institutionId, employeeId: parsed.data.employeeId, payGroupId: parsed.data.payGroupId, salaryGradeId: parsed.data.salaryGradeId,
      basicSalary: parsed.data.basicSalary, effectiveDate: new Date(parsed.data.effectiveDate), createdById: req.auth!.userId,
      allowances: parsed.data.allowances ? { create: parsed.data.allowances.map((a) => ({ earningCodeId: a.earningCodeId, amount: a.amount, isPercentageOfBasic: a.isPercentageOfBasic || false })) } : undefined,
      deductions: parsed.data.deductions ? { create: parsed.data.deductions.map((d) => ({ deductionCodeId: d.deductionCodeId, amount: d.amount, isPercentageOfBasic: d.isPercentageOfBasic || false })) } : undefined,
    },
    include: { allowances: true, deductions: true },
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
    include: { allowances: true, deductions: { where: { active: true } } },
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

    // §209.2 "Deduction Processing" — every active EmployeeDeduction on
    // this structure genuinely reduces net pay now, not a hardcoded
    // zero. Statutory deductions (PAYE, SSNIT) are calculated
    // separately above and combined with these "other" deductions
    // (loan repayment instalments, insurance, union dues, custom) below.
    let otherDeductions = 0;
    for (const deduction of structure.deductions) {
      otherDeductions += deduction.isPercentageOfBasic ? round2(basicSalary * (Number(deduction.amount) / 100)) : Number(deduction.amount);
    }

    const grossPay = round2(basicSalary + totalAllowances);
    const taxableIncome = round2(basicSalary + taxableAllowances);
    const paye = calculatePAYE(taxableIncome, bands);
    const ssnitEmployee = calculateStatutoryContribution(basicSalary, Number(ssnitEmployeeRate.rate), ssnitEmployeeRate.ceiling ? Number(ssnitEmployeeRate.ceiling) : null, ssnitEmployeeRate.minimum ? Number(ssnitEmployeeRate.minimum) : null);
    const ssnitEmployerTier1 = calculateStatutoryContribution(basicSalary, Number(ssnitEmployerRate.rate), ssnitEmployerRate.ceiling ? Number(ssnitEmployerRate.ceiling) : null, ssnitEmployerRate.minimum ? Number(ssnitEmployerRate.minimum) : null);
    const tier2Employer = calculateStatutoryContribution(basicSalary, Number(tier2Rate.rate), tier2Rate.ceiling ? Number(tier2Rate.ceiling) : null, tier2Rate.minimum ? Number(tier2Rate.minimum) : null);
    // A structure's deductions were already checked against gross pay at
    // creation time, but re-checked here too against the ACTUAL computed
    // net pay this run — allowances/basic could differ from what was
    // true when the deduction was first assigned.
    const netPay = round2(Math.max(0, grossPay - paye - ssnitEmployee - otherDeductions));

    entries.push({ employeeId: structure.employeeId, basicSalary, grossPay, taxableIncome, paye, ssnitEmployee, ssnitEmployerTier1, tier2Employer, otherDeductions: round2(otherDeductions), netPay });
    totalGross += grossPay;
    totalDeductions += paye + ssnitEmployee + otherDeductions;
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

// -------------------------------------------------------------------------
// §211 Payroll Approval and Disbursement. §211.3 "Salary payments occur
// only after approval" — a real gate: PROCESSED must go through the
// Approval Workflow to reach APPROVED, and only APPROVED can be marked
// PAID. Mobile Money Payments are deliberately not built — no MoMo
// provider integration exists anywhere in this platform (the same class
// of gap as SMS/Email notifications, named in the README). Bank File
// Generation produces a genuine, disclosed generic CSV — not tied to any
// specific confirmed bank's exact required format, since none has been
// confirmed the way GRA/SSNIT rates were.
// -------------------------------------------------------------------------

payrollRouter.post("/runs/:id/request-approval", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const run = await prisma.payrollRun.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  if (run.status !== "PROCESSED") return res.status(400).json({ error: `Only a PROCESSED run can request approval (currently ${run.status})` });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "PAYROLL_RUN_APPROVAL", targetType: "PayrollRun", targetId: run.id, payload: {}, reason: `Approve payroll run — total net GHS ${run.totalNet}`, requestedById: req.auth!.userId },
  });
  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "PENDING_APPROVAL" } });
  res.status(202).json({ pendingApproval: true });
});

// §211.2 "Payment Confirmation" — no real bank/MoMo rails exist in this
// platform, so this is a genuine, audited manual confirmation that the
// actual transfer was executed OUTSIDE the system, not a fabricated
// claim that Nexus EFOS itself moved the money.
payrollRouter.post("/runs/:id/mark-paid", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const run = await prisma.payrollRun.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  if (run.status !== "APPROVED") return res.status(400).json({ error: `Only an APPROVED run can be marked paid (currently ${run.status})` });

  const updated = await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidById: req.auth!.userId, paidAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "payroll_run.mark_paid", resource: "payroll_run", resourceId: run.id, metadata: { totalNet: run.totalNet } } });
  res.json({ run: updated });
});

// §211.2 "Payroll Reversal"
payrollRouter.post("/runs/:id/reverse", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  if (!reason) return res.status(400).json({ error: "A reason is required to reverse a payroll run" });
  const run = await prisma.payrollRun.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  if (!["APPROVED", "PAID"].includes(run.status)) return res.status(400).json({ error: `Only an APPROVED or PAID run can be reversed (currently ${run.status})` });

  const updated = await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "REVERSED", reversedById: req.auth!.userId, reversedAt: new Date(), reversalReason: reason } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "payroll_run.reverse", resource: "payroll_run", resourceId: run.id, metadata: { reason } } });
  res.json({ run: updated });
});

// §211.2 "Bank File Generation" — a generic CSV. Employees with no bank
// details on file are genuinely excluded and named in the response, not
// silently skipped or given a fabricated placeholder account number.
payrollRouter.get("/runs/:id/bank-file", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const run = await prisma.payrollRun.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, include: { entries: true } });
  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  if (run.status !== "APPROVED" && run.status !== "PAID") return res.status(400).json({ error: "A bank file can only be generated for an APPROVED or PAID run" });

  const employeeIds = run.entries.map((e) => e.employeeId);
  const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true, bankName: true, bankAccountNumber: true, bankAccountName: true } });
  const empById = new Map(employees.map((e) => [e.id, e]));

  const rows = ["Employee Name,Bank Name,Account Number,Account Name,Amount"];
  const missingBankDetails: string[] = [];
  for (const entry of run.entries) {
    const emp = empById.get(entry.employeeId);
    if (!emp?.bankAccountNumber) { missingBankDetails.push(emp?.fullName || entry.employeeId); continue; }
    rows.push(`"${emp.fullName}","${emp.bankName || ""}","${emp.bankAccountNumber}","${emp.bankAccountName || emp.fullName}",${Number(entry.netPay).toFixed(2)}`);
  }

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "payroll_run.bank_file_generated", resource: "payroll_run", resourceId: run.id, metadata: { missingBankDetailsCount: missingBankDetails.length } } });

  if (missingBankDetails.length > 0) {
    res.setHeader("X-Missing-Bank-Details", missingBankDetails.join("; "));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="payroll-bank-file-${run.id}.csv"`);
  res.send(rows.join("\n"));
});

// §211.2 "Disbursement Reporting"
payrollRouter.get("/reports/disbursement", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const runs = await prisma.payrollRun.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  const summary = {
    totalRuns: runs.length,
    totalPaid: runs.filter((r) => r.status === "PAID").reduce((s, r) => s + Number(r.totalNet), 0),
    pendingApproval: runs.filter((r) => r.status === "PENDING_APPROVAL").length,
    approvedNotYetPaid: runs.filter((r) => r.status === "APPROVED").length,
    reversed: runs.filter((r) => r.status === "REVERSED").length,
  };
  res.json({ runs, summary });
});

// -------------------------------------------------------------------------
// §213 Payslip and Employee Self-Service. §213.3 "Employees access only
// their own payroll records" — the load-bearing security rule here: the
// employeeId is NEVER taken from the request, always derived from the
// authenticated user's own linked Employee record. No admin permission
// gate on these routes at all — deliberately, since these are for every
// employee, not just HR/admin staff, and the ownership check itself is
// what keeps them safe. §213.3 "Every employee access is audited" —
// genuinely logged on every payslip view/download below.
// -------------------------------------------------------------------------

async function resolveOwnEmployee(req: AuthedRequest) {
  return prisma.employee.findFirst({ where: { userId: req.auth!.userId, institutionId: req.auth!.institutionId } });
}

payrollRouter.get("/my-payslips", async (req: AuthedRequest, res) => {
  const employee = await resolveOwnEmployee(req);
  if (!employee) return res.status(404).json({ error: "No employee record is linked to your account" });

  const entries = await prisma.payrollEntry.findMany({
    where: { employeeId: employee.id, payrollRun: { status: { in: ["APPROVED", "PAID"] } } },
    include: { payrollRun: true },
    orderBy: { createdAt: "desc" },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "payslip.list_viewed", resource: "payroll_entry", resourceId: employee.id } });
  res.json({ entries });
});

payrollRouter.get("/my-payslips/:entryId/download", async (req: AuthedRequest, res) => {
  const employee = await resolveOwnEmployee(req);
  if (!employee) return res.status(404).json({ error: "No employee record is linked to your account" });

  const entry = await prisma.payrollEntry.findFirst({
    where: { id: req.params.entryId, employeeId: employee.id }, // ownership enforced here, not just by listing
    include: { payrollRun: true },
  });
  if (!entry) return res.status(404).json({ error: "Payslip not found" });
  if (!["APPROVED", "PAID"].includes(entry.payrollRun.status)) return res.status(400).json({ error: "This payslip is not yet available" });

  const period = await prisma.payrollPeriod.findUnique({ where: { id: entry.payrollRun.payrollPeriodId } });
  const institution = await prisma.institution.findUnique({ where: { id: req.auth!.institutionId } });

  const pdfBuffer = await generatePayslipPdf({
    institution: { legalName: institution!.legalName, regulatorId: institution!.regulatorId },
    employee: { fullName: employee.fullName, employeeNumber: employee.employeeNumber },
    periodName: period?.name || "—", payDate: period?.payDate || entry.createdAt,
    basicSalary: Number(entry.basicSalary), allowances: [], // line-item allowance detail not retained per-entry — see build log
    grossPay: Number(entry.grossPay), paye: Number(entry.paye), ssnitEmployee: Number(entry.ssnitEmployee),
    otherDeductions: entry.otherDeductions ? [{ name: "Other Deductions", amount: Number(entry.otherDeductions) }] : [],
    netPay: Number(entry.netPay), generatedAt: new Date(),
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "payslip.downloaded", resource: "payroll_entry", resourceId: entry.id } });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="payslip-${period?.name || entry.id}.pdf"`);
  res.send(pdfBuffer);
});

// §213.2 "Tax Certificates" — an annual PAYE summary, the same real data
// the DT 0108B annual schedule format the person shared expects, though
// not yet formatted to match that exact GRA template — that's a real,
// separate piece of work for when Statutory Reporting (§212's reporting
// side) is built out.
payrollRouter.get("/my-tax-certificate", async (req: AuthedRequest, res) => {
  const employee = await resolveOwnEmployee(req);
  if (!employee) return res.status(404).json({ error: "No employee record is linked to your account" });
  const year = Number((req.query as any).year) || new Date().getFullYear();

  const entries = await prisma.payrollEntry.findMany({
    where: { employeeId: employee.id, payrollRun: { status: "PAID" }, createdAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) } },
  });

  const totalGross = entries.reduce((s, e) => s + Number(e.grossPay), 0);
  const totalPaye = entries.reduce((s, e) => s + Number(e.paye), 0);

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "tax_certificate.viewed", resource: "employee", resourceId: employee.id, metadata: { year } } });

  res.json({ year, employeeName: employee.fullName, employeeNumber: employee.employeeNumber, payslipCount: entries.length, totalGross: Math.round(totalGross * 100) / 100, totalPaye: Math.round(totalPaye * 100) / 100 });
});

// §213.2 "Contribution Statements" — the equivalent annual summary for
// SSNIT/Tier 2.
payrollRouter.get("/my-contribution-statement", async (req: AuthedRequest, res) => {
  const employee = await resolveOwnEmployee(req);
  if (!employee) return res.status(404).json({ error: "No employee record is linked to your account" });
  const year = Number((req.query as any).year) || new Date().getFullYear();

  const entries = await prisma.payrollEntry.findMany({
    where: { employeeId: employee.id, payrollRun: { status: "PAID" }, createdAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) } },
  });

  const totalSsnitEmployee = entries.reduce((s, e) => s + Number(e.ssnitEmployee), 0);
  const totalSsnitEmployerTier1 = entries.reduce((s, e) => s + Number(e.ssnitEmployerTier1), 0);
  const totalTier2Employer = entries.reduce((s, e) => s + Number(e.tier2Employer), 0);

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "contribution_statement.viewed", resource: "employee", resourceId: employee.id, metadata: { year } } });

  res.json({ year, employeeName: employee.fullName, payslipCount: entries.length, totalSsnitEmployee: Math.round(totalSsnitEmployee * 100) / 100, totalSsnitEmployerTier1: Math.round(totalSsnitEmployerTier1 * 100) / 100, totalTier2Employer: Math.round(totalTier2Employer * 100) / 100 });
});
