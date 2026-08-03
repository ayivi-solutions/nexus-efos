-- CreateEnum
CREATE TYPE "nexus"."SettlementStatus" AS ENUM ('PENDING', 'RECONCILED', 'VARIANCE_PENDING_APPROVAL');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'COLLECTION_VARIANCE_ADJUSTMENT';

-- CreateTable
CREATE TABLE "nexus"."collection_settlement" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "collector_id" TEXT NOT NULL,
    "settlement_date" TIMESTAMP(3) NOT NULL,
    "expected_amount" DECIMAL(14,2) NOT NULL,
    "actual_amount" DECIMAL(14,2) NOT NULL,
    "variance" DECIMAL(14,2) NOT NULL,
    "status" "nexus"."SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reconciled_by_id" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_collection_settlement" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_settlement_collector_date" ON "nexus"."collection_settlement"("collector_id", "settlement_date");

-- AddForeignKey
ALTER TABLE "nexus"."collection_settlement" ADD CONSTRAINT "fk_collection_settlement_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
