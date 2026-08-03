-- CreateEnum
CREATE TYPE "nexus"."SavingsFeeCategory" AS ENUM ('ACCOUNT_OPENING', 'MONTHLY_MAINTENANCE', 'WITHDRAWAL', 'DEPOSIT', 'DORMANCY', 'STATEMENT', 'SMS', 'ACCOUNT_CLOSURE', 'PENALTY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "nexus"."FeeCalculationMethod" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "nexus"."FeeChargeStatus" AS ENUM ('APPLIED', 'WAIVED', 'REVERSED');

-- CreateEnum
CREATE TYPE "nexus"."RestrictionType" AS ENUM ('DEBIT_RESTRICTION', 'CREDIT_RESTRICTION', 'FULL_FREEZE', 'COURT_ORDER', 'COMPLIANCE', 'FRAUD_INVESTIGATION', 'DORMANCY', 'CUSTOMER_REQUESTED', 'PRODUCT_RESTRICTION', 'INSTITUTION_DEFINED');

-- CreateEnum
CREATE TYPE "nexus"."RestrictionStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REMOVED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'SAVINGS_RESTRICTION_CREATE';
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'SAVINGS_RESTRICTION_REMOVE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."SavingsTxnType" ADD VALUE 'FEE';
ALTER TYPE "nexus"."SavingsTxnType" ADD VALUE 'FEE_REVERSAL';

-- CreateTable
CREATE TABLE "nexus"."savings_fee_type" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "nexus"."SavingsFeeCategory" NOT NULL,
    "calculation_method" "nexus"."FeeCalculationMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "product_version_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_savings_fee_type" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_fee_charge" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "fee_type_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "nexus"."FeeChargeStatus" NOT NULL DEFAULT 'APPLIED',
    "applied_by_id" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waived_by_id" TEXT,
    "waived_at" TIMESTAMP(3),
    "waived_reason" TEXT,

    CONSTRAINT "pk_savings_fee_charge" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_restriction" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" "nexus"."RestrictionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "nexus"."RestrictionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "activated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "removal_requested_by_id" TEXT,
    "removed_by_id" TEXT,
    "removed_at" TIMESTAMP(3),
    "removal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_savings_restriction" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."savings_fee_type" ADD CONSTRAINT "fk_savings_fee_type_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_fee_charge" ADD CONSTRAINT "fk_savings_fee_charge_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_fee_charge" ADD CONSTRAINT "fk_savings_fee_charge_account" FOREIGN KEY ("account_id") REFERENCES "nexus"."savings_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_fee_charge" ADD CONSTRAINT "fk_savings_fee_charge_type" FOREIGN KEY ("fee_type_id") REFERENCES "nexus"."savings_fee_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_restriction" ADD CONSTRAINT "fk_savings_restriction_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_restriction" ADD CONSTRAINT "fk_savings_restriction_account" FOREIGN KEY ("account_id") REFERENCES "nexus"."savings_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
