import { prisma } from "./lib/prisma";
import { PERMISSION_CATALOG } from "./seed-data";

async function main() {
  console.log(`Seeding ${PERMISSION_CATALOG.length} permissions...`);
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { category: p.category, action: p.action, resource: p.resource, description: p.description },
      create: p,
    });
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
