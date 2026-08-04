-- CreateEnum
CREATE TYPE "nexus"."FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "nexus"."FinancialPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "nexus"."RecurringJournalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'FINANCIAL_PERIOD_REOPEN';
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'RECURRING_JOURNAL_ACTIVATION';

-- AlterEnum
ALTER TYPE "nexus"."StandingInstructionFrequency" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "nexus"."journal" ADD COLUMN     "posting_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rejection_reason" TEXT;

-- AlterTable
ALTER TABLE "nexus"."standing_instruction" ADD COLUMN     "custom_interval_days" INTEGER;

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

-- CreateTable
CREATE TABLE "nexus"."recurring_journal" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "line_template" JSONB NOT NULL,
    "frequency" "nexus"."StandingInstructionFrequency" NOT NULL,
    "custom_interval_days" INTEGER,
    "next_execution_date" TIMESTAMP(3) NOT NULL,
    "status" "nexus"."RecurringJournalStatus" NOT NULL DEFAULT 'DRAFT',
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_recurring_journal" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."recurring_journal_execution" (
    "id" TEXT NOT NULL,
    "recurring_journal_id" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "nexus"."ExecutionStatus" NOT NULL,
    "journal_id" TEXT,
    "failure_reason" TEXT,

    CONSTRAINT "pk_recurring_journal_execution" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_fiscal_year_institution_name" ON "nexus"."fiscal_year"("institution_id", "name");

-- AddForeignKey
ALTER TABLE "nexus"."fiscal_year" ADD CONSTRAINT "fk_fiscal_year_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."financial_period" ADD CONSTRAINT "fk_financial_period_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."financial_period" ADD CONSTRAINT "fk_financial_period_fiscal_year" FOREIGN KEY ("fiscal_year_id") REFERENCES "nexus"."fiscal_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."recurring_journal" ADD CONSTRAINT "fk_recurring_journal_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."recurring_journal_execution" ADD CONSTRAINT "fk_rj_execution_recurring_journal" FOREIGN KEY ("recurring_journal_id") REFERENCES "nexus"."recurring_journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
