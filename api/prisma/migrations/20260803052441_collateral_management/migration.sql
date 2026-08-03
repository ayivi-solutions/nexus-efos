-- CreateEnum
CREATE TYPE "nexus"."CollateralType" AS ENUM ('LAND', 'BUILDING', 'VEHICLE', 'EQUIPMENT', 'INVENTORY', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."CollateralStatus" AS ENUM ('PLEDGED', 'RELEASED', 'REALISED');

-- CreateTable
CREATE TABLE "nexus"."collateral" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "type" "nexus"."CollateralType" NOT NULL,
    "description" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "ownership_verified" BOOLEAN NOT NULL DEFAULT false,
    "estimated_value" DECIMAL(14,2) NOT NULL,
    "valuation_date" TIMESTAMP(3) NOT NULL,
    "valued_by_id" TEXT,
    "insurance_required" BOOLEAN NOT NULL DEFAULT false,
    "insurance_policy_no" TEXT,
    "insurance_expiry_date" TIMESTAMP(3),
    "status" "nexus"."CollateralStatus" NOT NULL DEFAULT 'PLEDGED',
    "released_by_id" TEXT,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,
    "realised_at" TIMESTAMP(3),
    "realised_amount" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_collateral" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."collateral" ADD CONSTRAINT "fk_collateral_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."collateral" ADD CONSTRAINT "fk_collateral_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
