-- CreateEnum
CREATE TYPE "nexus"."InterBranchTransferStatus" AS ENUM ('PENDING_APPROVAL', 'POSTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "nexus"."ApprovalRequestType" ADD VALUE 'INTER_BRANCH_TRANSFER';

-- CreateTable
CREATE TABLE "nexus"."branch_settlement_account" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "gl_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_branch_settlement_account" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."inter_branch_transfer" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "from_branch_id" TEXT NOT NULL,
    "to_branch_id" TEXT NOT NULL,
    "from_gl_account_id" TEXT NOT NULL,
    "to_gl_account_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "nexus"."InterBranchTransferStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "journal_id" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_inter_branch_transfer" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_settlement_account_branch_id_key" ON "nexus"."branch_settlement_account"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_settlement_account_gl_account_id_key" ON "nexus"."branch_settlement_account"("gl_account_id");

-- AddForeignKey
ALTER TABLE "nexus"."branch_settlement_account" ADD CONSTRAINT "fk_branch_settlement_account_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."branch_settlement_account" ADD CONSTRAINT "fk_branch_settlement_account_gl_account" FOREIGN KEY ("gl_account_id") REFERENCES "nexus"."gl_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."inter_branch_transfer" ADD CONSTRAINT "fk_inter_branch_transfer_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
