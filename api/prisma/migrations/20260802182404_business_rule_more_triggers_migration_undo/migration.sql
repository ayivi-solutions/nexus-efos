-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."BusinessRuleTriggerPoint" ADD VALUE 'LOAN_DISBURSEMENT';
ALTER TYPE "nexus"."BusinessRuleTriggerPoint" ADD VALUE 'EMPLOYEE_ONBOARDING';

-- AlterEnum
ALTER TYPE "nexus"."ImportBatchStatus" ADD VALUE 'REVERSED';
