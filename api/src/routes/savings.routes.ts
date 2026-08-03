import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { generateAccountNumber } from "../lib/accountNumber";
import { matchRules, executeMatchedRules } from "../lib/businessRules";
import { nextExecutionDate } from "../lib/standingInstructions";
import { runStandingInstructions } from "../lib/scheduler";
import { generateStatementPdf } from "../lib/savingsStatementPdf";

export const savingsRouter = Router();
savingsRouter.use(requireAuth);

savingsRouter.get("/", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const accounts = await prisma.savingsAccount.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { customer: { select: { fullName: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ accounts });
});

savingsRouter.get("/:id", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const account = await prisma.savingsAccount.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
      branch: { select: { name: true } },
      transactions: { orderBy: { createdAt: "desc" } },
      accountHolders: { where: { deletedAt: null }, include: { customer: { select: { id: true, fullName: true, phone: true } } }, orderBy: { createdAt: "asc" } },
      productVersion: true,
    },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });
  res.json({ account });
});

const addHolderSchema = z.object({
  customerId: z.string(),
  role: z.enum(["JOINT", "AUTHORISED_SIGNATORY", "GUARDIAN", "NOMINEE", "POWER_OF_ATTORNEY", "CORPORATE_REPRESENTATIVE"]),
});

// doc §36.4 "Ownership changes require approval" — same as loans.
savingsRouter.post("/:id/holders", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const parsed = addHolderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (parsed.data.customerId === account.customerId) {
    return res.status(400).json({ error: "This customer is already the primary holder" });
  }
  const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, institutionId: req.auth!.institutionId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const approval = await prisma.approvalRequest.create({
    data: {
      institutionId: req.auth!.institutionId,
      type: "ACCOUNT_HOLDER_ADD",
      targetType: "SavingsAccount",
      targetId: account.id,
      payload: { customerId: parsed.data.customerId, role: parsed.data.role, savingsAccountId: account.id },
      reason: `Add ${parsed.data.role} holder to savings account`,
      requestedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.holder_add_requested", resource: "savings_account", resourceId: account.id, metadata: { customerId: parsed.data.customerId, role: parsed.data.role, approvalRequestId: approval.id } },
  });

  res.status(202).json({ pendingApproval: true, approvalRequestId: approval.id });
});

savingsRouter.delete("/:id/holders/:holderId", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const account = await prisma.savingsAccount.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!account) return res.status(404).json({ error: "Account not found" });

  // PDDS Phase 3 — soft-delete, not a real delete
  await prisma.accountHolder.updateMany({ where: { id: req.params.holderId, savingsAccountId: account.id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.holder_remove", resource: "savings_account", resourceId: account.id, metadata: { holderId: req.params.holderId } },
  });
  res.status(204).send();
});

savingsRouter.post("/:id/close", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const account = await prisma.savingsAccount.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (Number(account.balance) !== 0) return res.status(400).json({ error: "Account balance must be zero before closing" });

  await prisma.savingsAccount.update({ where: { id: account.id }, data: { status: "CLOSED" } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.close", resource: "savings_account", resourceId: account.id },
  });
  res.json({ ok: true });
});

savingsRouter.post("/:id/reactivate", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const account = await prisma.savingsAccount.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "ACTIVE" },
  });
  if (account.count === 0) return res.status(404).json({ error: "Account not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.reactivate", resource: "savings_account", resourceId: req.params.id },
  });
  res.json({ ok: true });
});

const openSchema = z.object({ customerId: z.string(), productVersionId: z.string(), branchId: z.string().optional() });

