import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const institutionRouter = Router();
institutionRouter.use(requireAuth);

institutionRouter.get("/me", async (req: AuthedRequest, res) => {
  const institution = await prisma.institution.findUnique({
    where: { id: req.auth!.institutionId },
    include: { branches: true },
  });
  res.json({ institution });
});

// Branch directory (post-onboarding management, doc §36)
institutionRouter.get("/branches", requirePermission("branches.administer"), async (req: AuthedRequest, res) => {
  const branches = await prisma.branch.findMany({
    where: { institutionId: req.auth!.institutionId },
    orderBy: { name: "asc" },
  });
  res.json({ branches });
});

const newBranchSchema = z.object({ name: z.string().min(1), code: z.string().min(1), region: z.string().optional() });

institutionRouter.post("/branches", requirePermission("branches.administer"), async (req: AuthedRequest, res) => {
  const parsed = newBranchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const branch = await prisma.branch.create({
    data: { institutionId: req.auth!.institutionId, ...parsed.data },
  });
  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "branch.create",
      resource: "branch",
      resourceId: branch.id,
    },
  });
  res.status(201).json({ branch });
});

// Staff directory (doc §38 — needed to see who can be assigned roles)
institutionRouter.get("/users", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const users = await prisma.user.findMany({
    where: { institutionId: req.auth!.institutionId },
    select: {
      id: true,
      fullName: true,
      email: true,
      status: true,
      userRoles: { include: { role: true, branch: true } },
    },
    orderBy: { fullName: "asc" },
  });
  res.json({ users });
});

// Step 2 — institutional details (regulator ID, region, contact)
const detailsSchema = z.object({
  regulatorId: z.string().optional(),
  region: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

institutionRouter.patch(
  "/onboarding/details",
  requirePermission("institution.configure"),
  async (req: AuthedRequest, res) => {
    const parsed = detailsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const institution = await prisma.institution.update({
      where: { id: req.auth!.institutionId },
      data: { ...parsed.data, onboardingStep: 3 },
    });
    res.json({ institution, nextStep: "onboarding-branches" });
  }
);

// Step 3 — additional branches
const branchSchema = z.object({ name: z.string().min(1), code: z.string().min(1), region: z.string().optional() });

institutionRouter.post(
  "/onboarding/branches",
  requirePermission("branches.administer"),
  async (req: AuthedRequest, res) => {
    const parsed = branchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const branch = await prisma.branch.create({
      data: { institutionId: req.auth!.institutionId, ...parsed.data },
    });
    await prisma.institution.update({
      where: { id: req.auth!.institutionId },
      data: { onboardingStep: 4 },
    });
    res.status(201).json({ branch, nextStep: "onboarding-staff" });
  }
);

// Step 4 — invite staff (creates user with INVITED status; no password yet)
const inviteSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  roleId: z.string(),
  branchId: z.string().optional(),
});

institutionRouter.post(
  "/onboarding/staff",
  requirePermission("users.administer"),
  async (req: AuthedRequest, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { fullName, email, roleId, branchId } = parsed.data;

    // Bootstrapping path (institution has no employees yet during setup) —
    // creates the Employee master record and the System User together,
    // rather than requiring an Employee to already exist (doc §50.5).
    const user = await prisma.user.create({
      data: {
        institutionId: req.auth!.institutionId,
        fullName,
        email,
        passwordHash: "", // set on invite acceptance
        status: "INVITED",
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId, branchId } });
    await prisma.employee.create({
      data: { institutionId: req.auth!.institutionId, fullName, email, branchId, userId: user.id },
    });

    res.status(201).json({ user });
  }
);

// Step 5 — go live
institutionRouter.post(
  "/onboarding/go-live",
  requirePermission("institution.configure"),
  async (req: AuthedRequest, res) => {
    const institution = await prisma.institution.update({
      where: { id: req.auth!.institutionId },
      data: { onboardingStep: 5, status: "ACTIVE" },
    });
    await prisma.auditLog.create({
      data: { institutionId: institution.id, userId: req.auth!.userId, action: "institution.go_live" },
    });
    res.json({ institution });
  }
);
