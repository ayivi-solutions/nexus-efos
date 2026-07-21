/*
  Warnings:

  - A unique constraint covering the columns `[institutionId,employeeNumber]` on the table `employees` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "nexus"."EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'TEMPORARY', 'INTERN', 'CONSULTANT');

-- AlterTable
ALTER TABLE "nexus"."employees" ADD COLUMN     "confirmationDate" TIMESTAMP(3),
ADD COLUMN     "department" TEXT,
ADD COLUMN     "division" TEXT,
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "employmentDate" TIMESTAMP(3),
ADD COLUMN     "employmentType" "nexus"."EmploymentType" NOT NULL DEFAULT 'PERMANENT',
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "reportingManagerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employees_institutionId_employeeNumber_key" ON "nexus"."employees"("institutionId", "employeeNumber");

-- AddForeignKey
ALTER TABLE "nexus"."employees" ADD CONSTRAINT "employees_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "nexus"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
