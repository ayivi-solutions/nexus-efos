-- CreateEnum
CREATE TYPE "nexus"."PepStatus" AS ENUM ('NOT_PEP', 'DOMESTIC_PEP', 'FOREIGN_PEP', 'PEP_ASSOCIATE');

-- CreateEnum
CREATE TYPE "nexus"."CddLevel" AS ENUM ('STANDARD', 'ENHANCED');

-- AlterEnum
ALTER TYPE "nexus"."ProductStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "nexus"."customer" ADD COLUMN     "cdd_completed_at" TIMESTAMP(3),
ADD COLUMN     "cdd_completed_by_id" TEXT,
ADD COLUMN     "cdd_level" "nexus"."CddLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "cdd_notes" TEXT,
ADD COLUMN     "pep_status" "nexus"."PepStatus" NOT NULL DEFAULT 'NOT_PEP';
