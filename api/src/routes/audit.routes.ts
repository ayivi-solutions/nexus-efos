import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const auditRouter = Router();
auditRouter.use(requireAuth);

// doc §59 — Audit and Assurance Architecture. Read-only by design: no
// write/delete endpoints. §15.5: "audit records shall be searchable."
auditRouter.get("/", requirePermission("audit.view"), async (req: AuthedRequest, res) => {
  const { userId, action, from, to } = req.query as { userId?: string; action?: string; from?: string; to?: string };
  const logs = await prisma.auditLog.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(userId ? { userId } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...((from || to) ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({ logs });
});
