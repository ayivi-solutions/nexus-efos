-- CreateEnum
CREATE TYPE "nexus"."ScheduledJobStatus" AS ENUM ('CLAIMED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "nexus"."scheduled_job_run" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL,
    "execution_id" TEXT NOT NULL,
    "claimed_by_process_id" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "nexus"."ScheduledJobStatus" NOT NULL DEFAULT 'CLAIMED',
    "completed_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "pk_scheduled_job_run" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_scheduled_job_run_type_date" ON "nexus"."scheduled_job_run"("jobType", "runDate");
