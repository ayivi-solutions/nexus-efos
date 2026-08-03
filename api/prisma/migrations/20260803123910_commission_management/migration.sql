-- CreateEnum
CREATE TYPE "nexus"."CommissionType" AS ENUM ('PERCENTAGE_OF_COLLECTIONS', 'FIXED_PER_COLLECTION');

-- CreateEnum
CREATE TYPE "nexus"."CommissionStatus" AS ENUM ('PENDING', 'PENDING_APPROVAL', 'PAID');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'COMMISSION_PAYMENT';

-- CreateTable
CREATE TABLE "nexus"."commission_structure" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "nexus"."CommissionType" NOT NULL,
    "rate" DECIMAL(6,3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_commission_structure" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."commission_record" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "collector_id" TEXT NOT NULL,
    "structure_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_collected" DECIMAL(14,2) NOT NULL,
    "collection_count" INTEGER NOT NULL,
    "commission_amount" DECIMAL(14,2) NOT NULL,
    "status" "nexus"."CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_commission_record" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."commission_structure" ADD CONSTRAINT "fk_commission_structure_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."commission_record" ADD CONSTRAINT "fk_commission_record_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
