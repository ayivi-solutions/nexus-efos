import { prisma } from "./prisma";
import { PERMISSION_CATALOG, SYSTEM_ROLE_TEMPLATES } from "../seed-data";

// Runs on every single server boot (see server.ts) — not a manual step
// anyone has to remember. Permission is genuinely fixed here: an
// institution registered before some permission/role existed used to be
// permanently stuck without it, forcing a full re-onboarding just to pick
// up a platform update. Every operation below is a create-if-missing
// upsert or a skipDuplicates createMany, so re-running this on every
// single boot (including ones where nothing changed) is always safe and
// cheap — it never touches a row that's already correct.
export async function syncPermissionsAndRoles() {
  const summary = { newPermissions: 0, newRolesCreated: 0, newRolePermissionLinks: 0, institutionsChecked: 0 };

  // 1. Global Permission catalog — add anything new, never touch existing
  // rows. Permission has no createdAt field of its own, so "new" is
  // determined properly by checking which codes are missing beforehand,
  // not by guessing from a timestamp.
  const existingCodes = new Set((await prisma.permission.findMany({ select: { code: true } })).map((p) => p.code));
  for (const p of PERMISSION_CATALOG) {
    if (!existingCodes.has(p.code)) {
      await prisma.permission.create({
        data: { code: p.code, category: p.category as any, action: p.action as any, resource: p.resource, description: p.description },
      });
      summary.newPermissions++;
    }
  }

  const allPermissions = await prisma.permission.findMany();
  const permIdByCode: Record<string, string> = {};
  for (const p of allPermissions) permIdByCode[p.code] = p.id;

  // 2. Every existing institution gets any missing system role created,
  // and every missing role-permission link added — for roles that already
  // existed too, not just brand new ones. This is what actually closes
  // the original gap: an institution registered before data.migrate
  // existed gets it retroactively granted to whichever roles should have
  // it, without anyone re-registering anything.
  const institutions = await prisma.institution.findMany({ select: { id: true } });
  summary.institutionsChecked = institutions.length;

  for (const institution of institutions) {
    const existingRoles = await prisma.role.findMany({
      where: { institutionId: institution.id, isSystem: true },
      include: { rolePermissions: true },
    });
    const roleByName: Record<string, (typeof existingRoles)[number]> = {};
    for (const r of existingRoles) roleByName[r.name] = r;

    for (const tmpl of SYSTEM_ROLE_TEMPLATES) {
      let role = roleByName[tmpl.name];
      if (!role) {
        role = await prisma.role.create({
          data: { institutionId: institution.id, name: tmpl.name, category: tmpl.category as any, description: tmpl.description, isSystem: true },
          include: { rolePermissions: true },
        });
        summary.newRolesCreated++;
      }

      const grantedCodes = new Set(role.rolePermissions.map((rp) => allPermissions.find((p) => p.id === rp.permissionId)?.code));
      const missingCodes = tmpl.permissionCodes.filter((code) => !grantedCodes.has(code));
      if (missingCodes.length > 0) {
        await prisma.rolePermission.createMany({
          data: missingCodes.map((code) => ({ roleId: role!.id, permissionId: permIdByCode[code] })).filter((r) => r.permissionId),
          skipDuplicates: true,
        });
        summary.newRolePermissionLinks += missingCodes.length;
      }
    }
  }

  return summary;
}
