-- CreateEnum
CREATE TYPE "nexus"."GLCapitalTier" AS ENUM ('CET1', 'ADDITIONAL_TIER1', 'TIER2');

-- AlterTable
ALTER TABLE "nexus"."gl_account" ADD COLUMN     "basel_risk_weight_percent" INTEGER,
ADD COLUMN     "capital_tier" "nexus"."GLCapitalTier";

-- CreateTable
CREATE TABLE "nexus"."regulatory_capital_snapshot" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "as_of_date" TIMESTAMP(3) NOT NULL,
    "raw_cet1_capital" DECIMAL(16,2) NOT NULL,
    "raw_additional_tier1_capital" DECIMAL(16,2) NOT NULL,
    "raw_tier2_capital" DECIMAL(16,2) NOT NULL,
    "admitted_additional_tier1_capital" DECIMAL(16,2) NOT NULL,
    "admitted_tier2_capital" DECIMAL(16,2) NOT NULL,
    "total_rwa" DECIMAL(16,2) NOT NULL,
    "loan_rwa" DECIMAL(16,2) NOT NULL,
    "other_asset_rwa" DECIMAL(16,2) NOT NULL,
    "unclassified_asset_balance" DECIMAL(16,2) NOT NULL,
    "cet1_ratio" DECIMAL(6,3) NOT NULL,
    "tier1_ratio" DECIMAL(6,3) NOT NULL,
    "total_car" DECIMAL(6,3) NOT NULL,
    "min_cet1_ratio" DECIMAL(6,3) NOT NULL DEFAULT 6.5,
    "min_tier1_ratio" DECIMAL(6,3) NOT NULL DEFAULT 8.0,
    "min_car" DECIMAL(6,3) NOT NULL DEFAULT 10.0,
    "ccb1" DECIMAL(6,3) NOT NULL DEFAULT 3.0,
    "npl_ratio" DECIMAL(6,3) NOT NULL,
    "npl_ceiling" DECIMAL(6,3) NOT NULL DEFAULT 5.0,
    "breakdown" JSONB NOT NULL,
    "computed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_regulatory_capital_snapshot" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_regulatory_capital_snapshot_institution_date" ON "nexus"."regulatory_capital_snapshot"("institution_id", "as_of_date");

-- AddForeignKey
ALTER TABLE "nexus"."regulatory_capital_snapshot" ADD CONSTRAINT "fk_regulatory_capital_snapshot_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
