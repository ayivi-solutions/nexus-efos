-- CreateEnum
CREATE TYPE "nexus"."GuarantorStatus" AS ENUM ('PENDING', 'APPROVED', 'RELEASED');

-- CreateTable
CREATE TABLE "nexus"."guarantor" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "id_type" TEXT,
    "id_number" TEXT,
    "relationship" TEXT NOT NULL,
    "monthly_income" DECIMAL(14,2),
    "guarantee_limit" DECIMAL(14,2) NOT NULL,
    "status" "nexus"."GuarantorStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "released_by_id" TEXT,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_guarantor" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."guarantor" ADD CONSTRAINT "fk_guarantor_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."guarantor" ADD CONSTRAINT "fk_guarantor_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
