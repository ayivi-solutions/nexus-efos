-- CreateEnum
CREATE TYPE "nexus"."GLAccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "nexus"."GLAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "nexus"."JournalType" AS ENUM ('MANUAL', 'AUTOMATIC', 'RECURRING', 'REVERSING', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "nexus"."JournalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'JOURNAL_POSTING';

-- CreateTable
CREATE TABLE "nexus"."gl_account" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "nexus"."GLAccountCategory" NOT NULL,
    "parent_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "branch_id" TEXT,
    "status" "nexus"."GLAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "balance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_gl_account" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."journal" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "journal_number" TEXT NOT NULL,
    "type" "nexus"."JournalType" NOT NULL DEFAULT 'MANUAL',
    "description" TEXT NOT NULL,
    "status" "nexus"."JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "reversal_of_id" TEXT,
    "posted_by_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_journal" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."journal_line" (
    "id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "pk_journal_line" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_gl_account_institution_code" ON "nexus"."gl_account"("institution_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_journal_number_key" ON "nexus"."journal"("journal_number");

-- AddForeignKey
ALTER TABLE "nexus"."gl_account" ADD CONSTRAINT "fk_gl_account_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."gl_account" ADD CONSTRAINT "fk_gl_account_parent" FOREIGN KEY ("parent_id") REFERENCES "nexus"."gl_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."journal" ADD CONSTRAINT "fk_journal_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."journal" ADD CONSTRAINT "fk_journal_reversal_of" FOREIGN KEY ("reversal_of_id") REFERENCES "nexus"."journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."journal_line" ADD CONSTRAINT "fk_journal_line_journal" FOREIGN KEY ("journal_id") REFERENCES "nexus"."journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."journal_line" ADD CONSTRAINT "fk_journal_line_account" FOREIGN KEY ("account_id") REFERENCES "nexus"."gl_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
