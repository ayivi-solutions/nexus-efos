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
CREATE TYPE "nexus"."CustomerSegment" AS ENUM ('INDIVIDUAL', 'BUSINESS', 'FARMER_GROUP', 'WOMENS_GROUP', 'YOUTH', 'CORPORATE');

-- CreateEnum
CREATE TYPE "nexus"."LifecycleStage" AS ENUM ('AWARENESS', 'ACQUISITION', 'ONBOARDING', 'ACTIVATION', 'GROWTH', 'RETENTION', 'ADVOCACY', 'RE_ENGAGEMENT');

-- CreateEnum
CREATE TYPE "nexus"."KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "nexus"."institutions" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT,
    "type" "nexus"."InstitutionType" NOT NULL,
    "status" "nexus"."InstitutionStatus" NOT NULL DEFAULT 'PENDING_ONBOARDING',
    "regulatorId" TEXT,
    "country" TEXT NOT NULL DEFAULT 'GH',
    "region" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "onboardingStep" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."branches" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "region" TEXT,
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."users" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "category" "nexus"."UserCategory" NOT NULL DEFAULT 'INTERNAL',
    "status" "nexus"."UserStatus" NOT NULL DEFAULT 'INVITED',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."roles" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "name" TEXT NOT NULL,
    "category" "nexus"."RoleCategory" NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "nexus"."PermissionCategory" NOT NULL,
    "action" "nexus"."PermissionAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "branchId" TEXT,
    "isDelegated" BOOLEAN NOT NULL DEFAULT false,
    "delegatedFromUserId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."customers" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "branchId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "idType" TEXT,
    "idNumber" TEXT,
    "segment" "nexus"."CustomerSegment" NOT NULL DEFAULT 'INDIVIDUAL',
    "lifecycleStage" "nexus"."LifecycleStage" NOT NULL DEFAULT 'ONBOARDING',
    "kycStatus" "nexus"."KycStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."audit_logs" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_institutionId_code_key" ON "nexus"."branches"("institutionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_institutionId_email_key" ON "nexus"."users"("institutionId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_institutionId_name_key" ON "nexus"."roles"("institutionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "nexus"."permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "nexus"."role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_branchId_key" ON "nexus"."user_roles"("userId", "roleId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_institutionId_phone_key" ON "nexus"."customers"("institutionId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "nexus"."refresh_tokens"("tokenHash");

-- AddForeignKey
ALTER TABLE "nexus"."branches" ADD CONSTRAINT "branches_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."users" ADD CONSTRAINT "users_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."roles" ADD CONSTRAINT "roles_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "nexus"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "nexus"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "nexus"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "nexus"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."user_roles" ADD CONSTRAINT "user_roles_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "nexus"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customers" ADD CONSTRAINT "customers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."customers" ADD CONSTRAINT "customers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "nexus"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "nexus"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."audit_logs" ADD CONSTRAINT "audit_logs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "nexus"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