savingsRouter.post("/", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.findFirst({
    where: { id: parsed.data.customerId, institutionId: req.auth!.institutionId },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  if (customer.status !== "ACTIVE") {
    return res.status(400).json({ error: `Customer must be ACTIVE to open a savings account (currently ${customer.status})` });
  }

  const productVersion = await prisma.productVersion.findFirst({
    where: { id: parsed.data.productVersionId },
    include: { product: true },
  });
  if (!productVersion || productVersion.product.institutionId !== req.auth!.institutionId || productVersion.product.type !== "SAVINGS") {
    return res.status(404).json({ error: "Savings product not found" });
  }
  if (productVersion.product.status !== "ACTIVE") {
    return res.status(400).json({ error: "This savings product is not currently active" });
  }

  // doc §52.4 Promotional Interest Rates — applied to this account instance
  // at opening from the product's promo configuration, so each account's
  // promo window runs from ITS OWN opening date, not a shared calendar date.
  const promoFields =
    productVersion.interestRateType === "PROMOTIONAL" && productVersion.promoInterestRate && productVersion.promoDurationDays
      ? {
          promoInterestRate: productVersion.promoInterestRate,
          promoExpiresAt: new Date(Date.now() + productVersion.promoDurationDays * 24 * 60 * 60 * 1000),
        }
      : {};

  // doc §41 — checked BEFORE the account is created: this is a "check
  // first" trigger point (see lib/businessRules.ts's header comment for
  // why), so a REJECT action here blocks opening the account entirely
  // rather than creating one and marking it rejected after the fact.
  const ruleContext = { productCode: productVersion.product.code, customer };
  const matched = await matchRules(prisma, req.auth!.institutionId, "SAVINGS_ACCOUNT_OPENING", ruleContext);
  const blockingRule = matched.find((m) => m.hasReject);
  if (blockingRule) {
    return res.status(400).json({ error: `Account opening blocked by business rule ${blockingRule.rule.ruleCode}: ${blockingRule.rule.name}` });
  }

  const account = await prisma.savingsAccount.create({
    data: {
      institutionId: req.auth!.institutionId,
      accountNumber: generateAccountNumber(),
      customerId: parsed.data.customerId,
      branchId: parsed.data.branchId,
      productVersionId: productVersion.id,
      ...promoFields,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "savings.open_account",
      resource: "savings_account",
      resourceId: account.id,
    },
  });

  const ruleWarnings = await executeMatchedRules(prisma, req.auth!.institutionId, req.auth!.userId, "SavingsAccount", account.id, matched);

  res.status(201).json({ account, ruleWarnings });
});

const txnSchema = z.object({ amount: z.number().positive() });

// Both deposit and withdraw were missing audit log entries entirely — every
// other mutating action in the app logs, these two didn't. Also neither was
// keeping ledgerBalance in sync with balance (only balance was updated),
// silently drifting the two apart despite ledgerBalance being added
// specifically to stay mirrored with balance until a real Holds feature
// exists. Both found via a live smoke test's audit-log completeness check.
// doc §54.4 "Restricted accounts behave according to configured rules" —
// checked before every deposit/withdraw, not just displayed in the UI.
async function checkRestriction(accountId: string, direction: "DEBIT" | "CREDIT"): Promise<string | null> {
  const active = await prisma.savingsRestriction.findMany({ where: { accountId, status: "ACTIVE" } });
  for (const r of active) {
    if (r.type === "FULL_FREEZE") return `Account is fully frozen: ${r.reason}`;
    if (direction === "DEBIT" && r.type === "DEBIT_RESTRICTION") return `Withdrawals are restricted: ${r.reason}`;
    if (direction === "CREDIT" && r.type === "CREDIT_RESTRICTION") return `Deposits are restricted: ${r.reason}`;
  }
  return null;
}

savingsRouter.post("/:id/deposit", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = txnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const restrictionError = await checkRestriction(account.id, "CREDIT");
  if (restrictionError) return res.status(400).json({ error: restrictionError });

  const newBalance = Number(account.balance) + parsed.data.amount;

  const [updated, txn] = await prisma.$transaction([
    prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance, ledgerBalance: newBalance } }),
    prisma.savingsTransaction.create({
      data: {
        accountId: account.id,
        type: "DEPOSIT",
        amount: parsed.data.amount,
        balanceAfter: newBalance,
        recordedById: req.auth!.userId,
      },
    }),
  ]);

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.deposit", resource: "savings_account", resourceId: account.id, metadata: { amount: parsed.data.amount } },
  });

  res.status(201).json({ account: updated, transaction: txn });
});

savingsRouter.post("/:id/withdraw", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const parsed = txnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (Number(account.balance) < parsed.data.amount) {
    return res.status(400).json({ error: "Insufficient balance" });
  }
  const restrictionError = await checkRestriction(account.id, "DEBIT");
  if (restrictionError) return res.status(400).json({ error: restrictionError });

  const newBalance = Number(account.balance) - parsed.data.amount;

  const [updated, txn] = await prisma.$transaction([
    prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance, ledgerBalance: newBalance } }),
    prisma.savingsTransaction.create({
      data: {
        accountId: account.id,
        type: "WITHDRAWAL",
        amount: parsed.data.amount,
        balanceAfter: newBalance,
        recordedById: req.auth!.userId,
      },
    }),
  ]);

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.withdraw", resource: "savings_account", resourceId: account.id, metadata: { amount: parsed.data.amount } },
  });

  res.status(201).json({ account: updated, transaction: txn });
});

