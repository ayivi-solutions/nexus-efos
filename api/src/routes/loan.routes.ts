import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { round2, generateSchedule, allocateRepayment } from "../lib/loanSchedule";
import { assessCredit } from "../lib/creditAssessment";
import { matchRules, executeMatchedRules } from "../lib/businessRules";
import { runArrearsCheck } from "../lib/scheduler";

export const loanRouter = Router();
loanRouter.use(requireAuth);

loanRouter.get("/", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loans = await prisma.loan.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { customer: { select: { fullName: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ loans });
});

loanRouter.get("/:id", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
      branch: { select: { name: true } },
      repayments: { orderBy: { paidAt: "desc" } },
      installments: { orderBy: { installmentNumber: "asc" } },
      accountHolders: { where: { deletedAt: null }, include: { customer: { select: { id: true, fullName: true, phone: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  res.json({ loan });
});

const addHolderSchema = z.object({
  customerId: z.string(),
  role: z.enum(["JOINT", "AUTHORISED_SIGNATORY", "GUARDIAN", "NOMINEE", "POWER_OF_ATTORNEY", "CORPORATE_REPRESENTATIVE"]),
});

// doc §36.4 "Ownership changes require approval" — adding a holder no
// longer applies immediately; it opens an ApprovalRequest that a different
// authorised user must approve.
loanRouter.post("/:id/holders", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const parsed = addHolderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  if (parsed.data.customerId === loan.customerId) {
    return res.status(400).json({ error: "This customer is already the primary holder" });
  }
  const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, institutionId: req.auth!.institutionId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const approval = await prisma.approvalRequest.create({
    data: {
      institutionId: req.auth!.institutionId,
      type: "ACCOUNT_HOLDER_ADD",
      targetType: "Loan",
      targetId: loan.id,
      payload: { customerId: parsed.data.customerId, role: parsed.data.role, loanId: loan.id },
      reason: `Add ${parsed.data.role} holder to loan`,
      requestedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.holder_add_requested", resource: "loan", resourceId: loan.id, metadata: { customerId: parsed.data.customerId, role: parsed.data.role, approvalRequestId: approval.id } },
  });

  res.status(202).json({ pendingApproval: true, approvalRequestId: approval.id });
});

loanRouter.delete("/:id/holders/:holderId", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  // PDDS Phase 3 — soft-delete, not a real delete
  await prisma.accountHolder.updateMany({ where: { id: req.params.holderId, loanId: loan.id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.holder_remove", resource: "loan", resourceId: loan.id, metadata: { holderId: req.params.holderId } },
  });
  res.status(204).send();
});

const createSchema = z.object({
  customerId: z.string(),
  productVersionId: z.string(),
  principal: z.number().positive(),
  termMonths: z.number().int().positive(),
  branchId: z.string().optional(),
});

loanRouter.post("/", requirePermission("loans.initiate"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.findFirst({
    where: { id: parsed.data.customerId, institutionId: req.auth!.institutionId },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  if (customer.status !== "ACTIVE") {
    return res.status(400).json({ error: `Customer must be ACTIVE to receive a loan (currently ${customer.status})` });
  }

  const productVersion = await prisma.productVersion.findFirst({
    where: { id: parsed.data.productVersionId },
    include: { product: true },
  });
  if (!productVersion || productVersion.product.institutionId !== req.auth!.institutionId || productVersion.product.type !== "LOAN") {
    return res.status(404).json({ error: "Loan product not found" });
  }
  if (productVersion.product.status !== "ACTIVE") {
    return res.status(400).json({ error: "This loan product is not currently active" });
  }
  if (productVersion.minLoanAmount !== null && parsed.data.principal < Number(productVersion.minLoanAmount)) {
    return res.status(400).json({ error: `Principal must be at least GHS ${Number(productVersion.minLoanAmount).toLocaleString()} for this product` });
  }
  if (productVersion.maxLoanAmount !== null && parsed.data.principal > Number(productVersion.maxLoanAmount)) {
    return res.status(400).json({ error: `Principal cannot exceed GHS ${Number(productVersion.maxLoanAmount).toLocaleString()} for this product` });
  }
  if (productVersion.minTenureMonths !== null && parsed.data.termMonths < productVersion.minTenureMonths) {
    return res.status(400).json({ error: `Term must be at least ${productVersion.minTenureMonths} months for this product` });
  }
  if (productVersion.maxTenureMonths !== null && parsed.data.termMonths > productVersion.maxTenureMonths) {
    return res.status(400).json({ error: `Term cannot exceed ${productVersion.maxTenureMonths} months for this product` });
  }

  const loan = await prisma.loan.create({
    data: {
      institutionId: req.auth!.institutionId,
      initiatedById: req.auth!.userId,
      customerId: parsed.data.customerId,
      branchId: parsed.data.branchId,
      productVersionId: productVersion.id,
      principal: parsed.data.principal,
      termMonths: parsed.data.termMonths,
      interestRate: productVersion.interestRate,
      interestMethod: productVersion.interestMethod,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "loan.initiate",
      resource: "loan",
      resourceId: loan.id,
    },
  });

  // doc §41 Business Rules Framework — genuinely evaluated here, not a
  // configuration screen for rules that never run. Loan Initiation is the
  // one deliberate exception to the "check before creating" pattern used
  // at the other trigger points: the loan application itself is the
  // record of an attempt, so a REJECT action here marks the already-created
  // loan REJECTED rather than pretending the attempt never happened.
  const ruleContext = { principal: Number(loan.principal), termMonths: loan.termMonths, interestRate: Number(loan.interestRate), customer };
  const matched = await matchRules(prisma, req.auth!.institutionId, "LOAN_INITIATION", ruleContext);
  if (matched.some((m) => m.hasReject)) {
    await prisma.loan.update({ where: { id: loan.id }, data: { status: "REJECTED" } });
  }
  const ruleWarnings = await executeMatchedRules(prisma, req.auth!.institutionId, req.auth!.userId, "Loan", loan.id, matched);

  const finalLoan = matched.length > 0 ? await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } }) : loan;
  res.status(201).json({ loan: finalLoan, ruleWarnings });
});

loanRouter.post("/:id/approve", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  if (loan.initiatedById === req.auth!.userId) {
    return res.status(403).json({ error: "Segregation of duties: cannot approve a loan you initiated" });
  }

  // doc §41 — checked before applying the approval, not after: a rule
  // that says REJECT at this trigger point blocks the approval action
  // itself, surfaced to the approver as a clear error, rather than
  // silently flipping an already-approved loan back to some other state.
  const customer = await prisma.customer.findFirst({ where: { id: loan.customerId } });
  const approveRuleContext = { principal: Number(loan.principal), termMonths: loan.termMonths, interestRate: Number(loan.interestRate), customer };
  const approveMatched = await matchRules(prisma, req.auth!.institutionId, "LOAN_APPROVAL", approveRuleContext);
  const blockingRule = approveMatched.find((m) => m.hasReject);
  if (blockingRule) {
    return res.status(400).json({ error: `Approval blocked by business rule ${blockingRule.rule.ruleCode}: ${blockingRule.rule.name}` });
  }

  const updated = await prisma.loan.update({
    where: { id: loan.id },
    data: { status: "APPROVED", approvedById: req.auth!.userId },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "loan.approve",
      resource: "loan",
      resourceId: loan.id,
    },
  });

  const approveRuleWarnings = await executeMatchedRules(prisma, req.auth!.institutionId, req.auth!.userId, "Loan", loan.id, approveMatched);

  res.json({ loan: updated, ruleWarnings: approveRuleWarnings });
});

