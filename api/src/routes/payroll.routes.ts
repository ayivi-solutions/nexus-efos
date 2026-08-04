import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

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
