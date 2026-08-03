-- CreateEnum
CREATE TYPE "nexus"."CashBalancingStatus" AS ENUM ('RECONCILED', 'VARIANCE_PENDING_APPROVAL');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'CASH_BALANCING_VARIANCE';

-- CreateTable
CREATE TABLE "nexus"."cash_balancing" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "holderType" "nexus"."CashHolderType" NOT NULL,
    "holder_id" TEXT NOT NULL,
    "balancing_date" TIMESTAMP(3) NOT NULL,
    "expected_amount" DECIMAL(14,2) NOT NULL,
    "counted_amount" DECIMAL(14,2) NOT NULL,
    "variance" DECIMAL(14,2) NOT NULL,
    "status" "nexus"."CashBalancingStatus" NOT NULL DEFAULT 'RECONCILED',
    "investigation_notes" TEXT,
    "reconciled_by_id" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_cash_balancing" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_cash_balancing_holder_date" ON "nexus"."cash_balancing"("holderType", "holder_id", "balancing_date");

-- AddForeignKey
ALTER TABLE "nexus"."cash_balancing" ADD CONSTRAINT "fk_cash_balancing_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