loanRouter.post("/:id/reject", requirePermission("loans.reject"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "REJECTED" },
  });
  if (loan.count === 0) return res.status(404).json({ error: "Loan not found" });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "loan.reject",
      resource: "loan",
      resourceId: req.params.id,
    },
  });

  res.json({ ok: true });
});

loanRouter.post("/:id/disburse", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  if (loan.status !== "APPROVED") return res.status(400).json({ error: "Loan must be APPROVED before disbursement" });

  // doc §41 Business Rules Framework — a REQUIRE_ADDITIONAL_APPROVAL action
  // has real teeth: disbursement is blocked while any business-rule-triggered
  // approval on this loan is still pending, on top of the loan's own normal
  // approval.
  const pendingRuleApproval = await prisma.approvalRequest.findFirst({
    where: { targetType: "Loan", targetId: loan.id, type: "BUSINESS_RULE_TRIGGERED", status: "PENDING" },
  });
  if (pendingRuleApproval) {
    return res.status(400).json({ error: `Disbursement blocked: "${pendingRuleApproval.reason}" is still pending approval` });
  }

  // doc §41 — a real, separate trigger point from Loan Approval: a rule
  // might approve fine but still want a last check before money actually
  // moves (e.g. a fraud-pattern check). Checked before applying the
  // disbursement, not after.
  const disburseCustomer = await prisma.customer.findFirst({ where: { id: loan.customerId } });
  const disburseContext = { principal: Number(loan.principal), termMonths: loan.termMonths, interestRate: Number(loan.interestRate), customer: disburseCustomer };
  const disburseMatched = await matchRules(prisma, req.auth!.institutionId, "LOAN_DISBURSEMENT", disburseContext);
  const disburseBlockingRule = disburseMatched.find((m) => m.hasReject);
  if (disburseBlockingRule) {
    return res.status(400).json({ error: `Disbursement blocked by business rule ${disburseBlockingRule.rule.ruleCode}: ${disburseBlockingRule.rule.name}` });
  }

  const disbursedAt = new Date();
  const schedule = generateSchedule(
    Number(loan.principal),
    Number(loan.interestRate),
    loan.termMonths,
    loan.interestMethod,
    disbursedAt
  );

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.loan.update({ where: { id: loan.id }, data: { status: "DISBURSED", disbursedAt } });
    await tx.loanInstallment.createMany({
      data: schedule.map((s) => ({
        loanId: loan.id,
        installmentNumber: s.installmentNumber,
        dueDate: s.dueDate,
        principalDue: s.principalDue,
        interestDue: s.interestDue,
        totalDue: round2(s.principalDue + s.interestDue),
      })),
    });
    return u;
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "loan.disburse",
      resource: "loan",
      resourceId: loan.id,
      metadata: { interestMethod: loan.interestMethod, installments: schedule.length },
    },
  });

  const disburseRuleWarnings = await executeMatchedRules(prisma, req.auth!.institutionId, req.auth!.userId, "Loan", loan.id, disburseMatched);

  res.json({ loan: updated, ruleWarnings: disburseRuleWarnings });
});

