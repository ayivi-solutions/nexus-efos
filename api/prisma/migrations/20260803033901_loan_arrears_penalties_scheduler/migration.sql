-- CreateEnum
CREATE TYPE "nexus"."ArrearsClassification" AS ENUM ('CURRENT', 'ARREARS_1_30', 'ARREARS_31_60', 'ARREARS_61_90', 'ARREARS_90_PLUS');

-- CreateEnum
CREATE TYPE "nexus"."PromiseToPayStatus" AS ENUM ('PENDING', 'KEPT', 'BROKEN');

-- CreateEnum
CREATE TYPE "nexus"."LoanPenaltyCalculationMethod" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "nexus"."LoanPenaltyStatus" AS ENUM ('APPLIED', 'WAIVED', 'REVERSED');

-- AlterTable
ALTER TABLE "nexus"."loan" ADD COLUMN     "arrears_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "arrears_classification" "nexus"."ArrearsClassification" NOT NULL DEFAULT 'CURRENT',
ADD COLUMN     "assigned_collector_id" TEXT,
ADD COLUMN     "days_in_arrears" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_arrears_check_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "nexus"."promise_to_pay" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "promised_amount" DECIMAL(14,2) NOT NULL,
    "promised_date" TIMESTAMP(3) NOT NULL,
    "status" "nexus"."PromiseToPayStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_promise_to_pay" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."loan_penalty" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "installment_id" TEXT,
    "calculation_method" "nexus"."LoanPenaltyCalculationMethod" NOT NULL,
    "rate_or_amount" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "nexus"."LoanPenaltyStatus" NOT NULL DEFAULT 'APPLIED',
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waived_by_id" TEXT,
    "waived_at" TIMESTAMP(3),
    "waived_reason" TEXT,

    CONSTRAINT "pk_loan_penalty" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."promise_to_pay" ADD CONSTRAINT "fk_promise_to_pay_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."promise_to_pay" ADD CONSTRAINT "fk_promise_to_pay_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan_penalty" ADD CONSTRAINT "fk_loan_penalty_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan_penalty" ADD CONSTRAINT "fk_loan_penalty_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
