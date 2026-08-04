-- CreateEnum
CREATE TYPE "nexus"."PayrollRunStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PROCESSED', 'REVERSED');

-- CreateTable
CREATE TABLE "nexus"."payroll_run" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "payroll_period_id" TEXT NOT NULL,
    "status" "nexus"."PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "total_gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "processed_by_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_payroll_run" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."payroll_entry" (
    "id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basic_salary" DECIMAL(12,2) NOT NULL,
    "gross_pay" DECIMAL(12,2) NOT NULL,
    "taxable_income" DECIMAL(12,2) NOT NULL,
    "paye" DECIMAL(12,2) NOT NULL,
    "ssnit_employee" DECIMAL(12,2) NOT NULL,
    "ssnit_employer_tier1" DECIMAL(12,2) NOT NULL,
    "tier2_employer" DECIMAL(12,2) NOT NULL,
    "other_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_payroll_entry" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_payroll_period_id_key" ON "nexus"."payroll_run"("payroll_period_id");

-- AddForeignKey
ALTER TABLE "nexus"."payroll_run" ADD CONSTRAINT "fk_payroll_run_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."payroll_entry" ADD CONSTRAINT "fk_payroll_entry_payroll_run" FOREIGN KEY ("payroll_run_id") REFERENCES "nexus"."payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