const repaymentSchema = z.object({ amount: z.number().positive() });

loanRouter.post("/:id/repayments", requirePermission("collections.record"), async (req: AuthedRequest, res) => {
  const parsed = repaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const loan = await prisma.loan.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  const repayment = await prisma.loanRepayment.create({
    data: { loanId: loan.id, amount: parsed.data.amount, recordedById: req.auth!.userId },
  });

  const installmentStates = loan.installments.map((inst) => ({
    id: inst.id,
    interestDue: Number(inst.interestDue),
    principalDue: Number(inst.principalDue),
    interestPaid: Number(inst.interestPaid),
    principalPaid: Number(inst.principalPaid),
    status: inst.status,
  }));
  const updates = allocateRepayment(installmentStates, parsed.data.amount);
  for (const u of updates) {
    await prisma.loanInstallment.update({
      where: { id: u.id },
      data: { interestPaid: u.newInterestPaid, principalPaid: u.newPrincipalPaid, status: u.newStatus },
    });
  }

  const allInstallments = await prisma.loanInstallment.findMany({ where: { loanId: loan.id } });
  const allPaid = allInstallments.length > 0 && allInstallments.every((i) => i.status === "PAID");

  if (allPaid) {
    await prisma.loan.update({ where: { id: loan.id }, data: { status: "CLOSED" } });
  } else if (loan.status === "DISBURSED") {
    await prisma.loan.update({ where: { id: loan.id }, data: { status: "ACTIVE" } });
  }

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "loan.repayment_recorded",
      resource: "loan",
      resourceId: loan.id,
      metadata: { amount: parsed.data.amount, loanClosed: allPaid },
    },
  });

  res.status(201).json({ repayment, loanClosed: allPaid });
});

