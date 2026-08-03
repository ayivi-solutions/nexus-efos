/*
  Warnings:

  - The values [FINANCIAL_PERIOD_REOPEN] on the enum `ApprovalRequestType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `posting_date` on the `journal` table. All the data in the column will be lost.
  - You are about to drop the column `rejection_reason` on the `journal` table. All the data in the column will be lost.
  - You are about to drop the `financial_period` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fiscal_year` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "nexus"."ApprovalRequestType_new" AS ENUM ('CUSTOMER_STATUS_CHANGE', 'CUSTOMER_PROFILE_UPDATE', 'ACCOUNT_HOLDER_ADD', 'PRODUCT_ACTIVATION', 'AML_ADJUDICATION', 'BUSINESS_RULE_ACTIVATION', 'BUSINESS_RULE_TRIGGERED', 'LOAN_RESTRUCTURE', 'LOAN_RESCHEDULE', 'LOAN_WRITE_OFF', 'COLLECTION_VARIANCE_ADJUSTMENT', 'COMMISSION_PAYMENT', 'SAVINGS_RESTRICTION_CREATE', 'SAVINGS_RESTRICTION_REMOVE', 'CASH_TRANSFER', 'CASH_BALANCING_VARIANCE', 'JOURNAL_POSTING');
ALTER TABLE "nexus"."approval_request" ALTER COLUMN "type" TYPE "nexus"."ApprovalRequestType_new" USING ("type"::text::"nexus"."ApprovalRequestType_new");
ALTER TYPE "nexus"."ApprovalRequestType" RENAME TO "ApprovalRequestType_old";
ALTER TYPE "nexus"."ApprovalRequestType_new" RENAME TO "ApprovalRequestType";
DROP TYPE "nexus"."ApprovalRequestType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "nexus"."financial_period" DROP CONSTRAINT "fk_financial_period_fiscal_year";

-- DropForeignKey
ALTER TABLE "nexus"."financial_period" DROP CONSTRAINT "fk_financial_period_institution";

-- DropForeignKey
ALTER TABLE "nexus"."fiscal_year" DROP CONSTRAINT "fk_fiscal_year_institution";

-- AlterTable
ALTER TABLE "nexus"."journal" DROP COLUMN "posting_date",
DROP COLUMN "rejection_reason";

-- DropTable
DROP TABLE "nexus"."financial_period";

-- DropTable
DROP TABLE "nexus"."fiscal_year";

-- DropEnum
DROP TYPE "nexus"."FinancialPeriodStatus";

-- DropEnum
DROP TYPE "nexus"."FiscalYearStatus";
