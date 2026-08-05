-- CreateEnum
CREATE TYPE "nexus"."ConsentType" AS ENUM ('DATA_PROCESSING', 'MARKETING', 'SMS', 'EMAIL', 'PUSH_NOTIFICATION', 'BIOMETRIC', 'CREDIT_BUREAU', 'INFORMATION_SHARING', 'DIGITAL_SIGNATURE', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."CustomerMergeStatus" AS ENUM ('ACTIVE', 'MERGED');

-- CreateEnum
CREATE TYPE "nexus"."CustomerMergeRecordStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ROLLED_BACK');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'CUSTOMER_MERGE';

-- AlterTable
ALTER TABLE "nexus"."customer" ADD COLUMN     "kyc_risk_score" INTEGER,
ADD COLUMN     "kyc_risk_score_breakdown" JSONB,
ADD COLUMN     "merge_status" "nexus"."CustomerMergeStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "merged_into_customer_id" TEXT;

-- CreateTable
CREATE TABLE "nexus"."customer_consent" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "consent_type" "nexus"."ConsentType" NOT NULL,
    "other_type_label" TEXT,
    "granted" BOOLEAN NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_id" TEXT,
    "document_id" TEXT,
    "captured_by_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_customer_consent" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."customer_merge_record" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "primary_customer_id" TEXT NOT NULL,
    "merged_customer_id" TEXT NOT NULL,
    "similarity_score" INTEGER NOT NULL,
    "matched_fields" JSONB NOT NULL,
    "status" "nexus"."CustomerMergeRecordStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reassigned_records" JSONB,
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "merged_at" TIMESTAMP(3),
    "rolled_back_by_id" TEXT,
    "rolled_back_at" TIMESTAMP(3),
    "rollback_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_customer_merge_record" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."saved_search" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_saved_search" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."customer_consent" ADD CONSTRAINT "fk_customer_consent_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_consent" ADD CONSTRAINT "fk_customer_consent_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_merge_record" ADD CONSTRAINT "fk_customer_merge_record_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_merge_record" ADD CONSTRAINT "fk_customer_merge_primary" FOREIGN KEY ("primary_customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_merge_record" ADD CONSTRAINT "fk_customer_merge_merged" FOREIGN KEY ("merged_customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."saved_search" ADD CONSTRAINT "fk_saved_search_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