// =========================================================================
// doc §77.2 Promise-to-Pay Recording
// =========================================================================

const promiseToPaySchema = z.object({
  promisedAmount: z.number().positive(),
  promisedDate: z.string(),
  notes: z.string().optional(),
});

loanRouter.get("/:id/promises-to-pay", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  const promises = await prisma.promiseToPay.findMany({ where: { loanId: loan.id }, orderBy: { createdAt: "desc" } });
  res.json({ promises });
});

loanRouter.post("/:id/promises-to-pay", requirePermission("loans.initiate"), async (req: AuthedRequest, res) => {
  const parsed = promiseToPaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  const promise = await prisma.promiseToPay.create({
    data: {
      institutionId: req.auth!.institutionId,
      loanId: loan.id,
      promisedAmount: parsed.data.promisedAmount,
      promisedDate: new Date(parsed.data.promisedDate),
      notes: parsed.data.notes,
      recordedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.promise_to_pay_recorded", resource: "loan", resourceId: loan.id, metadata: { promiseId: promise.id, promisedAmount: parsed.data.promisedAmount } },
  });

  res.status(201).json({ promise });
});

// Marking a promise kept/broken is a real, distinct staff judgment — not
// automatic — since "kept" isn't strictly "a payment of at least this
// amount arrived," it's "did this specific commitment get honoured,"
// which a human closing the loop is better placed to confirm than a rule.
loanRouter.patch("/promises-to-pay/:promiseId", requirePermission("loans.initiate"), async (req: AuthedRequest, res) => {
  const { status } = req.body as { status?: "KEPT" | "BROKEN" };
  if (!status || !["KEPT", "BROKEN"].includes(status)) return res.status(400).json({ error: "status must be KEPT or BROKEN" });

  const promise = await prisma.promiseToPay.findFirst({ where: { id: req.params.promiseId, institutionId: req.auth!.institutionId } });
  if (!promise) return res.status(404).json({ error: "Promise not found" });

  const updated = await prisma.promiseToPay.update({ where: { id: promise.id }, data: { status } });
  res.json({ promise: updated });
});

// =========================================================================
// doc §71 Loan Penalty Management
// =========================================================================

const penaltySchema = z.object({
  installmentId: z.string().optional(),
  calculationMethod: z.enum(["FIXED", "PERCENTAGE"]),
  rateOrAmount: z.number().positive(),
});

loanRouter.get("/:id/penalties", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  const penalties = await prisma.loanPenalty.findMany({ where: { loanId: loan.id }, orderBy: { appliedAt: "desc" } });
  res.json({ penalties });
});

