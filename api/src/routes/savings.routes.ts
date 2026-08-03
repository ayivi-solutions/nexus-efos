import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { generateAccountNumber } from "../lib/accountNumber";
import { matchRules, executeMatchedRules } from "../lib/businessRules";

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
