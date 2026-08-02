/*
  Warnings:

  - You are about to drop the column `department` on the `employee` table. All the data in the column will be lost.
  - You are about to drop the column `position` on the `employee` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."BusinessRuleTriggerPoint" ADD VALUE 'LOAN_APPROVAL';
ALTER TYPE "nexus"."BusinessRuleTriggerPoint" ADD VALUE 'SAVINGS_ACCOUNT_OPENING';
ALTER TYPE "nexus"."BusinessRuleTriggerPoint" ADD VALUE 'CUSTOMER_CREATION';

-- AlterTable
ALTER TABLE "nexus"."employee" DROP COLUMN "department",
DROP COLUMN "position",
ADD COLUMN     "department_id" TEXT,
ADD COLUMN     "position_id" TEXT;

-- CreateTable
CREATE TABLE "nexus"."department" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_department" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."position" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_position" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_department_institution_id_name" ON "nexus"."department"("institution_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_position_institution_id_title" ON "nexus"."position"("institution_id", "title");

-- AddForeignKey
ALTER TABLE "nexus"."employee" ADD CONSTRAINT "fk_employee_department" FOREIGN KEY ("department_id") REFERENCES "nexus"."department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employee" ADD CONSTRAINT "fk_employee_position" FOREIGN KEY ("position_id") REFERENCES "nexus"."position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."department" ADD CONSTRAINT "fk_department_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."position" ADD CONSTRAINT "fk_position_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."position" ADD CONSTRAINT "fk_position_department" FOREIGN KEY ("department_id") REFERENCES "nexus"."department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
