-- CreateEnum
CREATE TYPE "nexus"."CashTransferStatus" AS ENUM ('PENDING_APPROVAL', 'COMPLETED', 'REJECTED');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'CASH_TRANSFER';

-- CreateTable
CREATE TABLE "nexus"."cash_transfer" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "from_type" "nexus"."CashHolderType" NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_type" "nexus"."CashHolderType" NOT NULL,
    "to_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "status" "nexus"."CashTransferStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_cash_transfer" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."cash_transfer" ADD CONSTRAINT "fk_cash_transfer_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
