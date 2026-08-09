// GAP-TEST-001. These are real integration tests against the actual
// Prisma client and a real Postgres database — the whole point of the
// concurrency tests is to prove genuinely simultaneous requests race
// against real database-level locking, which can't be faithfully
// mocked. That means they write real rows.
//
// Safety gate: tests refuse to run at all unless ALLOW_TEST_DB_WRITES=1
// is explicitly set in the environment. This is a deliberate, conscious
// opt-in — not a guess based on what the connection string "looks like"
// — because there's no reliable way to infer from DATABASE_URL alone
// whether it points at production. Set a dedicated test database and
// export ALLOW_TEST_DB_WRITES=1 pointing at it before running `npm test`.
// Every fixture created here is tagged with a TEST_RUN_ID prefix and
// cleaned up in afterEach/afterAll, but a crash mid-run could still
// leave orphaned rows — run against a real production database at your
// own risk, this file will not stop you if you set the flag.
import { prisma } from "../src/lib/prisma";
import { randomUUID } from "crypto";

if (process.env.ALLOW_TEST_DB_WRITES !== "1") {
  throw new Error(
    "Refusing to run: these are real integration tests that write to whatever database DATABASE_URL points at. " +
      "Set ALLOW_TEST_DB_WRITES=1 explicitly (after confirming DATABASE_URL points at a real TEST database, not production) to proceed."
  );
}

export const TEST_RUN_ID = randomUUID().slice(0, 8);

export async function createTestInstitution() {
  return prisma.institution.create({
    data: {
      legalName: `TEST_${TEST_RUN_ID}_Institution`,
      type: "MICROFINANCE_INSTITUTION",
      status: "ACTIVE",
    },
  });
}

export async function createTestUser(institutionId: string, email?: string) {
  return prisma.user.create({
    data: {
      institutionId,
      fullName: `TEST_${TEST_RUN_ID}_User`,
      email: email || `test-${TEST_RUN_ID}-${randomUUID().slice(0, 6)}@example.invalid`,
      passwordHash: "not-a-real-hash-tests-do-not-log-in",
      status: "ACTIVE",
    },
  });
}

export async function createTestBranch(institutionId: string) {
  return prisma.branch.create({
    data: { institutionId, name: `TEST_${TEST_RUN_ID}_Branch`, code: `T${TEST_RUN_ID}`.slice(0, 10) },
  });
}

export async function createTestCustomer(institutionId: string, branchId: string) {
  return prisma.customer.create({
    data: {
      institutionId,
      branchId,
      fullName: `TEST_${TEST_RUN_ID}_Customer`,
      phone: `0${Math.floor(100000000 + Math.random() * 899999999)}`,
      segment: "INDIVIDUAL",
      status: "ACTIVE",
      kycStatus: "VERIFIED",
    },
  });
}

// Deletes everything this test run created, in FK-safe order. Scoped
// strictly to rows tagged with this run's institutionId — never a blind
// table-wide delete.
export async function cleanupTestInstitution(institutionId: string) {
  await prisma.savingsTransaction.deleteMany({ where: { account: { institutionId } } });
  await prisma.savingsAccount.deleteMany({ where: { institutionId } });
  await prisma.loanRepayment.deleteMany({ where: { loan: { institutionId } } });
  await prisma.loanInstallment.deleteMany({ where: { loan: { institutionId } } });
  await prisma.loan.deleteMany({ where: { institutionId } });
  await prisma.approvalRequest.deleteMany({ where: { institutionId } });
  await prisma.auditLog.deleteMany({ where: { institutionId } });
  await prisma.customer.deleteMany({ where: { institutionId } });
  await prisma.user.deleteMany({ where: { institutionId } });
  await prisma.branch.deleteMany({ where: { institutionId } });
  await prisma.institution.delete({ where: { id: institutionId } });
}