// doc §71.3 "Penalty calculations follow product rules" — the actual
// amount is computed here, not trusted from the request, so a
// PERCENTAGE penalty is always genuinely a percentage of the loan's
// current arrears amount, not whatever number a client happened to send.
loanRouter.post("/:id/penalties", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const parsed = penaltySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  const amount =
    parsed.data.calculationMethod === "FIXED"
      ? round2(parsed.data.rateOrAmount)
      : round2(Number(loan.arrearsAmount) * (parsed.data.rateOrAmount / 100));

  if (amount <= 0) {
    return res.status(400).json({ error: "Computed penalty amount must be greater than 0 — this loan may not currently be in arrears" });
  }

  const penalty = await prisma.loanPenalty.create({
    data: {
      institutionId: req.auth!.institutionId, loanId: loan.id, installmentId: parsed.data.installmentId,
      calculationMethod: parsed.data.calculationMethod as any, rateOrAmount: parsed.data.rateOrAmount, amount,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.penalty_applied", resource: "loan", resourceId: loan.id, metadata: { penaltyId: penalty.id, amount } },
  });

  res.status(201).json({ penalty });
});

// doc §71.3 "Waivers require authorisation" — same permission tier as
// loan approval, deliberately not the lower "initiate" tier, since waiving
// a penalty is closer in weight to approving one than recording one.
loanRouter.post("/penalties/:penaltyId/waive", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  const penalty = await prisma.loanPenalty.findFirst({ where: { id: req.params.penaltyId, institutionId: req.auth!.institutionId } });
  if (!penalty) return res.status(404).json({ error: "Penalty not found" });
  if (penalty.status !== "APPLIED") return res.status(400).json({ error: `Only an APPLIED penalty can be waived (currently ${penalty.status})` });

  const updated = await prisma.loanPenalty.update({
    where: { id: penalty.id },
    data: { status: "WAIVED", waivedById: req.auth!.userId, waivedAt: new Date(), waivedReason: reason },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.penalty_waived", resource: "loan", resourceId: penalty.loanId, metadata: { penaltyId: penalty.id, reason } },
  });

  res.json({ penalty: updated });
});

loanRouter.post("/penalties/:penaltyId/reverse", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  const penalty = await prisma.loanPenalty.findFirst({ where: { id: req.params.penaltyId, institutionId: req.auth!.institutionId } });
  if (!penalty) return res.status(404).json({ error: "Penalty not found" });
  if (penalty.status === "REVERSED") return res.status(400).json({ error: "This penalty is already reversed" });

  const updated = await prisma.loanPenalty.update({
    where: { id: penalty.id },
    data: { status: "REVERSED", waivedById: req.auth!.userId, waivedAt: new Date(), waivedReason: reason },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.penalty_reversed", resource: "loan", resourceId: penalty.loanId, metadata: { penaltyId: penalty.id, reason } },
  });

  res.json({ penalty: updated });
});

// Manual trigger — the real check runs automatically every day at 01:00
// (see lib/scheduler.ts); this exists for testing and pilot setup, so
// arrears status doesn't have to wait until the next scheduled run to
// verify the feature actually works.
loanRouter.post("/arrears-check/run-now", requirePermission("institution.configure"), async (_req: AuthedRequest, res) => {
  await runArrearsCheck();
  res.json({ ok: true });
});

// =========================================================================
// doc §64 Credit Assessment
// =========================================================================

const creditAssessmentSchema = z.object({
  monthlyIncome: z.number().nonnegative(),
  monthlyExpenses: z.number().nonnegative(),
  creditBureauChecked: z.boolean().optional(),
  creditBureauNotes: z.string().optional(),
});

loanRouter.get("/:id/credit-assessment", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  const assessment = await prisma.creditAssessment.findUnique({ where: { loanId: loan.id } });
  res.json({ assessment });
});

