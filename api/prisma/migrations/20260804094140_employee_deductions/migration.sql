-- CreateTable
CREATE TABLE "nexus"."employee_deduction" (
    "id" TEXT NOT NULL,
    "employee_salary_structure_id" TEXT NOT NULL,
    "deduction_code_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "is_percentage_of_basic" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pk_employee_deduction" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "nexus"."employee_deduction" ADD CONSTRAINT "fk_employee_deduction_salary_structure" FOREIGN KEY ("employee_salary_structure_id") REFERENCES "nexus"."employee_salary_structure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
