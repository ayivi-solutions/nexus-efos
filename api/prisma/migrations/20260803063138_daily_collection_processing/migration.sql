-- CreateEnum
CREATE TYPE "nexus"."CollectionTransactionType" AS ENUM ('SAVINGS_DEPOSIT', 'LOAN_REPAYMENT');

-- CreateEnum
CREATE TYPE "nexus"."CollectionTransactionStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateTable
CREATE TABLE "nexus"."collection_transaction" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "transaction_number" TEXT NOT NULL,
    "type" "nexus"."CollectionTransactionType" NOT NULL,
    "collector_id" TEXT NOT NULL,
    "route_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "nexus"."CollectionTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "reversed_by_id" TEXT,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" TEXT NOT NULL,

    CONSTRAINT "pk_collection_transaction" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_transaction_transaction_number_key" ON "nexus"."collection_transaction"("transaction_number");

-- AddForeignKey
ALTER TABLE "nexus"."collection_transaction" ADD CONSTRAINT "fk_collection_transaction_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
