import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// EFS §201 Attendance Management, §203 Performance Management; ETAS
// §41.4 names DisciplinaryCase as an owned entity (no detailed EFS
// business rules, built to standard HR practice instead). Ops Supervisor
// role schedule's "Ensure all Staff report to work by 7:30am" is the
// concrete trigger for the attendance half.
export const hrRouter = Router();
hrRouter.use(requireAuth);

// ---------------------------------------------------------------------
// §201 Attendance Management
// ---------------------------------------------------------------------

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

hrRouter.get("/attendance", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { employeeId, from, to } = req.query as { employeeId?: string; from?: string; to?: string };
  const records = await prisma.attendanceRecord.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(employeeId ? { employeeId } : {}),
      ...(from || to ? { workDate: { ...(from ? { gte: startOfDay(new Date(from)) } : {}), ...(to ? { lte: startOfDay(new Date(to)) } : {}) } } : {}),
    },
    orderBy: { workDate: "desc" },
  });
  res.json({ records });
});

const clockInSchema = z.object({ employeeId: z.string(), method: z.enum(["MANUAL", "REMOTE"]).optional() });

hrRouter.post("/attendance/clock-in", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = clockInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const employee = await prisma.employee.findFirst({ where: { id: parsed.data.employeeId, institutionId: req.auth!.institutionId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const workDate = startOfDay(new Date());
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate } } });
  if (existing) return res.status(400).json({ error: "This employee has already clocked in today" });

  const record = await prisma.attendanceRecord.create({
    data: { institutionId: req.auth!.institutionId, employeeId: employee.id, workDate, clockInAt: new Date(), method: parsed.data.method ?? "MANUAL", recordedById: req.auth!.userId },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "attendance.clock_in", resource: "attendance_record", resourceId: record.id } });
  res.status(201).json({ record });
});

hrRouter.post("/attendance/:id/clock-out", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const record = await prisma.attendanceRecord.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!record) return res.status(404).json({ error: "Attendance record not found" });
  if (record.clockOutAt) return res.status(400).json({ error: "Already clocked out" });

  const updated = await prisma.attendanceRecord.update({ where: { id: record.id }, data: { clockOutAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "attendance.clock_out", resource: "attendance_record", resourceId: record.id } });
  res.json({ record: updated });
});

const correctionSchema = z.object({ proposedClockInAt: z.string().optional(), proposedClockOutAt: z.string().optional(), reason: z.string().min(2) });

// §201.3 "Corrections require approval" — the proposal is stored but the
// real clockInAt/clockOutAt don't change until an ApprovalRequest is
// resolved (see approvals.routes.ts, case ATTENDANCE_CORRECTION).
hrRouter.post("/attendance/:id/request-correction", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!parsed.data.proposedClockInAt && !parsed.data.proposedClockOutAt) {
    return res.status(400).json({ error: "Propose at least one corrected time" });
  }
  const record = await prisma.attendanceRecord.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!record) return res.status(404).json({ error: "Attendance record not found" });
  if (record.correctionPending) return res.status(400).json({ error: "A correction is already pending approval for this record" });

  await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      correctionPending: true,
      proposedClockInAt: parsed.data.proposedClockInAt ? new Date(parsed.data.proposedClockInAt) : undefined,
      proposedClockOutAt: parsed.data.proposedClockOutAt ? new Date(parsed.data.proposedClockOutAt) : undefined,
      correctionReason: parsed.data.reason,
      correctionRequestedById: req.auth!.userId,
    },
  });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "ATTENDANCE_CORRECTION", targetType: "AttendanceRecord", targetId: record.id, payload: {}, reason: parsed.data.reason, requestedById: req.auth!.userId },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "attendance.request_correction", resource: "attendance_record", resourceId: record.id } });
  res.status(202).json({ pendingApproval: true });
});

// ---------------------------------------------------------------------
// §203 Performance Management
// ---------------------------------------------------------------------

hrRouter.get("/performance-reviews", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { employeeId } = req.query as { employeeId?: string };
  const reviews = await prisma.performanceReview.findMany({
    where: { institutionId: req.auth!.institutionId, ...(employeeId ? { employeeId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  res.json({ reviews });
});

const createReviewSchema = z.object({
  employeeId: z.string(),
  reviewerId: z.string(),
  cycleLabel: z.string().min(1),
  goals: z.string().optional(),
  kpis: z.any().optional(),
});

hrRouter.post("/performance-reviews", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = createReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [employee, reviewer] = await Promise.all([
    prisma.employee.findFirst({ where: { id: parsed.data.employeeId, institutionId: req.auth!.institutionId } }),
    prisma.employee.findFirst({ where: { id: parsed.data.reviewerId, institutionId: req.auth!.institutionId } }),
  ]);
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (!reviewer) return res.status(404).json({ error: "Reviewer not found" });

  const review = await prisma.performanceReview.create({
    data: { institutionId: req.auth!.institutionId, employeeId: employee.id, reviewerId: reviewer.id, cycleLabel: parsed.data.cycleLabel, goals: parsed.data.goals, kpis: parsed.data.kpis },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "performance_review.create", resource: "performance_review", resourceId: review.id } });
  res.status(201).json({ review });
});

const submitSelfAssessmentSchema = z.object({ selfAssessment: z.string().min(1) });

hrRouter.post("/performance-reviews/:id/self-assessment", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = submitSelfAssessmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const review = await prisma.performanceReview.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!review) return res.status(404).json({ error: "Review not found" });
  if (review.status !== "DRAFT") return res.status(400).json({ error: `Cannot submit self-assessment from status ${review.status}` });

  const updated = await prisma.performanceReview.update({ where: { id: review.id }, data: { selfAssessment: parsed.data.selfAssessment, status: "SELF_ASSESSMENT" } });
  res.json({ review: updated });
});

