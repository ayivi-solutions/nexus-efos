-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'LOAN_RESTRUCTURE';
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'LOAN_RESCHEDULE';
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'LOAN_WRITE_OFF';

-- AlterEnum
ALTER TYPE "nexus"."LoanStatus" ADD VALUE 'WRITTEN_OFF';

-- CreateTable
CREATE TABLE "nexus"."loan_restructure" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "original_principal" DECIMAL(14,2) NOT NULL,
    "original_rate" DECIMAL(6,3) NOT NULL,
    "original_term_months" INTEGER NOT NULL,
    "new_principal" DECIMAL(14,2) NOT NULL,
    "new_rate" DECIMAL(6,3) NOT NULL,
    "new_term_months" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_loan_restructure" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."loan_reschedule" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "shift_days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_loan_reschedule" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."loan_write_off" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "recovered_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requested_by_id" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_loan_write_off" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."loan_restructure" ADD CONSTRAINT "fk_loan_restructure_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan_reschedule" ADD CONSTRAINT "fk_loan_reschedule_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan_write_off" ADD CONSTRAINT "fk_loan_write_off_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
