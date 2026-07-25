-- CreateEnum
CREATE TYPE "nexus"."InstitutionType" AS ENUM ('INDIVIDUAL_SUSU_OPERATOR', 'MICROFINANCE_INSTITUTION', 'SAVINGS_AND_LOANS_COMPANY', 'CREDIT_UNION', 'COOPERATIVE_SOCIETY', 'RURAL_COMMUNITY_BANK', 'AGENCY_BANKING_NETWORK', 'DIGITAL_LENDING_INSTITUTION');

-- CreateEnum
CREATE TYPE "nexus"."InstitutionStatus" AS ENUM ('PENDING_ONBOARDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "nexus"."UserCategory" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "nexus"."UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "nexus"."RoleCategory" AS ENUM ('EXECUTIVE', 'OPERATIONAL', 'GOVERNANCE', 'TECHNICAL', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "nexus"."PermissionCategory" AS ENUM ('DATA', 'TRANSACTION', 'ADMINISTRATIVE', 'REPORTING', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "nexus"."PermissionAction" AS ENUM ('VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'EXPORT', 'CONFIGURE', 'ADMINISTER', 'AUDIT');

-- CreateEnum
CREATE TYPE "nexus"."EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "nexus"."EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'TEMPORARY', 'INTERN', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "nexus"."CustomerSegment" AS ENUM ('INDIVIDUAL', 'BUSINESS', 'FARMER_GROUP', 'WOMENS_GROUP', 'YOUTH', 'CORPORATE');

-- CreateEnum
CREATE TYPE "nexus"."LifecycleStage" AS ENUM ('AWARENESS', 'ACQUISITION', 'ONBOARDING', 'ACTIVATION', 'GROWTH', 'RETENTION', 'ADVOCACY', 'RE_ENGAGEMENT');

