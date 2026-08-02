import { prisma } from "./lib/prisma";
import { syncPermissionsAndRoles } from "./lib/syncPermissionsAndRoles";

// Manual on-demand equivalent of what now also runs automatically on every
// server boot (see server.ts) — kept as a convenience for syncing
// immediately without waiting for/triggering a redeploy, not because
// anyone should need to remember to run this after a code change anymore.
async function main() {
  const summary = await syncPermissionsAndRoles();
  console.log(
    `Sync complete: ${summary.institutionsChecked} institution(s) checked, ` +
      `${summary.newPermissions} new permission(s), ${summary.newRolesCreated} new role(s), ` +
      `${summary.newRolePermissionLinks} new role-permission link(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
