-- CreateEnum
CREATE TYPE "nexus"."CashFlowActivity" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING');

-- AlterTable
ALTER TABLE "nexus"."gl_account" ADD COLUMN     "cash_flow_activity" "nexus"."CashFlowActivity",
ADD COLUMN     "is_liquid_asset" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_volatile_liability" BOOLEAN NOT NULL DEFAULT false;