// =========================================================================
// doc §53 Savings Fees and Charges
// =========================================================================

const feeTypeSchema = z.object({ name: z.string().min(1), category: z.string(), calculationMethod: z.enum(["FIXED", "PERCENTAGE"]), amount: z.number().positive(), productVersionId: z.string().optional() });

savingsRouter.get("/fee-types", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const feeTypes = await prisma.savingsFeeType.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ feeTypes });
});

savingsRouter.post("/fee-types", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = feeTypeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const feeType = await prisma.savingsFeeType.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } as any });
  res.status(201).json({ feeType });
});

savingsRouter.get("/:id/fee-charges", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const charges = await prisma.savingsFeeCharge.findMany({ where: { accountId: req.params.id }, include: { feeType: true }, orderBy: { appliedAt: "desc" } });
  res.json({ charges });
});

const applyFeeSchema = z.object({ feeTypeId: z.string() });

// §53.4 "Fees are configurable by product" — the amount actually charged
// comes from the fee type's own configuration, never from the request;
// PERCENTAGE fees are computed against the account's real current balance.
savingsRouter.post("/:id/fee-charges", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = applyFeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!account) return res.status(404).json({ error: "Account not found" });
  const feeType = await prisma.savingsFeeType.findFirst({ where: { id: parsed.data.feeTypeId, institutionId: req.auth!.institutionId, active: true } });
  if (!feeType) return res.status(404).json({ error: "Active fee type not found" });

  const amount = feeType.calculationMethod === "FIXED" ? Number(feeType.amount) : Math.round(Number(account.balance) * (Number(feeType.amount) / 100) * 100) / 100;
  const newBalance = Number(account.balance) - amount;

  const [, charge] = await prisma.$transaction([
    prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance, ledgerBalance: newBalance } }),
    prisma.savingsFeeCharge.create({ data: { institutionId: req.auth!.institutionId, accountId: account.id, feeTypeId: feeType.id, amount, appliedById: req.auth!.userId } }),
  ]);
  await prisma.savingsTransaction.create({ data: { accountId: account.id, type: "FEE", amount, balanceAfter: newBalance, recordedById: req.auth!.userId } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.fee_charged", resource: "savings_account", resourceId: account.id, metadata: { feeTypeId: feeType.id, amount } },
  });

  res.status(201).json({ charge });
});

// §53.4 "Fee waivers require authorisation" — a higher tier than applying one.
savingsRouter.post("/fee-charges/:chargeId/waive", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  const charge = await prisma.savingsFeeCharge.findFirst({ where: { id: req.params.chargeId, institutionId: req.auth!.institutionId } });
  if (!charge) return res.status(404).json({ error: "Charge not found" });
  if (charge.status !== "APPLIED") return res.status(400).json({ error: `Only an APPLIED charge can be waived (currently ${charge.status})` });

  const account = await prisma.savingsAccount.findFirst({ where: { id: charge.accountId } });
  if (account) {
    const newBalance = Number(account.balance) + Number(charge.amount);
    await prisma.$transaction([
      prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance, ledgerBalance: newBalance } }),
      prisma.savingsTransaction.create({ data: { accountId: account.id, type: "FEE_REVERSAL", amount: Number(charge.amount), balanceAfter: newBalance, recordedById: req.auth!.userId } }),
    ]);
  }

  const updated = await prisma.savingsFeeCharge.update({ where: { id: charge.id }, data: { status: "WAIVED", waivedById: req.auth!.userId, waivedAt: new Date(), waivedReason: reason } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.fee_waived", resource: "savings_account", resourceId: charge.accountId, metadata: { chargeId: charge.id, reason } },
  });

  res.json({ charge: updated });
});

// =========================================================================
// doc §54 Savings Account Restrictions — creation and removal both route
// through the Approval Workflow.
// =========================================================================

const restrictionSchema = z.object({ type: z.string(), reason: z.string().min(2), expiresAt: z.string().optional() });

savingsRouter.get("/:id/restrictions", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const restrictions = await prisma.savingsRestriction.findMany({ where: { accountId: req.params.id }, orderBy: { createdAt: "desc" } });
  res.json({ restrictions });
});

savingsRouter.post("/:id/restrictions", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = restrictionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const account = await prisma.savingsAccount.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const restriction = await prisma.savingsRestriction.create({
    data: { institutionId: req.auth!.institutionId, accountId: account.id, type: parsed.data.type as any, reason: parsed.data.reason, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined, requestedById: req.auth!.userId },
  });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "SAVINGS_RESTRICTION_CREATE", targetType: "SavingsRestriction", targetId: restriction.id, payload: {}, reason: parsed.data.reason, requestedById: req.auth!.userId },
  });

  res.status(202).json({ pendingApproval: true, restriction });
});

