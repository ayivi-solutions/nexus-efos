/*
  Warnings:

  - A unique constraint covering the columns `[customer_number]` on the table `customer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "nexus"."customer" ADD COLUMN     "address" TEXT,
ADD COLUMN     "customer_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customer_customer_number_key" ON "nexus"."customer"("customer_number");
