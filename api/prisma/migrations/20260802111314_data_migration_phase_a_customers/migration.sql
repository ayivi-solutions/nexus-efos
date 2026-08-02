-- CreateEnum
CREATE TYPE "nexus"."ImportEntityType" AS ENUM ('CUSTOMER', 'SAVINGS_ACCOUNT', 'LOAN');

-- CreateEnum
CREATE TYPE "nexus"."ImportMethod" AS ENUM ('STANDARD', 'OPENING_BALANCE', 'FULL_HISTORY');

-- CreateEnum
CREATE TYPE "nexus"."ImportBatchStatus" AS ENUM ('DRY_RUN', 'COMMITTED', 'FAILED');

-- AlterTable
ALTER TABLE "nexus"."customer" ADD COLUMN     "import_batch_id" TEXT;

-- CreateTable
CREATE TABLE "nexus"."import_batch" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "entity_type" "nexus"."ImportEntityType" NOT NULL,
    "method" "nexus"."ImportMethod" NOT NULL DEFAULT 'STANDARD',
    "status" "nexus"."ImportBatchStatus" NOT NULL DEFAULT 'DRY_RUN',
    "file_name" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "success_rows" INTEGER NOT NULL,
    "error_rows" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "committed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_import_batch" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."customer" ADD CONSTRAINT "fk_customer_import_batch" FOREIGN KEY ("import_batch_id") REFERENCES "nexus"."import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."import_batch" ADD CONSTRAINT "fk_import_batch_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
