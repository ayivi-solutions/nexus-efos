-- CreateEnum
CREATE TYPE "nexus"."BusinessRuleCategory" AS ENUM ('VALIDATION', 'ELIGIBILITY', 'CALCULATION', 'APPROVAL', 'COMPLIANCE', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "nexus"."BusinessRuleStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "nexus"."BusinessRuleTriggerPoint" AS ENUM ('LOAN_INITIATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'BUSINESS_RULE_ACTIVATION';
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'BUSINESS_RULE_TRIGGERED';

-- CreateTable
CREATE TABLE "nexus"."business_rule" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "business_purpose" TEXT,
    "description" TEXT,
    "category" "nexus"."BusinessRuleCategory" NOT NULL,
    "trigger_point" "nexus"."BusinessRuleTriggerPoint" NOT NULL,
    "conditions" JSONB NOT NULL,
    "condition_logic" TEXT NOT NULL DEFAULT 'ALL',
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "effective_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "status" "nexus"."BusinessRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "business_owner_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_business_rule" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."business_rule" ADD CONSTRAINT "fk_business_rule_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
