import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const loanRouter = Router();
loanRouter.use(requireAuth);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

type ScheduleRow = { installmentNumber: number; dueDate: Date; principalDue: number; interestDue: number };

function generateSchedule(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  method: string,
  startDate: Date
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];

  if (method === "REDUCING_BALANCE") {
    const monthlyRate = annualRatePct / 100 / 12;
    let balance = principal;
    const payment =
      monthlyRate === 0
        ? principal / termMonths
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);

    for (let i = 1; i <= termMonths; i++) {
      const interestDue = monthlyRate === 0 ? 0 : balance * monthlyRate;
      let principalDue = payment - interestDue;
      if (i === termMonths) principalDue = balance;
      balance -= principalDue;

      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      rows.push({ installmentNumber: i, dueDate, principalDue: round2(principalDue), interestDue: round2(interestDue) });
    }
  } else {
    const totalInterest = principal * (annualRatePct / 100) * (termMonths / 12);
    const principalPerInstallment = principal / termMonths;
    const interestPerInstallment = totalInterest / termMonths;

    for (let i = 1; i <= termMonths; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      rows.push({
        installmentNumber: i,
        dueDate,
        principalDue: round2(principalPerInstallment),
        interestDue: round2(interestPerInstallment),
      });
    }
  }

  return rows;
}

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
      accountHolders: { include: { customer: { select: { id: true, fullName: true, phone: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  res.json({ loan });
});

const addHolderSchema = z.object({
  customerId: z.string(),
  role: z.enum(["JOINT", "AUTHORISED_SIGNATORY", "GUARDIAN", "NOMINEE", "POWER_OF_ATTORNEY", "CORPORATE_REPRESENTATIVE"]),
});

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

  const holder = await prisma.accountHolder.create({
    data: { institutionId: req.auth!.institutionId, customerId: parsed.data.customerId, role: parsed.data.role, loanId: loan.id, addedById: req.auth!.userId },
    include: { customer: { select: { id: true, fullName: true, phone: true } } },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "loan.holder_add", resource: "loan", resourceId: loan.id, metadata: { customerId: parsed.data.customerId, role: parsed.data.role } },
  });

  res.status(201).json({ holder });
});

loanRouter.delete("/:id/holders/:holderId", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  await prisma.accountHolder.deleteMany({ where: { id: req.params.holderId, loanId: loan.id } });
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

  res.status(201).json({ loan });
});

loanRouter.post("/:id/approve", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  if (loan.initiatedById === req.auth!.userId) {
    return res.status(403).json({ error: "Segregation of duties: cannot approve a loan you initiated" });
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

  res.json({ loan: updated });
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

  let remaining = parsed.data.amount;
  for (const inst of loan.installments) {
    if (remaining <= 0) break;
    const interestOutstanding = Number(inst.interestDue) - Number(inst.interestPaid);
    const principalOutstanding = Number(inst.principalDue) - Number(inst.principalPaid);
    if (interestOutstanding <= 0.005 && principalOutstanding <= 0.005) continue;

    let interestPaidNow = 0;
    let principalPaidNow = 0;
    if (interestOutstanding > 0.005) {
      interestPaidNow = Math.min(remaining, interestOutstanding);
      remaining -= interestPaidNow;
    }
    if (remaining > 0 && principalOutstanding > 0.005) {
      principalPaidNow = Math.min(remaining, principalOutstanding);
      remaining -= principalPaidNow;
    }
    if (interestPaidNow > 0 || principalPaidNow > 0) {
      const newInterestPaid = round2(Number(inst.interestPaid) + interestPaidNow);
      const newPrincipalPaid = round2(Number(inst.principalPaid) + principalPaidNow);
      const fullyPaid = newInterestPaid >= Number(inst.interestDue) - 0.01 && newPrincipalPaid >= Number(inst.principalDue) - 0.01;
      await prisma.loanInstallment.update({
        where: { id: inst.id },
        data: { interestPaid: newInterestPaid, principalPaid: newPrincipalPaid, status: fullyPaid ? "PAID" : "PARTIALLY_PAID" },
      });
    }
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
