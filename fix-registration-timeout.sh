#!/usr/bin/env bash
set -euo pipefail
# Run from ~/Documents/GitHub/nexus-efos, on develop.
# Fixes "Transaction already closed" on institution registration.
# Root cause: 7 sequential tx.permission.findMany() calls (one per seeded
# role) inside the transaction, against the pooled Supabase connection —
# same "fetch reference data once into a Map, never per-row" lesson as
# Kokromoti. Batches into one query + adds a 15s timeout as safety margin.

node << 'NODE_EOF'
const fs = require("fs");
const path = "api/src/routes/auth.routes.ts";
let raw = fs.readFileSync(path, "utf8");
const hadCRLF = raw.includes("\r\n");
let c = raw.replace(/\r\n/g, "\n");

if (c.includes("permIdByCode")) { console.log("Already patched: " + path); process.exit(0); }

const anchor1 = "    // Grant every permission whose code appears in the template's permission list\n" +
"    for (const tmpl of SYSTEM_ROLE_TEMPLATES) {\n" +
"      const roleRecord = roleRecords.find((r) => r.name === tmpl.name)!;\n" +
"      const perms = await tx.permission.findMany({ where: { code: { in: tmpl.permissionCodes } } });\n" +
"      await tx.rolePermission.createMany({\n" +
"        data: perms.map((p: { id: string }) => ({ roleId: roleRecord.id, permissionId: p.id })),\n" +
"        skipDuplicates: true,\n" +
"      });\n" +
"    }";

const repl1 = "    // Fetch every permission ONCE, not per-role (avoids N sequential queries\n" +
"    // inside the transaction against the pooled connection).\n" +
"    const allPermissions = await tx.permission.findMany();\n" +
"    const permIdByCode: Record<string, string> = {};\n" +
"    for (const p of allPermissions) permIdByCode[p.code] = p.id;\n" +
"\n" +
"    const rolePermissionRows: { roleId: string; permissionId: string }[] = [];\n" +
"    for (const tmpl of SYSTEM_ROLE_TEMPLATES) {\n" +
"      const roleRecord = roleRecords.find((r) => r.name === tmpl.name)!;\n" +
"      for (const code of tmpl.permissionCodes) {\n" +
"        const permissionId = permIdByCode[code];\n" +
"        if (permissionId) rolePermissionRows.push({ roleId: roleRecord.id, permissionId });\n" +
"      }\n" +
"    }\n" +
"    await tx.rolePermission.createMany({ data: rolePermissionRows, skipDuplicates: true });";

const count1 = c.split(anchor1).length - 1;
if (count1 !== 1) { console.error("Anchor 1 mismatch (found " + count1 + "). Aborting — file may have diverged."); process.exit(1); }
c = c.replace(anchor1, repl1);

const anchor2 = "    return inst;\n  });";
const count2 = c.split(anchor2).length - 1;
if (count2 !== 1) { console.error("Anchor 2 mismatch (found " + count2 + "). Aborting."); process.exit(1); }
c = c.replace(anchor2, "    return inst;\n  },\n  { timeout: 15000 });");

if (hadCRLF) c = c.replace(/\n/g, "\r\n");
fs.writeFileSync(path, c);
console.log("Patched: " + path);
NODE_EOF

echo ""
echo "== Verifying: API typecheck =="
cd api
npm install --silent
npx tsc --noEmit
cd ..

echo ""
echo "Done. Restart the API (Ctrl+C in that terminal, then npm run dev again"
echo "from api/), then retry registering the institution in the browser."
echo ""
echo "If it works, then:"
echo "  git add -A"
echo "  git commit -m \"Fix registration transaction timeout: batch permission lookup\""
echo "  git push"
