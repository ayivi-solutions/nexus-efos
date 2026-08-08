-- CreateEnum
CREATE TYPE "nexus"."MfaMethod" AS ENUM ('TOTP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "nexus"."LoginResult" AS ENUM ('SUCCESS', 'FAILED_PASSWORD', 'FAILED_MFA', 'LOCKED_OUT', 'FAILED_OTHER');

-- AlterTable
ALTER TABLE "nexus"."user" ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_failed_login_at" TIMESTAMP(3),
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_changed_at" TIMESTAMP(3),
ADD COLUMN     "password_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "nexus"."user_mfa" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "method" "nexus"."MfaMethod" NOT NULL DEFAULT 'TOTP',
    "secret_encrypted" TEXT NOT NULL,
    "backup_codes_hashed" TEXT[],
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_user_mfa" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."user_password_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_user_password_history" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."user_device" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "device_name" TEXT,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_user_device" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."user_login_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "result" "nexus"."LoginResult" NOT NULL,
    "failure_reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_user_login_history" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_user_id_key" ON "nexus"."user_mfa"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_password_history_user_created" ON "nexus"."user_password_history"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_device_user_fingerprint" ON "nexus"."user_device"("user_id", "fingerprint");

-- CreateIndex
CREATE INDEX "idx_user_login_history_user_created" ON "nexus"."user_login_history"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "nexus"."user_mfa" ADD CONSTRAINT "fk_user_mfa_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_password_history" ADD CONSTRAINT "fk_user_password_history_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_device" ADD CONSTRAINT "fk_user_device_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_login_history" ADD CONSTRAINT "fk_user_login_history_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