-- CreateEnum
CREATE TYPE "nexus"."AccountStatus" AS ENUM ('REGISTERED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'VERIFIED', 'ACTIVE', 'DORMANT', 'RESTRICTED', 'SUSPENDED', 'BLACKLISTED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "nexus"."ClosureReason" AS ENUM ('CUSTOMER_REQUEST', 'DEATH', 'BUSINESS_CLOSURE', 'FRAUD', 'REGULATORY_DIRECTIVE', 'DUPLICATE_MERGE', 'MIGRATION', 'INACTIVITY', 'INSTITUTIONAL_DECISION', 'COURT_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "nexus"."RiskRating" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "nexus"."ApprovalRequestType" AS ENUM ('CUSTOMER_STATUS_CHANGE', 'CUSTOMER_PROFILE_UPDATE', 'ACCOUNT_HOLDER_ADD', 'PRODUCT_ACTIVATION', 'AML_ADJUDICATION');

-- CreateEnum
CREATE TYPE "nexus"."ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "nexus"."ProductType" AS ENUM ('SAVINGS', 'LOAN');

-- CreateEnum
CREATE TYPE "nexus"."ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'WITHDRAWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "nexus"."LoanStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'ACTIVE', 'CLOSED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "nexus"."InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "nexus"."SavingsAccountStatus" AS ENUM ('ACTIVE', 'DORMANT', 'CLOSED');

-- CreateEnum
CREATE TYPE "nexus"."SavingsTxnType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'INTEREST');

-- CreateEnum
CREATE TYPE "nexus"."AccountHolderRole" AS ENUM ('JOINT', 'AUTHORISED_SIGNATORY', 'GUARDIAN', 'NOMINEE', 'POWER_OF_ATTORNEY', 'CORPORATE_REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "nexus"."DocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENCE', 'VOTER_ID', 'BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'UTILITY_BILL', 'PROOF_OF_ADDRESS', 'PHOTOGRAPH', 'SIGNATURE', 'LOAN_DOCUMENT', 'CONTRACT', 'CONSENT_FORM', 'OTHER');

-- CreateEnum
CREATE TYPE "nexus"."DocumentStatus" AS ENUM ('UPLOADED', 'VERIFIED', 'APPROVED', 'ACTIVE', 'ARCHIVED', 'DISPOSED');

-- CreateTable
CREATE TABLE "nexus"."institution" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trading_name" TEXT,
    "type" "nexus"."InstitutionType" NOT NULL,
    "status" "nexus"."InstitutionStatus" NOT NULL DEFAULT 'PENDING_ONBOARDING',
    "regulator_id" TEXT,
    "country" TEXT NOT NULL DEFAULT 'GH',
    "region" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "onboarding_step" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_institution" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."branch" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "region" TEXT,
    "is_head_office" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_branch" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."user" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "category" "nexus"."UserCategory" NOT NULL DEFAULT 'INTERNAL',
    "status" "nexus"."UserStatus" NOT NULL DEFAULT 'INVITED',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "invite_token" TEXT,
    "invite_token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_user" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."role" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT,
    "name" TEXT NOT NULL,
    "category" "nexus"."RoleCategory" NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_role" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "nexus"."PermissionCategory" NOT NULL,
    "action" "nexus"."PermissionAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "pk_permission" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."role_permission" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "pk_role_permission" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."user_role" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "is_delegated" BOOLEAN NOT NULL DEFAULT false,
    "delegated_from_user_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_user_role" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."employee" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "employee_number" TEXT,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "employment_type" "nexus"."EmploymentType" NOT NULL DEFAULT 'PERMANENT',
    "department" TEXT,
    "division" TEXT,
    "position" TEXT,
    "grade" TEXT,
    "employment_date" TIMESTAMP(3),
    "confirmation_date" TIMESTAMP(3),
    "reporting_manager_id" TEXT,
    "status" "nexus"."EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_employee" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."customer" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "id_type" TEXT,
    "id_number" TEXT,
    "segment" "nexus"."CustomerSegment" NOT NULL DEFAULT 'INDIVIDUAL',
    "lifecycle_stage" "nexus"."LifecycleStage" NOT NULL DEFAULT 'ONBOARDING',
    "status" "nexus"."AccountStatus" NOT NULL DEFAULT 'REGISTERED',
    "kyc_status" "nexus"."KycStatus" NOT NULL DEFAULT 'PENDING',
    "risk_rating" "nexus"."RiskRating",
    "preferred_channel" TEXT,
    "preferred_language" TEXT,
    "watchlist_flag" BOOLEAN NOT NULL DEFAULT false,
    "possible_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "marketing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "transaction_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "statement_delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
    "closure_reason" "nexus"."ClosureReason",
    "closure_note" TEXT,
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_customer" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."next_of_kin" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_next_of_kin" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."customer_note" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "author_id" TEXT,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_customer_note" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."beneficiary" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "allocation_pct" DECIMAL(5,2) NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_beneficiary" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."beneficial_owner" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "ownership_pct" DECIMAL(5,2) NOT NULL,
    "id_type" TEXT,
    "id_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_beneficial_owner" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."watchlist_entry" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "id_number" TEXT,
    "reason" TEXT,
    "added_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_watchlist_entry" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."approval_request" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "type" "nexus"."ApprovalRequestType" NOT NULL,
    "status" "nexus"."ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,

    CONSTRAINT "pk_approval_request" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."product" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "nexus"."ProductType" NOT NULL,
    "status" "nexus"."ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_product" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."product_version" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "min_opening_balance" DECIMAL(14,2),
    "min_operating_balance" DECIMAL(14,2),
    "max_balance" DECIMAL(14,2),
    "min_deposit" DECIMAL(14,2),
    "max_deposit" DECIMAL(14,2),
    "min_loan_amount" DECIMAL(14,2),
    "max_loan_amount" DECIMAL(14,2),
    "min_tenure_months" INTEGER,
    "max_tenure_months" INTEGER,
    "interest_method" TEXT NOT NULL DEFAULT 'FLAT',
    "interest_rate" DECIMAL(5,2) NOT NULL,
    "fee_structure" JSONB,
    "interest_rate_type" TEXT NOT NULL DEFAULT 'FIXED',
    "promo_interest_rate" DECIMAL(6,3),
    "promo_duration_days" INTEGER,
    "effective_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_product_version" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."loan" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "product_version_id" TEXT,
    "principal" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(5,2) NOT NULL,
    "interest_method" TEXT NOT NULL DEFAULT 'FLAT',
    "term_months" INTEGER NOT NULL,
    "status" "nexus"."LoanStatus" NOT NULL DEFAULT 'PENDING',
    "initiated_by_id" TEXT,
    "approved_by_id" TEXT,
    "disbursed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_loan" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."loan_repayment" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" TEXT,

    CONSTRAINT "pk_loan_repayment" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."loan_installment" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "principal_due" DECIMAL(14,2) NOT NULL,
    "interest_due" DECIMAL(14,2) NOT NULL,
    "total_due" DECIMAL(14,2) NOT NULL,
    "principal_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interest_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "nexus"."InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_loan_installment" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_account" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "product_version_id" TEXT,
    "account_number" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ledger_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "nexus"."SavingsAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "interest_suspended" BOOLEAN NOT NULL DEFAULT false,
    "interest_suspended_reason" TEXT,
    "interest_suspended_at" TIMESTAMP(3),
    "promo_interest_rate" DECIMAL(6,3),
    "promo_expires_at" TIMESTAMP(3),
    "last_accrual_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_savings_account" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."interest_rate_tier" (
    "id" TEXT NOT NULL,
    "product_version_id" TEXT NOT NULL,
    "min_balance" DECIMAL(14,2) NOT NULL,
    "max_balance" DECIMAL(14,2),
    "interest_rate" DECIMAL(6,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_interest_rate_tier" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_interest_accrual" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "accrual_date" TIMESTAMP(3) NOT NULL,
    "balance_used" DECIMAL(14,2) NOT NULL,
    "rate_applied" DECIMAL(6,3) NOT NULL,
    "method" TEXT NOT NULL,
    "amount_accrued" DECIMAL(14,2) NOT NULL,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "posting_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_savings_interest_accrual" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_interest_posting" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "transaction_id" TEXT,
    "batch_id" TEXT,
    "posted_by_id" TEXT NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_id" TEXT,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_savings_interest_posting" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."account_holder" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "role" "nexus"."AccountHolderRole" NOT NULL,
    "loan_id" TEXT,
    "savings_account_id" TEXT,
    "added_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_account_holder" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."document" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "document_name" TEXT NOT NULL,
    "document_type" "nexus"."DocumentType" NOT NULL,
    "category" TEXT,
    "storage_reference" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "expiry_date" TIMESTAMP(3),
    "status" "nexus"."DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploaded_by_id" TEXT,
    "replaces_document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_document" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."savings_transaction" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" "nexus"."SavingsTxnType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_savings_transaction" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."refresh_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_refresh_token" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."audit_log" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_audit_log" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_branch_institution_id_code" ON "nexus"."branch"("institution_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "user_invite_token_key" ON "nexus"."user"("invite_token");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_institution_id_email" ON "nexus"."user"("institution_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_institution_id_name" ON "nexus"."role"("institution_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "nexus"."permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_permission_role_id_permission_id" ON "nexus"."role_permission"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_role_user_id_role_id_branch_id" ON "nexus"."user_role"("user_id", "role_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_user_id_key" ON "nexus"."employee"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_employee_institution_id_email" ON "nexus"."employee"("institution_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_employee_institution_id_employee_number" ON "nexus"."employee"("institution_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_customer_institution_id_phone" ON "nexus"."customer"("institution_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "product_current_version_id_key" ON "nexus"."product"("current_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_institution_id_code" ON "nexus"."product"("institution_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_version_product_id_version_number" ON "nexus"."product_version"("product_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_loan_installment_loan_id_installment_number" ON "nexus"."loan_installment"("loan_id", "installment_number");

-- CreateIndex
CREATE UNIQUE INDEX "savings_account_account_number_key" ON "nexus"."savings_account"("account_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_savings_interest_accrual_account_id_accrual_date" ON "nexus"."savings_interest_accrual"("account_id", "accrual_date");

-- CreateIndex
CREATE UNIQUE INDEX "document_replaces_document_id_key" ON "nexus"."document"("replaces_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "nexus"."refresh_token"("token_hash");

-- AddForeignKey
ALTER TABLE "nexus"."branch" ADD CONSTRAINT "fk_branch_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user" ADD CONSTRAINT "fk_user_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."role" ADD CONSTRAINT "fk_role_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."role_permission" ADD CONSTRAINT "fk_role_permission_role" FOREIGN KEY ("role_id") REFERENCES "nexus"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."role_permission" ADD CONSTRAINT "fk_role_permission_permission" FOREIGN KEY ("permission_id") REFERENCES "nexus"."permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_role" ADD CONSTRAINT "fk_user_role_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_role" ADD CONSTRAINT "fk_user_role_role" FOREIGN KEY ("role_id") REFERENCES "nexus"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_role" ADD CONSTRAINT "fk_user_role_branch" FOREIGN KEY ("branch_id") REFERENCES "nexus"."branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employee" ADD CONSTRAINT "fk_employee_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employee" ADD CONSTRAINT "fk_employee_branch" FOREIGN KEY ("branch_id") REFERENCES "nexus"."branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employee" ADD CONSTRAINT "fk_employee_reporting_manager" FOREIGN KEY ("reporting_manager_id") REFERENCES "nexus"."employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employee" ADD CONSTRAINT "fk_employee_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer" ADD CONSTRAINT "fk_customer_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer" ADD CONSTRAINT "fk_customer_branch" FOREIGN KEY ("branch_id") REFERENCES "nexus"."branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."next_of_kin" ADD CONSTRAINT "fk_next_of_kin_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customer_note" ADD CONSTRAINT "fk_customer_note_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."beneficiary" ADD CONSTRAINT "fk_beneficiary_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."beneficial_owner" ADD CONSTRAINT "fk_beneficial_owner_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."watchlist_entry" ADD CONSTRAINT "fk_watchlist_entry_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."approval_request" ADD CONSTRAINT "fk_approval_request_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."product" ADD CONSTRAINT "fk_product_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."product" ADD CONSTRAINT "fk_product_current_version" FOREIGN KEY ("current_version_id") REFERENCES "nexus"."product_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."product_version" ADD CONSTRAINT "fk_product_version_product" FOREIGN KEY ("product_id") REFERENCES "nexus"."product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan" ADD CONSTRAINT "fk_loan_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan" ADD CONSTRAINT "fk_loan_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan" ADD CONSTRAINT "fk_loan_branch" FOREIGN KEY ("branch_id") REFERENCES "nexus"."branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan" ADD CONSTRAINT "fk_loan_product_version" FOREIGN KEY ("product_version_id") REFERENCES "nexus"."product_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan_repayment" ADD CONSTRAINT "fk_loan_repayment_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."loan_installment" ADD CONSTRAINT "fk_loan_installment_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_account" ADD CONSTRAINT "fk_savings_account_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_account" ADD CONSTRAINT "fk_savings_account_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_account" ADD CONSTRAINT "fk_savings_account_branch" FOREIGN KEY ("branch_id") REFERENCES "nexus"."branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_account" ADD CONSTRAINT "fk_savings_account_product_version" FOREIGN KEY ("product_version_id") REFERENCES "nexus"."product_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."interest_rate_tier" ADD CONSTRAINT "fk_interest_rate_tier_product_version" FOREIGN KEY ("product_version_id") REFERENCES "nexus"."product_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_interest_accrual" ADD CONSTRAINT "fk_savings_interest_accrual_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_interest_accrual" ADD CONSTRAINT "fk_savings_interest_accrual_account" FOREIGN KEY ("account_id") REFERENCES "nexus"."savings_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_interest_posting" ADD CONSTRAINT "fk_savings_interest_posting_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_interest_posting" ADD CONSTRAINT "fk_savings_interest_posting_account" FOREIGN KEY ("account_id") REFERENCES "nexus"."savings_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."account_holder" ADD CONSTRAINT "fk_account_holder_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."account_holder" ADD CONSTRAINT "fk_account_holder_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."account_holder" ADD CONSTRAINT "fk_account_holder_loan" FOREIGN KEY ("loan_id") REFERENCES "nexus"."loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."account_holder" ADD CONSTRAINT "fk_account_holder_savings_account" FOREIGN KEY ("savings_account_id") REFERENCES "nexus"."savings_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."document" ADD CONSTRAINT "fk_document_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."document" ADD CONSTRAINT "fk_document_customer" FOREIGN KEY ("customer_id") REFERENCES "nexus"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."document" ADD CONSTRAINT "fk_document_replaces_document" FOREIGN KEY ("replaces_document_id") REFERENCES "nexus"."document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."savings_transaction" ADD CONSTRAINT "fk_savings_transaction_account" FOREIGN KEY ("account_id") REFERENCES "nexus"."savings_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."refresh_token" ADD CONSTRAINT "fk_refresh_token_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."audit_log" ADD CONSTRAINT "fk_audit_log_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."audit_log" ADD CONSTRAINT "fk_audit_log_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
