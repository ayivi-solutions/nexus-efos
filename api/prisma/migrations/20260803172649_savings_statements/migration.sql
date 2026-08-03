-- CreateEnum
CREATE TYPE "nexus"."StandingInstructionType" AS ENUM ('INTERNAL_TRANSFER', 'LOAN_REPAYMENT', 'SCHEDULED_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "nexus"."StandingInstructionFrequency" AS ENUM ('DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "nexus"."StandingInstructionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "nexus"."ExecutionStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "nexus"."standing_instruction" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "type" "nexus"."StandingInstructionType" NOT NULL,
    "source_account_id" TEXT NOT NULL,
    "destination_account_id" TEXT,
    "destination_loan_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "nexus"."StandingInstructionFrequency" NOT NULL,
    "next_execution_date" TIMESTAMP(3) NOT NULL,
    "status" "nexus"."StandingInstructionStatus" NOT NULL DEFAULT 'ACTIVE',
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_standing_instruction" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."standing_instruction_execution" (
    "id" TEXT NOT NULL,
    "instruction_id" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "nexus"."ExecutionStatus" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "failure_reason" TEXT,

    CONSTRAINT "pk_si_execution" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_statement" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "opening_balance" DECIMAL(14,2) NOT NULL,
    "closing_balance" DECIMAL(14,2) NOT NULL,
    "total_interest" DECIMAL(14,2) NOT NULL,
    "total_fees" DECIMAL(14,2) NOT NULL,
    "transaction_snapshot" JSONB NOT NULL,
    "generated_by_id" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_savings_statement" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."standing_instruction" ADD CONSTRAINT "fk_standing_instruction_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."standing_instruction_execution" ADD CONSTRAINT "fk_si_execution_instruction" FOREIGN KEY ("instruction_id") REFERENCES "nexus"."standing_instruction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_statement" ADD CONSTRAINT "fk_savings_statement_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_statement" ADD CONSTRAINT "fk_savings_statement_account" FOREIGN KEY ("account_id") REFERENCES "nexus"."savings_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
