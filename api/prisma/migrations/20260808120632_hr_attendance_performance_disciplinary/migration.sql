-- CreateEnum
CREATE TYPE "nexus"."AttendanceMethod" AS ENUM ('MANUAL', 'REMOTE');

-- CreateEnum
CREATE TYPE "nexus"."PerformanceRating" AS ENUM ('UNSATISFACTORY', 'NEEDS_IMPROVEMENT', 'MEETS_EXPECTATIONS', 'EXCEEDS_EXPECTATIONS', 'OUTSTANDING');

-- CreateEnum
CREATE TYPE "nexus"."PerformanceReviewStatus" AS ENUM ('DRAFT', 'SELF_ASSESSMENT', 'MANAGER_ASSESSMENT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "nexus"."DisciplinaryActionType" AS ENUM ('VERBAL_WARNING', 'WRITTEN_WARNING', 'FINAL_WARNING', 'SUSPENSION', 'TERMINATION');

-- CreateEnum
CREATE TYPE "nexus"."DisciplinaryCaseStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'ATTENDANCE_CORRECTION';

-- CreateTable
CREATE TABLE "nexus"."attendance_record" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" TIMESTAMP(3) NOT NULL,
    "clock_in_at" TIMESTAMP(3) NOT NULL,
    "clock_out_at" TIMESTAMP(3),
    "method" "nexus"."AttendanceMethod" NOT NULL DEFAULT 'MANUAL',
    "correction_pending" BOOLEAN NOT NULL DEFAULT false,
    "proposed_clock_in_at" TIMESTAMP(3),
    "proposed_clock_out_at" TIMESTAMP(3),
    "correction_reason" TEXT,
    "correction_requested_by_id" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_attendance_record" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."performance_review" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "cycle_label" TEXT NOT NULL,
    "goals" TEXT,
    "kpis" JSONB,
    "self_assessment" TEXT,
    "manager_assessment" TEXT,
    "rating" "nexus"."PerformanceRating",
    "development_plan" TEXT,
    "status" "nexus"."PerformanceReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_performance_review" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."disciplinary_case" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "misconduct_description" TEXT NOT NULL,
    "investigation_notes" TEXT,
    "action_taken" "nexus"."DisciplinaryActionType",
    "status" "nexus"."DisciplinaryCaseStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "raised_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_disciplinary_case" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_attendance_record_employee_work_date" ON "nexus"."attendance_record"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "idx_performance_review_institution_employee" ON "nexus"."performance_review"("institution_id", "employee_id");

-- CreateIndex
CREATE INDEX "idx_disciplinary_case_institution_status" ON "nexus"."disciplinary_case"("institution_id", "status");

-- AddForeignKey
ALTER TABLE "nexus"."attendance_record" ADD CONSTRAINT "fk_attendance_record_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."attendance_record" ADD CONSTRAINT "fk_attendance_record_employee" FOREIGN KEY ("employee_id") REFERENCES "nexus"."employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."performance_review" ADD CONSTRAINT "fk_performance_review_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."performance_review" ADD CONSTRAINT "fk_performance_review_employee" FOREIGN KEY ("employee_id") REFERENCES "nexus"."employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."performance_review" ADD CONSTRAINT "fk_performance_review_reviewer" FOREIGN KEY ("reviewer_id") REFERENCES "nexus"."employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."disciplinary_case" ADD CONSTRAINT "fk_disciplinary_case_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."disciplinary_case" ADD CONSTRAINT "fk_disciplinary_case_employee" FOREIGN KEY ("employee_id") REFERENCES "nexus"."employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
