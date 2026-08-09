import "dotenv/config";
import { validateProductionSecrets } from "./lib/startupSecrets";

// GAP-SEC-001: runs before anything else touches a secret, and before
// app.listen() — a misconfigured production deploy fails immediately
// instead of silently accepting traffic with weak or default secrets.
validateProductionSecrets();

import { app } from "./app";
import { syncPermissionsAndRoles } from "./lib/syncPermissionsAndRoles";
import { startScheduler } from "./lib/scheduler";

const port = Number(process.env.PORT || 4100);

// Runs before the server starts accepting traffic on every single boot —
// not a manual step, not something anyone has to remember after a deploy.
// Fully idempotent; safe even on a boot where nothing actually changed.
syncPermissionsAndRoles()
  .then((summary) => {
    console.log(
      `permission/role sync: ${summary.institutionsChecked} institution(s) checked, ` +
        `${summary.newPermissions} new permission(s), ${summary.newRolesCreated} new role(s), ` +
        `${summary.newRolePermissionLinks} new role-permission link(s)`
    );
  })
  .catch((err) => {
    console.error("permission/role sync failed — starting anyway, but permissions may be stale:", err);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`nexus-efos api listening on :${port}`);
      startScheduler();
    });
  });
