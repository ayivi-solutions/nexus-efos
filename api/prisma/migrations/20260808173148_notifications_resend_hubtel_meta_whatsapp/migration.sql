-- CreateEnum
CREATE TYPE "nexus"."NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "nexus"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "nexus"."notification_provider_config" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "channel" "nexus"."NotificationChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "credentials_encrypted" TEXT NOT NULL,
    "sender_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "record_status" "nexus"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "pk_notification_provider_config" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."notification" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "channel" "nexus"."NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "template_name" TEXT,
    "template_language" TEXT,
    "status" "nexus"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "related_resource_type" TEXT,
    "related_resource_id" TEXT,
    "sent_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_notification" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_notification_provider_config_institution_channel" ON "nexus"."notification_provider_config"("institution_id", "channel");

-- CreateIndex
CREATE INDEX "idx_notification_institution_status" ON "nexus"."notification"("institution_id", "status");

-- CreateIndex
CREATE INDEX "idx_notification_institution_resource" ON "nexus"."notification"("institution_id", "related_resource_type", "related_resource_id");

-- AddForeignKey
ALTER TABLE "nexus"."notification_provider_config" ADD CONSTRAINT "fk_notification_provider_config_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."notification" ADD CONSTRAINT "fk_notification_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
