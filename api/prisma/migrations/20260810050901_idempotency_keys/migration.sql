-- CreateTable
CREATE TABLE "nexus"."idempotency_key" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "pk_idempotency_key" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_idempotency_key_institution_user_endpoint_key" ON "nexus"."idempotency_key"("institution_id", "user_id", "endpoint", "key");

-- AddForeignKey
ALTER TABLE "nexus"."idempotency_key" ADD CONSTRAINT "fk_idempotency_key_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
