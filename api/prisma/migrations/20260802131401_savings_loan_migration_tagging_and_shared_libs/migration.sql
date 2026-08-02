-- AlterEnum
ALTER TYPE "nexus"."SavingsTxnType" ADD VALUE 'MIGRATION_OPENING_BALANCE';

-- AlterTable
ALTER TABLE "nexus"."loan" ADD COLUMN     "import_batch_id" TEXT;

-- AlterTable
ALTER TABLE "nexus"."savings_account" ADD COLUMN     "import_batch_id" TEXT;

-- AddForeignKey
ALTER TABLE "nexus"."loan" ADD CONSTRAINT "fk_loan_import_batch" FOREIGN KEY ("import_batch_id") REFERENCES "nexus"."import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_account" ADD CONSTRAINT "fk_savings_account_import_batch" FOREIGN KEY ("import_batch_id") REFERENCES "nexus"."import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
