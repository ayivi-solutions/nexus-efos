-- CreateEnum
CREATE TYPE "nexus"."RiskRating" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "nexus"."customers" ADD COLUMN     "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredChannel" TEXT,
ADD COLUMN     "preferredLanguage" TEXT,
ADD COLUMN     "riskRating" "nexus"."RiskRating",
ADD COLUMN     "watchlistFlag" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "nexus"."next_of_kin" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "next_of_kin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."customer_notes" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "authorId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."beneficiaries" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "allocationPct" DECIMAL(5,2) NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."beneficial_owners" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "ownershipPct" DECIMAL(5,2) NOT NULL,
    "idType" TEXT,
    "idNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficial_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."watchlist_entries" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "idNumber" TEXT,
    "reason" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_entries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."next_of_kin" ADD CONSTRAINT "next_of_kin_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "nexus"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_notes" ADD CONSTRAINT "customer_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "nexus"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."beneficiaries" ADD CONSTRAINT "beneficiaries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "nexus"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."beneficial_owners" ADD CONSTRAINT "beneficial_owners_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "nexus"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."watchlist_entries" ADD CONSTRAINT "watchlist_entries_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
