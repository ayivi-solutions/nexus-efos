-- CreateEnum
CREATE TYPE "nexus"."PayFrequency" AS ENUM ('MONTHLY', 'BI_WEEKLY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "nexus"."PayrollPeriodStatus" AS ENUM ('OPEN', 'PROCESSING', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CLOSED');

-- CreateEnum
CREATE TYPE "nexus"."EarningCategory" AS ENUM ('BASIC', 'ALLOWANCE', 'BONUS', 'OVERTIME', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."DeductionCategory" AS ENUM ('STATUTORY', 'LOAN', 'INSURANCE', 'UNION', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."SalaryStructureStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'SALARY_STRUCTURE_CHANGE';

-- CreateTable
CREATE TABLE "nexus"."payroll_calendar" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "nexus"."PayFrequency" NOT NULL,
    "pay_day_of_month" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_payroll_calendar" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."payroll_period" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "pay_date" TIMESTAMP(3) NOT NULL,
    "status" "nexus"."PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_payroll_period" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."salary_grade" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_salary" DECIMAL(12,2) NOT NULL,
    "max_salary" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_salary_grade" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."pay_group" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_pay_group" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."earning_code" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "nexus"."EarningCategory" NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_earning_code" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."deduction_code" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "nexus"."DeductionCategory" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_deduction_code" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."tax_table" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_tax_table" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."tax_band" (
    "id" TEXT NOT NULL,
    "tax_table_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "lower_bound" DECIMAL(14,2) NOT NULL,
    "upper_bound" DECIMAL(65,30),
    "rate" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "pk_tax_band" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."statutory_contribution_rate" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "ceiling" DECIMAL(14,2),
    "effective_date" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_statutory_contribution_rate" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."overtime_rule" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "multiplier" DECIMAL(4,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_overtime_rule" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."employee_salary_structure" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "pay_group_id" TEXT,
    "salary_grade_id" TEXT,
    "basic_salary" DECIMAL(12,2) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "status" "nexus"."SalaryStructureStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_employee_salary_structure" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."employee_allowance" (
    "id" TEXT NOT NULL,
    "employee_salary_structure_id" TEXT NOT NULL,
    "earning_code_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "is_percentage_of_basic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pk_employee_allowance" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_salary_grade_institution_name" ON "nexus"."salary_grade"("institution_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pay_group_institution_name" ON "nexus"."pay_group"("institution_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_earning_code_institution_code" ON "nexus"."earning_code"("institution_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_deduction_code_institution_code" ON "nexus"."deduction_code"("institution_id", "code");

-- AddForeignKey
ALTER TABLE "nexus"."payroll_calendar" ADD CONSTRAINT "fk_payroll_calendar_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."payroll_period" ADD CONSTRAINT "fk_payroll_period_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."payroll_period" ADD CONSTRAINT "fk_payroll_period_calendar" FOREIGN KEY ("calendar_id") REFERENCES "nexus"."payroll_calendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."salary_grade" ADD CONSTRAINT "fk_salary_grade_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."pay_group" ADD CONSTRAINT "fk_pay_group_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."earning_code" ADD CONSTRAINT "fk_earning_code_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."deduction_code" ADD CONSTRAINT "fk_deduction_code_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."tax_table" ADD CONSTRAINT "fk_tax_table_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."tax_band" ADD CONSTRAINT "fk_tax_band_tax_table" FOREIGN KEY ("tax_table_id") REFERENCES "nexus"."tax_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."statutory_contribution_rate" ADD CONSTRAINT "fk_statutory_contribution_rate_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."overtime_rule" ADD CONSTRAINT "fk_overtime_rule_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employee_salary_structure" ADD CONSTRAINT "fk_employee_salary_structure_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employee_allowance" ADD CONSTRAINT "fk_employee_allowance_salary_structure" FOREIGN KEY ("employee_salary_structure_id") REFERENCES "nexus"."employee_salary_structure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
