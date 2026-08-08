-- CreateEnum
CREATE TYPE "nexus"."AuditEngagementType" AS ENUM ('INTERNAL', 'EXTERNAL', 'REGULATORY', 'IT', 'FINANCIAL');

-- CreateEnum
CREATE TYPE "nexus"."AuditEngagementStatus" AS ENUM ('PLANNED', 'APPROVED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED', 'FOLLOW_UP', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "nexus"."AuditRating" AS ENUM ('SATISFACTORY', 'NEEDS_IMPROVEMENT', 'UNSATISFACTORY');

-- CreateEnum
CREATE TYPE "nexus"."AuditFindingRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "nexus"."AuditFindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFIED', 'CLOSED');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'AUDIT_ENGAGEMENT_APPROVAL';

-- CreateTable
CREATE TABLE "nexus"."audit_engagement" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "audit_number" TEXT NOT NULL,
    "type" "nexus"."AuditEngagementType" NOT NULL,
    "lead_auditor" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "nexus"."AuditEngagementStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_start_date" TIMESTAMP(3) NOT NULL,
    "completion_date" TIMESTAMP(3),
    "rating" "nexus"."AuditRating",
    "raised_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_audit_engagement" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."audit_finding" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "engagement_id" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "risk_classification" "nexus"."AuditFindingRisk" NOT NULL,
    "root_cause_analysis" TEXT,
    "recommendation" TEXT NOT NULL,
    "management_response" TEXT,
    "action_owner_id" TEXT,
    "target_remediation_date" TIMESTAMP(3),
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "status" "nexus"."AuditFindingStatus" NOT NULL DEFAULT 'OPEN',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "raised_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_audit_finding" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_engagement_audit_number_key" ON "nexus"."audit_engagement"("audit_number");

-- CreateIndex
CREATE INDEX "idx_audit_engagement_institution_status" ON "nexus"."audit_engagement"("institution_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_finding_reference_number_key" ON "nexus"."audit_finding"("reference_number");

-- CreateIndex
CREATE INDEX "idx_audit_finding_institution_status" ON "nexus"."audit_finding"("institution_id", "status");

-- AddForeignKey
ALTER TABLE "nexus"."audit_engagement" ADD CONSTRAINT "fk_audit_engagement_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."audit_engagement" ADD CONSTRAINT "fk_audit_engagement_branch" FOREIGN KEY ("branch_id") REFERENCES "nexus"."branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."audit_finding" ADD CONSTRAINT "fk_audit_finding_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."audit_finding" ADD CONSTRAINT "fk_audit_finding_engagement" FOREIGN KEY ("engagement_id") REFERENCES "nexus"."audit_engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."audit_finding" ADD CONSTRAINT "fk_audit_finding_action_owner" FOREIGN KEY ("action_owner_id") REFERENCES "nexus"."employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
