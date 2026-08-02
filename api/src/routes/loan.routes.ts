import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { round2, generateSchedule, allocateRepayment } from "../lib/loanSchedule";
import { matchRules, executeMatchedRules } from "../lib/businessRules";

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

  res.json({ loan: updated });
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
