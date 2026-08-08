-- AlterTable
ALTER TABLE "nexus"."role" ADD COLUMN     "require_mfa" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "nexus"."user_device" ADD COLUMN     "trusted_until" TIMESTAMP(3);
