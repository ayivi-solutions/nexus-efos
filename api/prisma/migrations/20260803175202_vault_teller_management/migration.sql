-- CreateEnum
CREATE TYPE "nexus"."VaultStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "nexus"."TellerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "nexus"."CashHolderType" AS ENUM ('VAULT', 'TELLER');

-- CreateEnum
CREATE TYPE "nexus"."CashLedgerEntryType" AS ENUM ('RECEIPT', 'WITHDRAWAL', 'ALLOCATION', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateTable
CREATE TABLE "nexus"."vault" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "nexus"."VaultStatus" NOT NULL DEFAULT 'CLOSED',
    "opened_by_id" TEXT,
    "opened_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_vault" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."teller" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "vault_id" TEXT,
    "cash_limit" DECIMAL(14,2) NOT NULL,
    "current_holding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "nexus"."TellerStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspended_by_id" TEXT,
    "suspended_at" TIMESTAMP(3),
    "suspended_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_teller" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."cash_ledger_entry" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "holderType" "nexus"."CashHolderType" NOT NULL,
    "holder_id" TEXT NOT NULL,
    "type" "nexus"."CashLedgerEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_cash_ledger_entry" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_vault_institution_branch_name" ON "nexus"."vault"("institution_id", "branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "teller_employee_id_key" ON "nexus"."teller"("employee_id");

-- AddForeignKey
ALTER TABLE "nexus"."vault" ADD CONSTRAINT "fk_vault_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."teller" ADD CONSTRAINT "fk_teller_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."teller" ADD CONSTRAINT "fk_teller_vault" FOREIGN KEY ("vault_id") REFERENCES "nexus"."vault"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."cash_ledger_entry" ADD CONSTRAINT "fk_cash_ledger_entry_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
