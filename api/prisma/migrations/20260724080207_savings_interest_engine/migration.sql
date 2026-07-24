/*
  Warnings:

  - A unique constraint covering the columns `[replacesDocumentId]` on the table `documents` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "nexus"."ClosureReason" AS ENUM ('CUSTOMER_REQUEST', 'DEATH', 'BUSINESS_CLOSURE', 'FRAUD', 'REGULATORY_DIRECTIVE', 'DUPLICATE_MERGE', 'MIGRATION', 'INACTIVITY', 'INSTITUTIONAL_DECISION', 'COURT_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."ApprovalRequestType" AS ENUM ('CUSTOMER_STATUS_CHANGE', 'CUSTOMER_PROFILE_UPDATE', 'ACCOUNT_HOLDER_ADD', 'PRODUCT_ACTIVATION', 'AML_ADJUDICATION');

-- CreateEnum
CREATE TYPE "nexus"."ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."AccountStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "nexus"."AccountStatus" ADD VALUE 'BLACKLISTED';

-- AlterEnum
ALTER TYPE "nexus"."SavingsTxnType" ADD VALUE 'INTEREST';

-- AlterTable
ALTER TABLE "nexus"."customers" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "closureNote" TEXT,
ADD COLUMN     "closureReason" "nexus"."ClosureReason",
ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "marketingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "statementDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "transactionAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "nexus"."documents" ADD COLUMN     "replacesDocumentId" TEXT;

-- AlterTable
ALTER TABLE "nexus"."product_versions" ADD COLUMN     "interestRateType" TEXT NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "promoDurationDays" INTEGER,
ADD COLUMN     "promoInterestRate" DECIMAL(6,3);

-- AlterTable
ALTER TABLE "nexus"."savings_accounts" ADD COLUMN     "interestSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "interestSuspendedAt" TIMESTAMP(3),
ADD COLUMN     "interestSuspendedReason" TEXT,
ADD COLUMN     "lastAccrualDate" TIMESTAMP(3),
ADD COLUMN     "promoExpiresAt" TIMESTAMP(3),
ADD COLUMN     "promoInterestRate" DECIMAL(6,3);

-- CreateTable
CREATE TABLE "nexus"."approval_requests" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "type" "nexus"."ApprovalRequestType" NOT NULL,
    "status" "nexus"."ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."interest_rate_tiers" (
    "id" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "minBalance" DECIMAL(14,2) NOT NULL,
    "maxBalance" DECIMAL(14,2),
    "interestRate" DECIMAL(6,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_rate_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_interest_accruals" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accrualDate" TIMESTAMP(3) NOT NULL,
    "balanceUsed" DECIMAL(14,2) NOT NULL,
    "rateApplied" DECIMAL(6,3) NOT NULL,
    "method" TEXT NOT NULL,
    "amountAccrued" DECIMAL(14,2) NOT NULL,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "postingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_interest_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_interest_postings" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "transactionId" TEXT,
    "batchId" TEXT,
    "postedById" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_interest_postings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "savings_interest_accruals_accountId_accrualDate_key" ON "nexus"."savings_interest_accruals"("accountId", "accrualDate");

-- CreateIndex
CREATE UNIQUE INDEX "documents_replacesDocumentId_key" ON "nexus"."documents"("replacesDocumentId");

-- AddForeignKey
ALTER TABLE "nexus"."approval_requests" ADD CONSTRAINT "approval_requests_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."interest_rate_tiers" ADD CONSTRAINT "interest_rate_tiers_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "nexus"."product_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_interest_accruals" ADD CONSTRAINT "savings_interest_accruals_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_interest_accruals" ADD CONSTRAINT "savings_interest_accruals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "nexus"."savings_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_interest_postings" ADD CONSTRAINT "savings_interest_postings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_interest_postings" ADD CONSTRAINT "savings_interest_postings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "nexus"."savings_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."documents" ADD CONSTRAINT "documents_replacesDocumentId_fkey" FOREIGN KEY ("replacesDocumentId") REFERENCES "nexus"."documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
