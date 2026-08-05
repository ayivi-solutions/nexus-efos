-- AlterTable
ALTER TABLE "nexus"."payroll_run" ADD COLUMN     "accrual_journal_id" TEXT,
ADD COLUMN     "settlement_journal_id" TEXT;

-- CreateTable
CREATE TABLE "nexus"."payroll_gl_account_mapping" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "gl_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_payroll_gl_account_mapping" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_payroll_gl_mapping_institution_purpose" ON "nexus"."payroll_gl_account_mapping"("institution_id", "purpose");

-- AddForeignKey
ALTER TABLE "nexus"."payroll_gl_account_mapping" ADD CONSTRAINT "fk_payroll_gl_account_mapping_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
