import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

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

function generateAccountNumber() {
  return "SA" + Date.now().toString().slice(-10);
}

const openSchema = z.object({ customerId: z.string(), branchId: z.string().optional() });

savingsRouter.post("/", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.create({
    data: {
      institutionId: req.auth!.institutionId,
      accountNumber: generateAccountNumber(),
      ...parsed.data,
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

  res.status(201).json({ account });
});

const txnSchema = z.object({ amount: z.number().positive() });

savingsRouter.post("/:id/deposit", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = txnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const newBalance = Number(account.balance) + parsed.data.amount;

  const [updated, txn] = await prisma.$transaction([
    prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance } }),
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

  const newBalance = Number(account.balance) - parsed.data.amount;

  const [updated, txn] = await prisma.$transaction([
    prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance } }),
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

  res.status(201).json({ account: updated, transaction: txn });
});