savingsRouter.post("/restrictions/:restrictionId/request-removal", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  const restriction = await prisma.savingsRestriction.findFirst({ where: { id: req.params.restrictionId, institutionId: req.auth!.institutionId } });
  if (!restriction) return res.status(404).json({ error: "Restriction not found" });
  if (restriction.status !== "ACTIVE") return res.status(400).json({ error: `Only an ACTIVE restriction can be removed (currently ${restriction.status})` });

  await prisma.savingsRestriction.update({ where: { id: restriction.id }, data: { removalRequestedById: req.auth!.userId } });
  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "SAVINGS_RESTRICTION_REMOVE", targetType: "SavingsRestriction", targetId: restriction.id, payload: {}, reason: reason || "Restriction removal requested", requestedById: req.auth!.userId },
  });

  res.status(202).json({ pendingApproval: true });
});

// =========================================================================
// doc §58 Standing Instructions
// =========================================================================

const createSISchema = z.object({
  type: z.enum(["INTERNAL_TRANSFER", "LOAN_REPAYMENT", "SCHEDULED_WITHDRAWAL"]),
  sourceAccountId: z.string(),
  destinationAccountId: z.string().optional(),
  destinationLoanId: z.string().optional(),
  amount: z.number().positive(),
  frequency: z.enum(["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"]),
  startDate: z.string(),
});

savingsRouter.get("/standing-instructions", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const instructions = await prisma.standingInstruction.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ instructions });
});

savingsRouter.post("/standing-instructions", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = createSISchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.type === "INTERNAL_TRANSFER" && !parsed.data.destinationAccountId) return res.status(400).json({ error: "destinationAccountId is required for INTERNAL_TRANSFER" });
  if (parsed.data.type === "LOAN_REPAYMENT" && !parsed.data.destinationLoanId) return res.status(400).json({ error: "destinationLoanId is required for LOAN_REPAYMENT" });

  const source = await prisma.savingsAccount.findFirst({ where: { id: parsed.data.sourceAccountId, institutionId: req.auth!.institutionId, status: "ACTIVE" } });
  if (!source) return res.status(404).json({ error: "Source account not found or not ACTIVE — doc §58.5 'execute only on active accounts' applies at creation too" });

  const instruction = await prisma.standingInstruction.create({
    data: {
      institutionId: req.auth!.institutionId, type: parsed.data.type as any, sourceAccountId: parsed.data.sourceAccountId,
      destinationAccountId: parsed.data.destinationAccountId, destinationLoanId: parsed.data.destinationLoanId,
      amount: parsed.data.amount, frequency: parsed.data.frequency as any, nextExecutionDate: new Date(parsed.data.startDate),
      createdById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.standing_instruction_created", resource: "standing_instruction", resourceId: instruction.id },
  });

  res.status(201).json({ instruction });
});

savingsRouter.get("/standing-instructions/:id/executions", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const executions = await prisma.standingInstructionExecution.findMany({ where: { instructionId: req.params.id }, orderBy: { executedAt: "desc" } });
  res.json({ executions });
});

savingsRouter.post("/standing-instructions/:id/suspend", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const updated = await prisma.standingInstruction.updateMany({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, data: { status: "SUSPENDED" } });
  if (updated.count === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

savingsRouter.post("/standing-instructions/:id/reactivate", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const instruction = await prisma.standingInstruction.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!instruction) return res.status(404).json({ error: "Not found" });
  // Reactivating resets the failure counter and moves the next run to
  // today — otherwise a long-suspended instruction would immediately
  // re-fail on an execution date from weeks or months ago.
  const updated = await prisma.standingInstruction.update({
    where: { id: instruction.id },
    data: { status: "ACTIVE", consecutiveFailures: 0, nextExecutionDate: new Date() },
  });
  res.json({ instruction: updated });
});

