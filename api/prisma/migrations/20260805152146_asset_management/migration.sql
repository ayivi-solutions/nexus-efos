-- CreateEnum
CREATE TYPE "nexus"."DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'REDUCING_BALANCE');

-- CreateEnum
CREATE TYPE "nexus"."AssetStatus" AS ENUM ('ACTIVE', 'UNDER_MAINTENANCE', 'DISPOSED', 'LOST');

-- CreateEnum
CREATE TYPE "nexus"."AssetTransferStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "nexus"."MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE');

-- CreateEnum
CREATE TYPE "nexus"."AssetDisposalType" AS ENUM ('SALE', 'DONATION', 'WRITE_OFF', 'SCRAP');

-- CreateEnum
CREATE TYPE "nexus"."AssetDisposalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "nexus"."AssetCondition" AS ENUM ('GOOD', 'FAIR', 'POOR', 'DAMAGED', 'MISSING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'ASSET_TRANSFER';
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'ASSET_DISPOSAL';

-- CreateTable
CREATE TABLE "nexus"."asset_category" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_useful_life_months" INTEGER NOT NULL,
    "default_depreciation_method" "nexus"."DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "default_depreciation_rate" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset_category" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serial_number" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "acquisition_date" TIMESTAMP(3) NOT NULL,
    "acquisition_cost" DECIMAL(14,2) NOT NULL,
    "supplier_name" TEXT,
    "warranty_expiry_date" TIMESTAMP(3),
    "installation_date" TIMESTAMP(3),
    "commissioned_date" TIMESTAMP(3),
    "useful_life_months" INTEGER NOT NULL,
    "residual_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "depreciation_method" "nexus"."DepreciationMethod" NOT NULL,
    "depreciation_rate" DECIMAL(5,2),
    "accumulated_depreciation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "nexus"."AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_employee_id" TEXT,
    "current_department_id" TEXT,
    "current_branch_id" TEXT,
    "barcode_value" TEXT,
    "qr_code_value" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "disposed_at" TIMESTAMP(3),
    "disposal_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset_allocation" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "employeeId" TEXT,
    "departmentId" TEXT,
    "branchId" TEXT,
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocated_by_id" TEXT NOT NULL,
    "returned_at" TIMESTAMP(3),
    "return_condition" TEXT,
    "notes" TEXT,

    CONSTRAINT "pk_asset_allocation" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset_transfer" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "fromEmployeeId" TEXT,
    "fromDepartmentId" TEXT,
    "fromBranchId" TEXT,
    "toEmployeeId" TEXT,
    "toDepartmentId" TEXT,
    "toBranchId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "nexus"."AssetTransferStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requested_by_id" TEXT NOT NULL,
    "transferred_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset_transfer" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset_maintenance_schedule" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "frequency_months" INTEGER NOT NULL,
    "last_maintenance_date" TIMESTAMP(3),
    "next_due_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset_maintenance_schedule" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset_maintenance_record" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "type" "nexus"."MaintenanceType" NOT NULL,
    "scheduled_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "service_provider" TEXT,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset_maintenance_record" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset_depreciation_entry" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "depreciation_amount" DECIMAL(14,2) NOT NULL,
    "accumulated_depreciation" DECIMAL(14,2) NOT NULL,
    "net_book_value" DECIMAL(14,2) NOT NULL,
    "journal_id" TEXT,
    "posted_by_id" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset_depreciation_entry" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset_disposal" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "disposalType" "nexus"."AssetDisposalType" NOT NULL,
    "disposalDate" TIMESTAMP(3) NOT NULL,
    "sale_proceeds" DECIMAL(14,2),
    "net_book_value_at_disposal" DECIMAL(14,2) NOT NULL,
    "gain_loss" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "nexus"."AssetDisposalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "journal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset_disposal" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset_verification_record" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "verified_by_id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location_confirmed" BOOLEAN NOT NULL,
    "custodian_confirmed" BOOLEAN NOT NULL,
    "condition" "nexus"."AssetCondition" NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "notes" TEXT,
    "variance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pk_asset_verification_record" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."asset_gl_account_mapping" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "gl_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset_gl_account_mapping" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_asset_category_institution_name" ON "nexus"."asset_category"("institution_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_asset_institution_code" ON "nexus"."asset"("institution_id", "asset_code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_maintenance_schedule_asset_id_key" ON "nexus"."asset_maintenance_schedule"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_asset_depreciation_asset_period" ON "nexus"."asset_depreciation_entry"("asset_id", "period_label");

-- CreateIndex
CREATE UNIQUE INDEX "asset_disposal_asset_id_key" ON "nexus"."asset_disposal"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_asset_gl_mapping_institution_purpose" ON "nexus"."asset_gl_account_mapping"("institution_id", "purpose");

-- AddForeignKey
ALTER TABLE "nexus"."asset_category" ADD CONSTRAINT "fk_asset_category_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset" ADD CONSTRAINT "fk_asset_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset" ADD CONSTRAINT "fk_asset_category" FOREIGN KEY ("category_id") REFERENCES "nexus"."asset_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_allocation" ADD CONSTRAINT "fk_asset_allocation_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_allocation" ADD CONSTRAINT "fk_asset_allocation_asset" FOREIGN KEY ("asset_id") REFERENCES "nexus"."asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_transfer" ADD CONSTRAINT "fk_asset_transfer_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_transfer" ADD CONSTRAINT "fk_asset_transfer_asset" FOREIGN KEY ("asset_id") REFERENCES "nexus"."asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_maintenance_schedule" ADD CONSTRAINT "fk_asset_maintenance_schedule_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_maintenance_schedule" ADD CONSTRAINT "fk_asset_maintenance_schedule_asset" FOREIGN KEY ("asset_id") REFERENCES "nexus"."asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_maintenance_record" ADD CONSTRAINT "fk_asset_maintenance_record_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_maintenance_record" ADD CONSTRAINT "fk_asset_maintenance_record_asset" FOREIGN KEY ("asset_id") REFERENCES "nexus"."asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_depreciation_entry" ADD CONSTRAINT "fk_asset_depreciation_entry_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_depreciation_entry" ADD CONSTRAINT "fk_asset_depreciation_entry_asset" FOREIGN KEY ("asset_id") REFERENCES "nexus"."asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_disposal" ADD CONSTRAINT "fk_asset_disposal_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_disposal" ADD CONSTRAINT "fk_asset_disposal_asset" FOREIGN KEY ("asset_id") REFERENCES "nexus"."asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_verification_record" ADD CONSTRAINT "fk_asset_verification_record_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_verification_record" ADD CONSTRAINT "fk_asset_verification_record_asset" FOREIGN KEY ("asset_id") REFERENCES "nexus"."asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."asset_gl_account_mapping" ADD CONSTRAINT "fk_asset_gl_account_mapping_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
