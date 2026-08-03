-- CreateEnum
CREATE TYPE "nexus"."CreditRecommendation" AS ENUM ('APPROVE', 'REVIEW', 'DECLINE');

-- CreateTable
CREATE TABLE "nexus"."credit_assessment" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "monthly_income" DECIMAL(14,2) NOT NULL,
    "monthly_expenses" DECIMAL(14,2) NOT NULL,
    "existing_loan_obligations" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "proposed_installment" DECIMAL(14,2) NOT NULL,
    "debt_to_income_ratio" DECIMAL(5,2) NOT NULL,
    "repayment_capacity_ratio" DECIMAL(5,2) NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "recommendation" "nexus"."CreditRecommendation" NOT NULL,
    "credit_bureau_checked" BOOLEAN NOT NULL DEFAULT false,
    "credit_bureau_notes" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "overridden_by_id" TEXT,
    "overridden_at" TIMESTAMP(3),
    "override_reason" TEXT,
    "assessed_by_id" TEXT NOT NULL,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_credit_assessment" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_assessment_loan_id_key" ON "nexus"."credit_assessment"("loan_id");

-- AddForeignKey
ALTER TABLE "nexus"."credit_assessment" ADD CONSTRAINT "fk_credit_assessment_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."credit_assessment" ADD CONSTRAINT "fk_credit_assessment_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
