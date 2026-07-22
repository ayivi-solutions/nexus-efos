-- CreateEnum
CREATE TYPE "nexus"."InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- AlterTable
ALTER TABLE "nexus"."loans" ADD COLUMN     "interestMethod" TEXT NOT NULL DEFAULT 'FLAT';

-- CreateTable
CREATE TABLE "nexus"."loan_installments" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principalDue" DECIMAL(14,2) NOT NULL,
    "interestDue" DECIMAL(14,2) NOT NULL,
    "totalDue" DECIMAL(14,2) NOT NULL,
    "principalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "nexus"."InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_installments_loanId_installmentNumber_key" ON "nexus"."loan_installments"("loanId", "installmentNumber");

-- AddForeignKey
ALTER TABLE "nexus"."loan_installments" ADD CONSTRAINT "loan_installments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "nexus"."loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
