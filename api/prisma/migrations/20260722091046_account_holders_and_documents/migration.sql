-- CreateEnum
CREATE TYPE "nexus"."AccountHolderRole" AS ENUM ('JOINT', 'AUTHORISED_SIGNATORY', 'GUARDIAN', 'NOMINEE', 'POWER_OF_ATTORNEY', 'CORPORATE_REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "nexus"."DocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENCE', 'VOTER_ID', 'BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'UTILITY_BILL', 'PROOF_OF_ADDRESS', 'PHOTOGRAPH', 'SIGNATURE', 'LOAN_DOCUMENT', 'CONTRACT', 'CONSENT_FORM', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."DocumentStatus" AS ENUM ('UPLOADED', 'VERIFIED', 'APPROVED', 'ACTIVE', 'ARCHIVED', 'DISPOSED');

-- CreateTable
CREATE TABLE "nexus"."account_holders" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "role" "nexus"."AccountHolderRole" NOT NULL,
    "loanId" TEXT,
    "savingsAccountId" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_holders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."documents" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "customerId" TEXT,
    "documentName" TEXT NOT NULL,
    "documentType" "nexus"."DocumentType" NOT NULL,
    "category" TEXT,
    "storageReference" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "expiryDate" TIMESTAMP(3),
    "status" "nexus"."DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."account_holders" ADD CONSTRAINT "account_holders_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."account_holders" ADD CONSTRAINT "account_holders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "nexus"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."account_holders" ADD CONSTRAINT "account_holders_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "nexus"."loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."account_holders" ADD CONSTRAINT "account_holders_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "nexus"."savings_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."documents" ADD CONSTRAINT "documents_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."documents" ADD CONSTRAINT "documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "nexus"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