// §64.4 "Assessment follows product policies" and "Risk scores are
// recorded" — existingLoanObligations and the proposed installment are
// both computed here from real data (this customer's other active loans,
// and this loan's own generated schedule), never trusted from the
// request — a person can only submit the two figures that genuinely
// require self-reported input: income and expenses.
loanRouter.post("/:id/credit-assessment", requirePermission("loans.initiate"), async (req: AuthedRequest, res) => {
  const parsed = creditAssessmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const loan = await prisma.loan.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: { customer: true },
  });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  const existing = await prisma.creditAssessment.findUnique({ where: { loanId: loan.id } });
  if (existing) return res.status(400).json({ error: "This loan already has a credit assessment — an assessment is not re-run, only overridden if needed" });

  // §64.3 Existing Loan Analysis — genuinely computed, not self-reported:
  // every other active loan this customer holds, summed by its own
  // installment amount.
  const otherLoans = await prisma.loan.findMany({
    where: { customerId: loan.customerId, status: { in: ["DISBURSED", "ACTIVE"] }, id: { not: loan.id } },
    include: { installments: { where: { status: { in: ["PENDING", "PARTIALLY_PAID"] } }, orderBy: { installmentNumber: "asc" }, take: 1 } },
  });
  const existingLoanObligations = round2(otherLoans.reduce((sum, l) => sum + (l.installments[0] ? Number(l.installments[0].totalDue) : 0), 0));
  const hasLoansInArrears = otherLoans.some((l) => l.arrearsClassification !== "CURRENT");

  // The proposed installment for THIS loan, from its own real schedule —
  // the first installment (the highest one for Reducing Balance loans,
  // which is the more conservative, safer figure to test affordability
  // against).
  const schedule = generateSchedule(Number(loan.principal), Number(loan.interestRate), loan.termMonths, loan.interestMethod, loan.createdAt);
  const proposedInstallment = round2(schedule[0].principalDue + schedule[0].interestDue);

  const result = assessCredit({
    monthlyIncome: parsed.data.monthlyIncome,
    monthlyExpenses: parsed.data.monthlyExpenses,
    existingLoanObligations,
    proposedInstallment,
    customerRiskRating: loan.customer.riskRating as any,
    hasLoansInArrears,
  });

  const assessment = await prisma.creditAssessment.create({
    data: {
      institutionId: req.auth!.institutionId,
      loanId: loan.id,
      monthlyIncome: parsed.data.monthlyIncome,
      monthlyExpenses: parsed.data.monthlyExpenses,
      existingLoanObligations,
      proposedInstallment,
      debtToIncomeRatio: result.debtToIncomeRatio,
      repaymentCapacityRatio: result.repaymentCapacityRatio,
      riskScore: result.riskScore,
      scoreBreakdown: result.scoreBreakdown as any,
      recommendation: result.recommendation as any,
      creditBureauChecked: parsed.data.creditBureauChecked ?? false,
      creditBureauNotes: parsed.data.creditBureauNotes,
      assessedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.credit_assessment_created", resource: "loan", resourceId: loan.id, metadata: { assessmentId: assessment.id, riskScore: result.riskScore, recommendation: result.recommendation } },
  });

  res.status(201).json({ assessment });
});

// §64.4 "Manual overrides require authorisation" — a higher permission
// tier than creating the original assessment, since overriding the
// system's own recommendation is a more consequential action than
// recording one.
loanRouter.post("/:id/credit-assessment/override", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  if (!reason) return res.status(400).json({ error: "A reason is required to override a credit assessment" });

  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  const assessment = await prisma.creditAssessment.findUnique({ where: { loanId: loan.id } });
  if (!assessment) return res.status(404).json({ error: "No credit assessment exists for this loan yet" });

  const updated = await prisma.creditAssessment.update({
    where: { id: assessment.id },
    data: { overridden: true, overriddenById: req.auth!.userId, overriddenAt: new Date(), overrideReason: reason },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.credit_assessment_overridden", resource: "loan", resourceId: loan.id, metadata: { assessmentId: assessment.id, reason } },
  });

  res.json({ assessment: updated });
});

// =========================================================================
// doc §65 Guarantor Management
// =========================================================================

const guarantorSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  relationship: z.string().min(1),
  monthlyIncome: z.number().nonnegative().optional(),
  guaranteeLimit: z.number().positive(),
});

loanRouter.get("/:id/guarantors", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  const guarantors = await prisma.guarantor.findMany({ where: { loanId: loan.id }, orderBy: { createdAt: "asc" } });
  res.json({ guarantors });
});

