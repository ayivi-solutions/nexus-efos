-- CreateEnum
CREATE TYPE "nexus"."FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "nexus"."FinancialPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'FINANCIAL_PERIOD_REOPEN';

-- AlterTable
ALTER TABLE "nexus"."journal" ADD COLUMN     "posting_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rejection_reason" TEXT;

-- CreateTable
CREATE TABLE "nexus"."fiscal_year" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "nexus"."FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_fiscal_year" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."financial_period" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "nexus"."FinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "reopened_by_id" TEXT,
    "reopened_at" TIMESTAMP(3),
    "locked_by_id" TEXT,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_financial_period" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_fiscal_year_institution_name" ON "nexus"."fiscal_year"("institution_id", "name");

-- AddForeignKey
ALTER TABLE "nexus"."fiscal_year" ADD CONSTRAINT "fk_fiscal_year_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."financial_period" ADD CONSTRAINT "fk_financial_period_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."financial_period" ADD CONSTRAINT "fk_financial_period_fiscal_year" FOREIGN KEY ("fiscal_year_id") REFERENCES "nexus"."fiscal_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
