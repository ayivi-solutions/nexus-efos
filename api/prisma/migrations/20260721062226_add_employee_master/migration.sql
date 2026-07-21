-- CreateEnum
CREATE TYPE "nexus"."EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "nexus"."employees" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "branchId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "nexus"."EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "nexus"."employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_institutionId_email_key" ON "nexus"."employees"("institutionId", "email");

-- AddForeignKey
ALTER TABLE "nexus"."employees" ADD CONSTRAINT "employees_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "nexus"."institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "nexus"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "nexus"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
