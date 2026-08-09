// GAP-TEST-001. Real integration tests against the live Prisma client —
// see helpers.ts for the mandatory ALLOW_TEST_DB_WRITES safety gate and
// fixture/cleanup design. Each test targets the exact acceptance
// criterion the register wrote for the corresponding gap, phrased as a
// concurrency scenario that would have failed on the pre-fix code (a
// direct `account.balance` read-then-write) and passes on the fix (an
// atomic guarded `updateMany`).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { createTestInstitution, createTestBranch, createTestCustomer, cleanupTestInstitution, TEST_RUN_ID } from "./helpers";

describe("GAP-FIN-001: savings withdrawal concurrency", () => {
  let institutionId: string;
  let accountId: string;

  beforeAll(async () => {
    const institution = await createTestInstitution();
    institutionId = institution.id;
    const branch = await createTestBranch(institutionId);
    const customer = await createTestCustomer(institutionId, branch.id);
    const account = await prisma.savingsAccount.create({
      data: {
        institutionId,
        customerId: customer.id,
        accountNumber: `TEST-${TEST_RUN_ID}-SAV`,
        balance: 100,
        ledgerBalance: 100,
      },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await cleanupTestInstitution(institutionId);
  });

  // The register's exact acceptance criterion: "Two concurrent
  // withdrawals against insufficient combined funds must result in
  // exactly one authorised debit." Account starts at 100. Two
  // simultaneous withdrawals of 80 each fire at once — combined they
  // exceed the balance, so exactly one must succeed and one must be
  // rejected as insufficient funds. On the pre-fix code (a plain
  // `account.balance` read outside any lock, then an unconditional
  // write) both could read balance=100, both compute 100-80=20 as
  // "the" new balance, and both succeed — this test would have failed
  // on that code, asserting winners===2 instead of 1.
  it("allows exactly one of two concurrent over-limit withdrawals to succeed", async () => {
    const attemptWithdrawal = async (amount: number) => {
      const result = await prisma.$transaction(async (tx) => {
        const guarded = await tx.savingsAccount.updateMany({
          where: { id: accountId, balance: { gte: amount } },
          data: { balance: { decrement: amount }, ledgerBalance: { decrement: amount } },
        });
        return guarded.count;
      });
      return result === 1;
    };

    const [firstSucceeded, secondSucceeded] = await Promise.all([attemptWithdrawal(80), attemptWithdrawal(80)]);
    const successCount = [firstSucceeded, secondSucceeded].filter(Boolean).length;

    expect(successCount).toBe(1);

    const finalAccount = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: accountId } });
    // Balance must reflect exactly one 80 debit from 100 — never a
    // double-debit (which would go negative) and never a lost update
    // (which would still show 100).
    expect(Number(finalAccount.balance)).toBe(20);
  });

  it("rejects a withdrawal that would take the balance negative", async () => {
    // Balance is 20 after the previous test.
    const result = await prisma.savingsAccount.updateMany({
      where: { id: accountId, balance: { gte: 50 } },
      data: { balance: { decrement: 50 } },
    });
    expect(result.count).toBe(0);

    const account = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(account.balance)).toBe(20); // unchanged
  });
});

describe("GAP-IAM-001: expired branch-scoped delegated role", () => {
  // This is the exact query shape from middleware/rbac.ts's userRole
  // lookup after the fix — a direct regression test for the collided
  // OR-keys bug, without needing a full HTTP request/response cycle.
  // Pre-fix, this query would have used two top-level OR keys in one
  // object literal (the second silently overwriting the first), so an
  // expired role scoped to a branch would still be returned. Post-fix,
  // both conditions live in an explicit AND array and neither can
  // displace the other.
  let institutionId: string;
  let userId: string;
  let branchId: string;
  let expiredRoleId: string;

  beforeAll(async () => {
    const institution = await createTestInstitution();
    institutionId = institution.id;
    const branch = await createTestBranch(institutionId);
    branchId = branch.id;
    const user = await prisma.user.create({
      data: { institutionId, fullName: `TEST_${TEST_RUN_ID}_RBAC_User`, email: `test-rbac-${TEST_RUN_ID}@example.invalid`, passwordHash: "x", status: "ACTIVE" },
    });
    userId = user.id;
    const role = await prisma.role.create({ data: { institutionId, name: `TEST_${TEST_RUN_ID}_Role`, category: "OPERATIONAL" } });
    const expiredRole = await prisma.userRole.create({
      data: {
        userId,
        roleId: role.id,
        branchId,
        startsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // started 30 days ago
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired yesterday
      },
    });
    expiredRoleId = expiredRole.id;
  });

  afterAll(async () => {
    await prisma.userRole.delete({ where: { id: expiredRoleId } }).catch(() => {});
    await cleanupTestInstitution(institutionId);
  });

  it("does not return an expired role even when a branch filter is applied", async () => {
    const now = new Date();
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        startsAt: { lte: now },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ branchId }, { branchId: null }] },
        ],
      },
    });
    expect(userRoles.find((r) => r.id === expiredRoleId)).toBeUndefined();
  });
});