savingsRouter.post("/standing-instructions/:id/cancel", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const updated = await prisma.standingInstruction.updateMany({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, data: { status: "CANCELLED" } });
  if (updated.count === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// Manual trigger, same pattern as the arrears check — for testing and
// pilot setup without waiting for 01:00.
savingsRouter.post("/standing-instructions/run-now", requirePermission("institution.configure"), async (_req: AuthedRequest, res) => {
  await runStandingInstructions();
  res.json({ ok: true });
});

// =========================================================================
// doc §59 Savings Statements
// =========================================================================
savingsRouter.get("/:id/statements", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const statements = await prisma.savingsStatement.findMany({ where: { accountId: req.params.id }, orderBy: { generatedAt: "desc" } });
  res.json({ statements });
});

const statementSchema = z.object({ periodStart: z.string(), periodEnd: z.string() });

// §59.5 "Statements reflect only posted transactions" — opening balance is
// reconstructed from the real transaction immediately before the period
// (its balanceAfter), never assumed or estimated. Closing balance and
// totals are computed the same honest way from what's actually in the
// database for this exact period.
savingsRouter.post("/:id/statements/generate", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const parsed = statementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    include: { customer: true, productVersion: { include: { product: true } }, institution: true },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const periodStart = new Date(parsed.data.periodStart);
  const periodEnd = new Date(parsed.data.periodEnd);
  periodEnd.setHours(23, 59, 59, 999);

  const priorTxn = await prisma.savingsTransaction.findFirst({
    where: { accountId: account.id, createdAt: { lt: periodStart } },
    orderBy: { createdAt: "desc" },
  });
  const openingBalance = priorTxn ? Number(priorTxn.balanceAfter) : 0;

  const periodTxns = await prisma.savingsTransaction.findMany({
    where: { accountId: account.id, createdAt: { gte: periodStart, lte: periodEnd } },
    orderBy: { createdAt: "asc" },
  });

  const closingBalance = periodTxns.length > 0 ? Number(periodTxns[periodTxns.length - 1].balanceAfter) : openingBalance;
  const totalInterest = periodTxns.filter((t) => t.type === "INTEREST").reduce((s, t) => s + Number(t.amount), 0);
  const totalFees = periodTxns.filter((t) => t.type === "FEE").reduce((s, t) => s + Number(t.amount), 0);

  const transactionSnapshot = periodTxns.map((t) => ({ date: t.createdAt, type: t.type, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter) }));

  const statement = await prisma.savingsStatement.create({
    data: {
      institutionId: req.auth!.institutionId, accountId: account.id, periodStart, periodEnd,
      openingBalance, closingBalance, totalInterest, totalFees,
      transactionSnapshot: transactionSnapshot as any, generatedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.statement_generated", resource: "savings_account", resourceId: account.id, metadata: { statementId: statement.id, periodStart, periodEnd } },
  });

  const pdfBuffer = await generateStatementPdf({
    institution: { legalName: account.institution.legalName, regulatorId: account.institution.regulatorId, phone: account.institution.phone, email: account.institution.email },
    customer: { fullName: account.customer.fullName, phone: account.customer.phone, customerNumber: account.customer.customerNumber },
    account: { accountNumber: account.accountNumber, productName: account.productVersion?.product?.code || "Savings" },
    periodStart, periodEnd, openingBalance, closingBalance, totalInterest, totalFees,
    transactions: transactionSnapshot, generatedAt: statement.generatedAt,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="statement-${account.accountNumber}-${parsed.data.periodStart}.pdf"`);
  res.send(pdfBuffer);
});

// §59.3 "Statement History" — re-download a previously generated
// statement's PDF from its stored snapshot, guaranteed identical to what
// was generated then, even if the account's data has since changed.
savingsRouter.get("/statements/:statementId/download", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const statement = await prisma.savingsStatement.findFirst({
    where: { id: req.params.statementId, institutionId: req.auth!.institutionId },
    include: { account: { include: { customer: true, productVersion: { include: { product: true } }, institution: true } } },
  });
  if (!statement) return res.status(404).json({ error: "Statement not found" });

  const pdfBuffer = await generateStatementPdf({
    institution: { legalName: statement.account.institution.legalName, regulatorId: statement.account.institution.regulatorId, phone: statement.account.institution.phone, email: statement.account.institution.email },
    customer: { fullName: statement.account.customer.fullName, phone: statement.account.customer.phone, customerNumber: statement.account.customer.customerNumber },
    account: { accountNumber: statement.account.accountNumber, productName: statement.account.productVersion?.product?.code || "Savings" },
    periodStart: statement.periodStart, periodEnd: statement.periodEnd,
    openingBalance: Number(statement.openingBalance), closingBalance: Number(statement.closingBalance),
    totalInterest: Number(statement.totalInterest), totalFees: Number(statement.totalFees),
    transactions: statement.transactionSnapshot as any, generatedAt: statement.generatedAt,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="statement-${statement.account.accountNumber}.pdf"`);
  res.send(pdfBuffer);
});
