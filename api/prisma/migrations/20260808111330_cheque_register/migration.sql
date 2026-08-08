-- CreateEnum
CREATE TYPE "nexus"."ChequeDirection" AS ENUM ('INWARD', 'OUTWARD');

-- CreateEnum
CREATE TYPE "nexus"."ChequeStatus" AS ENUM ('RECEIVED', 'ISSUED', 'PENDING_CLEARING', 'CLEARED', 'BOUNCED', 'STOPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "nexus"."cheque" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "direction" "nexus"."ChequeDirection" NOT NULL,
    "cheque_number" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "cheque_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payer_name" TEXT,
    "payee_name" TEXT,
    "status" "nexus"."ChequeStatus" NOT NULL DEFAULT 'RECEIVED',
    "customer_id" TEXT,
    "savings_account_id" TEXT,
    "loan_id" TEXT,
    "clearing_submitted_at" TIMESTAMP(3),
    "cleared_at" TIMESTAMP(3),
    "bounced_at" TIMESTAMP(3),
    "bounce_reason" TEXT,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_cheque" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_cheque_institution_status" ON "nexus"."cheque"("institution_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cheque_institution_number_bank_direction" ON "nexus"."cheque"("institution_id", "cheque_number", "bank_name", "direction");

-- AddForeignKey
ALTER TABLE "nexus"."cheque" ADD CONSTRAINT "fk_cheque_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."cheque" ADD CONSTRAINT "fk_cheque_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."cheque" ADD CONSTRAINT "fk_cheque_savings_account" FOREIGN KEY ("savings_account_id") REFERENCES "nexus"."savings_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."cheque" ADD CONSTRAINT "fk_cheque_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
