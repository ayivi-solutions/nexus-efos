-- CreateEnum
CREATE TYPE "nexus"."CollectorAvailability" AS ENUM ('AVAILABLE', 'ON_LEAVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "nexus"."collector" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "availability" "nexus"."CollectorAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "suspended_by_id" TEXT,
    "suspended_at" TIMESTAMP(3),
    "suspended_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_collector" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."collection_route" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "collector_id" TEXT,
    "is_temporary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_collection_route" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."collection_route_customer" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sequence" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "pk_collection_route_customer" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collector_employee_id_key" ON "nexus"."collector"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_collection_route_institution_id_name" ON "nexus"."collection_route"("institution_id", "name");

-- AddForeignKey
ALTER TABLE "nexus"."collector" ADD CONSTRAINT "fk_collector_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."collection_route" ADD CONSTRAINT "fk_collection_route_institution" FOREIGN KEY ("institution_id") REFERENCES "nexus"."institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."collection_route" ADD CONSTRAINT "fk_collection_route_branch" FOREIGN KEY ("branch_id") REFERENCES "nexus"."branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."collection_route" ADD CONSTRAINT "fk_collection_route_collector" FOREIGN KEY ("collector_id") REFERENCES "nexus"."collector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."collection_route_customer" ADD CONSTRAINT "fk_crc_route" FOREIGN KEY ("route_id") REFERENCES "nexus"."collection_route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
