-- CreateEnum
CREATE TYPE "nexus"."AccountStatus" AS ENUM ('REGISTERED', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'DORMANT', 'RESTRICTED', 'SUSPENDED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "nexus"."ProductType" AS ENUM ('SAVINGS', 'LOAN');

-- CreateEnum
CREATE TYPE "nexus"."ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'WITHDRAWN', 'ARCHIVED');

-- AlterTable
ALTER TABLE "nexus"."customers" ADD COLUMN     "status" "nexus"."AccountStatus" NOT NULL DEFAULT 'REGISTERED';

-- AlterTable
ALTER TABLE "nexus"."loans" ADD COLUMN     "productVersionId" TEXT;

-- AlterTable
ALTER TABLE "nexus"."savings_accounts" ADD COLUMN     "ledgerBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "productVersionId" TEXT;

-- CreateTable
CREATE TABLE "nexus"."products" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "nexus"."ProductType" NOT NULL,
    "status" "nexus"."ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."product_versions" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "minOpeningBalance" DECIMAL(14,2),
    "minOperatingBalance" DECIMAL(14,2),
    "maxBalance" DECIMAL(14,2),
    "minDeposit" DECIMAL(14,2),
    "maxDeposit" DECIMAL(14,2),
    "minLoanAmount" DECIMAL(14,2),
    "maxLoanAmount" DECIMAL(14,2),
    "minTenureMonths" INTEGER,
    "maxTenureMonths" INTEGER,
    "interestMethod" TEXT NOT NULL DEFAULT 'FLAT',
    "interestRate" DECIMAL(5,2) NOT NULL,
    "feeStructure" JSONB,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_currentVersionId_key" ON "nexus"."products"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "products_institutionId_code_key" ON "nexus"."products"("institutionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_productId_versionNumber_key" ON "nexus"."product_versions"("productId", "versionNumber");

-- AddForeignKey
ALTER TABLE "nexus"."products" ADD CONSTRAINT "products_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."products" ADD CONSTRAINT "products_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "nexus"."product_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."product_versions" ADD CONSTRAINT "product_versions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "nexus"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loans" ADD CONSTRAINT "loans_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "nexus"."product_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_accounts" ADD CONSTRAINT "savings_accounts_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "nexus"."product_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
