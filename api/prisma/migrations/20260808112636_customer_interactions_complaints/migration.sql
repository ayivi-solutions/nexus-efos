-- CreateEnum
CREATE TYPE "nexus"."InteractionChannel" AS ENUM ('CALL', 'BRANCH_VISIT', 'EMAIL', 'SMS', 'LIVE_CHAT', 'SOCIAL_MEDIA', 'MEETING');

-- CreateEnum
CREATE TYPE "nexus"."ComplaintCategory" AS ENUM ('SERVICE_QUALITY', 'LOAN_TERMS', 'FEES_CHARGES', 'STAFF_CONDUCT', 'TRANSACTION_ERROR', 'FRAUD_SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."ComplaintPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "nexus"."ComplaintStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "nexus"."customer_interaction" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" "nexus"."InteractionChannel" NOT NULL,
    "summary" TEXT NOT NULL,
    "follow_up_scheduled_at" TIMESTAMP(3),
    "follow_up_completed" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_completed_at" TIMESTAMP(3),
    "follow_up_completed_by_id" TEXT,
    "follow_up_notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_customer_interaction" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."customer_complaint" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "category" "nexus"."ComplaintCategory" NOT NULL,
    "priority" "nexus"."ComplaintPriority" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "status" "nexus"."ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to_id" TEXT,
    "sla_target_at" TIMESTAMP(3) NOT NULL,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalated_at" TIMESTAMP(3),
    "investigation_notes" TEXT,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "customer_notified_at" TIMESTAMP(3),
    "raised_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_customer_complaint" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_customer_interaction_institution_customer" ON "nexus"."customer_interaction"("institution_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_complaint_reference_number_key" ON "nexus"."customer_complaint"("reference_number");

-- CreateIndex
CREATE INDEX "idx_customer_complaint_institution_status" ON "nexus"."customer_complaint"("institution_id", "status");

-- AddForeignKey
ALTER TABLE "nexus"."customer_interaction" ADD CONSTRAINT "fk_customer_interaction_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_interaction" ADD CONSTRAINT "fk_customer_interaction_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_complaint" ADD CONSTRAINT "fk_customer_complaint_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_complaint" ADD CONSTRAINT "fk_customer_complaint_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
