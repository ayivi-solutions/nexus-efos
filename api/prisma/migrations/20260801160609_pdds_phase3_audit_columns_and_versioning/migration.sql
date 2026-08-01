-- CreateEnum
CREATE TYPE "nexus"."RecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- AlterTable
ALTER TABLE "nexus"."account_holder" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."approval_request" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."audit_log" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."beneficial_owner" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."beneficiary" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."branch" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."customer" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."customer_note" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."document" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."employee" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."institution" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."interest_rate_tier" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."loan" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."loan_installment" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."loan_repayment" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."next_of_kin" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."permission" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."product" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."product_version" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "effective_to" TIMESTAMP(3),
ADD COLUMN     "product_category" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."refresh_token" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."role" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."role_permission" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."savings_account" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."savings_interest_accrual" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."savings_interest_posting" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."savings_transaction" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."user" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."user_role" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "nexus"."watchlist_entry" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;
