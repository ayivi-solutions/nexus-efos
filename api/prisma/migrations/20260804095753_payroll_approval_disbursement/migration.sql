-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'PAYROLL_RUN_APPROVAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."PayrollRunStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "nexus"."PayrollRunStatus" ADD VALUE 'APPROVED';
ALTER TYPE "nexus"."PayrollRunStatus" ADD VALUE 'PAID';

-- AlterTable
ALTER TABLE "nexus"."employee" ADD COLUMN     "bank_account_name" TEXT,
ADD COLUMN     "bank_account_number" TEXT,
ADD COLUMN     "bank_name" TEXT;

-- AlterTable
ALTER TABLE "nexus"."payroll_run" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "paid_by_id" TEXT,
ADD COLUMN     "reversal_reason" TEXT,
ADD COLUMN     "reversed_at" TIMESTAMP(3),
ADD COLUMN     "reversed_by_id" TEXT;