// §65.4 "Guarantee limits are enforced" — the sum of all non-released
// guarantee limits on a loan is never allowed to exceed its principal,
// checked here rather than trusted to whoever's filling in the form.
loanRouter.post("/:id/guarantors", requirePermission("loans.initiate"), async (req: AuthedRequest, res) => {
  const parsed = guarantorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  const existing = await prisma.guarantor.findMany({ where: { loanId: loan.id, status: { not: "RELEASED" } } });
  const totalPledged = existing.reduce((sum, g) => sum + Number(g.guaranteeLimit), 0);
  if (totalPledged + parsed.data.guaranteeLimit > Number(loan.principal)) {
    return res.status(400).json({ error: `Total guarantee limits (GHS ${(totalPledged + parsed.data.guaranteeLimit).toLocaleString()}) would exceed the loan principal (GHS ${Number(loan.principal).toLocaleString()})` });
  }

  const guarantor = await prisma.guarantor.create({
    data: { institutionId: req.auth!.institutionId, loanId: loan.id, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.guarantor_registered", resource: "loan", resourceId: loan.id, metadata: { guarantorId: guarantor.id } },
  });

  res.status(201).json({ guarantor });
});

loanRouter.post("/guarantors/:guarantorId/approve", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const guarantor = await prisma.guarantor.findFirst({ where: { id: req.params.guarantorId, institutionId: req.auth!.institutionId } });
  if (!guarantor) return res.status(404).json({ error: "Guarantor not found" });
  if (guarantor.status !== "PENDING") return res.status(400).json({ error: `Only a PENDING guarantor can be approved (currently ${guarantor.status})` });

  const updated = await prisma.guarantor.update({ where: { id: guarantor.id }, data: { status: "APPROVED", approvedById: req.auth!.userId, approvedAt: new Date() } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.guarantor_approved", resource: "loan", resourceId: guarantor.loanId, metadata: { guarantorId: guarantor.id } },
  });

  res.json({ guarantor: updated });
});

// §65.4 "Released guarantees remain historically available" — a status
// change (RELEASED), never a delete, so the record and its history stay
// intact.
loanRouter.post("/guarantors/:guarantorId/release", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  const guarantor = await prisma.guarantor.findFirst({ where: { id: req.params.guarantorId, institutionId: req.auth!.institutionId } });
  if (!guarantor) return res.status(404).json({ error: "Guarantor not found" });
  if (guarantor.status === "RELEASED") return res.status(400).json({ error: "This guarantor is already released" });

  const updated = await prisma.guarantor.update({
    where: { id: guarantor.id },
    data: { status: "RELEASED", releasedById: req.auth!.userId, releasedAt: new Date(), releaseReason: reason },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.guarantor_released", resource: "loan", resourceId: guarantor.loanId, metadata: { guarantorId: guarantor.id, reason } },
  });

  res.json({ guarantor: updated });
});

// =========================================================================
// doc §66 Collateral Management
// =========================================================================

const collateralSchema = z.object({
  type: z.enum(["LAND", "BUILDING", "VEHICLE", "EQUIPMENT", "INVENTORY", "OTHER"]),
  description: z.string().min(2),
  ownerName: z.string().min(2),
  ownershipVerified: z.boolean().optional(),
  estimatedValue: z.number().positive(),
  valuationDate: z.string(),
  insuranceRequired: z.boolean().optional(),
  insurancePolicyNo: z.string().optional(),
  insuranceExpiryDate: z.string().optional(),
});

loanRouter.get("/:id/collateral", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  const collateral = await prisma.collateral.findMany({ where: { loanId: loan.id }, orderBy: { createdAt: "asc" } });
  res.json({ collateral });
});

