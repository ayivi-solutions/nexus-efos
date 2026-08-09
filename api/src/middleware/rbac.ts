import { Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./auth";

/**
 * requirePermission("loans.approve")
 *
 * Loads the user's active role assignments (doc §38.12 — expired temporary
 * delegations are excluded automatically since we filter on expiresAt),
 * then checks whether any assigned role grants the given permission code.
 * Optionally scoped to req.params.branchId when present (doc §39.8 —
 * resource-level access).
 */
export function requirePermission(permissionCode: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthenticated" });

    const branchId = req.params.branchId || req.body?.branchId;
    const now = new Date();

    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: req.auth.userId,
        startsAt: { lte: now },
        // GAP-IAM-001 fix: two top-level OR keys in one object literal
        // collide — the branch-scope OR silently overwrote the expiry OR
        // whenever branchId was present, so an expired delegated role
        // scoped to a branch passed every permission check. Both
        // conditions now live inside an explicit AND array, so neither
        // can ever displace the other.
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ...(branchId ? [{ OR: [{ branchId }, { branchId: null }] }] : []),
        ],
      },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });

    const hasPermission = userRoles.some((ur: (typeof userRoles)[number]) =>
      ur.role.rolePermissions.some((rp: (typeof ur.role.rolePermissions)[number]) => rp.permission.code === permissionCode)
    );

    if (!hasPermission) {
      return res.status(403).json({ error: `Missing permission: ${permissionCode}` });
    }

    next();
  };
}
