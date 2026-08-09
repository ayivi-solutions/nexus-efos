-- AlterTable
ALTER TABLE "nexus"."refresh_token" ADD COLUMN     "family_id" TEXT NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "replaced_by_token_id" TEXT;

-- CreateTable
CREATE TABLE "nexus"."demo_link_token" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "pk_demo_link_token" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_link_token_token_hash_key" ON "nexus"."demo_link_token"("token_hash");

-- AddForeignKey
ALTER TABLE "nexus"."demo_link_token" ADD CONSTRAINT "fk_demo_link_token_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."demo_link_token" ADD CONSTRAINT "fk_demo_link_token_user" FOREIGN KEY ("user_id") REFERENCES "nexus"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
