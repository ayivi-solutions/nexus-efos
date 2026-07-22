import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const watchlistRouter = Router();
watchlistRouter.use(requireAuth);

watchlistRouter.get("/", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const entries = await prisma.watchlistEntry.findMany({
    where: { institutionId: req.auth!.institutionId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ entries });
});

const createSchema = z.object({ fullName: z.string().min(2), idNumber: z.string().optional(), reason: z.string().optional() });

watchlistRouter.post("/", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entry = await prisma.watchlistEntry.create({
    data: { institutionId: req.auth!.institutionId, addedById: req.auth!.userId, ...parsed.data },
  });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "watchlist.add", resource: "watchlist_entry", resourceId: entry.id },
  });
  res.status(201).json({ entry });
});

watchlistRouter.delete("/:id", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  await prisma.watchlistEntry.deleteMany({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "watchlist.remove", resource: "watchlist_entry", resourceId: req.params.id },
  });
  res.status(204).send();
});