// §66.4 "Collateral is linked to approved loans" — registration is
// blocked before the loan reaches at least APPROVED status.
loanRouter.post("/:id/collateral", requirePermission("loans.initiate"), async (req: AuthedRequest, res) => {
  const parsed = collateralSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  if (!["APPROVED", "DISBURSED", "ACTIVE"].includes(loan.status)) {
    return res.status(400).json({ error: "Collateral can only be linked to an APPROVED or later-stage loan" });
  }

  const collateral = await prisma.collateral.create({
    data: {
      institutionId: req.auth!.institutionId, loanId: loan.id,
      type: parsed.data.type as any, description: parsed.data.description, ownerName: parsed.data.ownerName,
      ownershipVerified: parsed.data.ownershipVerified ?? false, estimatedValue: parsed.data.estimatedValue,
      valuationDate: new Date(parsed.data.valuationDate), valuedById: req.auth!.userId,
      insuranceRequired: parsed.data.insuranceRequired ?? false, insurancePolicyNo: parsed.data.insurancePolicyNo,
      insuranceExpiryDate: parsed.data.insuranceExpiryDate ? new Date(parsed.data.insuranceExpiryDate) : undefined,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.collateral_registered", resource: "loan", resourceId: loan.id, metadata: { collateralId: collateral.id } },
  });

  res.status(201).json({ collateral });
});

// §66.3 Revaluation
loanRouter.post("/collateral/:collateralId/revalue", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const { estimatedValue } = req.body as { estimatedValue?: number };
  if (!estimatedValue || estimatedValue <= 0) return res.status(400).json({ error: "estimatedValue must be positive" });

  const collateral = await prisma.collateral.findFirst({ where: { id: req.params.collateralId, institutionId: req.auth!.institutionId } });
  if (!collateral) return res.status(404).json({ error: "Collateral not found" });

  const updated = await prisma.collateral.update({
    where: { id: collateral.id },
    data: { estimatedValue, valuationDate: new Date(), valuedById: req.auth!.userId },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.collateral_revalued", resource: "loan", resourceId: collateral.loanId, metadata: { collateralId: collateral.id, newValue: estimatedValue } },
  });

  res.json({ collateral: updated });
});

loanRouter.post("/collateral/:collateralId/release", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  const collateral = await prisma.collateral.findFirst({ where: { id: req.params.collateralId, institutionId: req.auth!.institutionId } });
  if (!collateral) return res.status(404).json({ error: "Collateral not found" });
  if (collateral.status !== "PLEDGED") return res.status(400).json({ error: `Only PLEDGED collateral can be released (currently ${collateral.status})` });

  const updated = await prisma.collateral.update({
    where: { id: collateral.id },
    data: { status: "RELEASED", releasedById: req.auth!.userId, releasedAt: new Date(), releaseReason: reason },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.collateral_released", resource: "loan", resourceId: collateral.loanId, metadata: { collateralId: collateral.id, reason } },
  });

  res.json({ collateral: updated });
});

// §66.3 Collateral Realisation — the institution takes and disposes of
// the asset to recover an unpaid loan.
loanRouter.post("/collateral/:collateralId/realise", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const { realisedAmount } = req.body as { realisedAmount?: number };
  if (!realisedAmount || realisedAmount < 0) return res.status(400).json({ error: "realisedAmount must be provided" });

  const collateral = await prisma.collateral.findFirst({ where: { id: req.params.collateralId, institutionId: req.auth!.institutionId } });
  if (!collateral) return res.status(404).json({ error: "Collateral not found" });
  if (collateral.status !== "PLEDGED") return res.status(400).json({ error: `Only PLEDGED collateral can be realised (currently ${collateral.status})` });

  const updated = await prisma.collateral.update({
    where: { id: collateral.id },
    data: { status: "REALISED", realisedAt: new Date(), realisedAmount },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.collateral_realised", resource: "loan", resourceId: collateral.loanId, metadata: { collateralId: collateral.id, realisedAmount } },
  });

  res.json({ collateral: updated });
});