const submitManagerAssessmentSchema = z.object({ managerAssessment: z.string().min(1), rating: z.enum(["UNSATISFACTORY", "NEEDS_IMPROVEMENT", "MEETS_EXPECTATIONS", "EXCEEDS_EXPECTATIONS", "OUTSTANDING"]), developmentPlan: z.string().optional() });

hrRouter.post("/performance-reviews/:id/manager-assessment", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = submitManagerAssessmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const review = await prisma.performanceReview.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!review) return res.status(404).json({ error: "Review not found" });
  if (review.status !== "SELF_ASSESSMENT" && review.status !== "DRAFT") {
    return res.status(400).json({ error: `Cannot submit manager assessment from status ${review.status}` });
  }

  const updated = await prisma.performanceReview.update({
    where: { id: review.id },
    data: { managerAssessment: parsed.data.managerAssessment, rating: parsed.data.rating, developmentPlan: parsed.data.developmentPlan, status: "COMPLETED", completedAt: new Date() },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "performance_review.complete", resource: "performance_review", resourceId: review.id, metadata: { rating: parsed.data.rating } } });
  res.json({ review: updated });
});

// ---------------------------------------------------------------------
// Disciplinary Cases (ETAS §41.4). ECD §43.11 Human-in-the-Loop
// Automation explicitly names disciplinary actions as requiring human
// judgement — entirely staff-driven, nothing here auto-escalates.
// ---------------------------------------------------------------------

hrRouter.get("/disciplinary-cases", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { employeeId, status } = req.query as { employeeId?: string; status?: string };
  const cases = await prisma.disciplinaryCase.findMany({
    where: { institutionId: req.auth!.institutionId, ...(employeeId ? { employeeId } : {}), ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: "desc" },
  });
  res.json({ cases });
});

const createCaseSchema = z.object({ employeeId: z.string(), misconductDescription: z.string().min(2) });

hrRouter.post("/disciplinary-cases", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = createCaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const employee = await prisma.employee.findFirst({ where: { id: parsed.data.employeeId, institutionId: req.auth!.institutionId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const dcase = await prisma.disciplinaryCase.create({
    data: { institutionId: req.auth!.institutionId, employeeId: employee.id, misconductDescription: parsed.data.misconductDescription, raisedById: req.auth!.userId },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "disciplinary_case.raise", resource: "disciplinary_case", resourceId: dcase.id } });
  res.status(201).json({ case: dcase });
});

const investigateCaseSchema = z.object({ investigationNotes: z.string().optional() });

hrRouter.post("/disciplinary-cases/:id/investigate", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = investigateCaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const dcase = await prisma.disciplinaryCase.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!dcase) return res.status(404).json({ error: "Case not found" });
  if (dcase.status !== "OPEN") return res.status(400).json({ error: `Cannot move to investigating from ${dcase.status}` });

  const updated = await prisma.disciplinaryCase.update({ where: { id: dcase.id }, data: { status: "INVESTIGATING", investigationNotes: parsed.data.investigationNotes } });
  res.json({ case: updated });
});

const resolveCaseSchema = z.object({ actionTaken: z.enum(["VERBAL_WARNING", "WRITTEN_WARNING", "FINAL_WARNING", "SUSPENSION", "TERMINATION"]) });

hrRouter.post("/disciplinary-cases/:id/resolve", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = resolveCaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const dcase = await prisma.disciplinaryCase.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!dcase) return res.status(404).json({ error: "Case not found" });
  if (dcase.status !== "OPEN" && dcase.status !== "INVESTIGATING") return res.status(400).json({ error: `Cannot resolve from status ${dcase.status}` });

  const updated = await prisma.disciplinaryCase.update({
    where: { id: dcase.id },
    data: { status: "RESOLVED", actionTaken: parsed.data.actionTaken, resolvedAt: new Date(), resolvedById: req.auth!.userId },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "disciplinary_case.resolve", resource: "disciplinary_case", resourceId: dcase.id, metadata: { actionTaken: parsed.data.actionTaken } } });
  res.json({ case: updated });
});

hrRouter.post("/disciplinary-cases/:id/close", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const dcase = await prisma.disciplinaryCase.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!dcase) return res.status(404).json({ error: "Case not found" });
  if (dcase.status !== "RESOLVED") return res.status(400).json({ error: "Only a resolved case can be closed" });
  const updated = await prisma.disciplinaryCase.update({ where: { id: dcase.id }, data: { status: "CLOSED" } });
  res.json({ case: updated });
});
