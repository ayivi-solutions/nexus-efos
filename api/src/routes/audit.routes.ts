import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const auditRouter = Router();
auditRouter.use(requireAuth);

// doc §59 — Audit and Assurance Architecture. Read-only by design: no write/delete endpoints.
auditRouter.get("/", requirePermission("audit.view"), async (req: AuthedRequest, res) => {
  const logs = await prisma.auditLog.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ logs });
});
