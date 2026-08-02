import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { RuleCondition, RuleAction } from "../lib/businessRules";

// doc §41 Business Rules Framework. Activation goes through the same
// generic Approval Workflow every other high-stakes action in this app
// uses (§41.6's "Review"/"Approval" lifecycle stages) — a rule cannot
// take effect against real loans without a different authorised user
// approving it than whoever wrote it.
export const businessRulesRouter = Router();
businessRulesRouter.use(requireAuth);

const CATEGORIES = ["VALIDATION", "ELIGIBILITY", "CALCULATION", "APPROVAL", "COMPLIANCE", "NOTIFICATION"];
const TRIGGER_POINTS = ["LOAN_INITIATION", "LOAN_APPROVAL", "SAVINGS_ACCOUNT_OPENING", "CUSTOMER_CREATION"];
const OPERATORS = ["EQUALS", "NOT_EQUALS", "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL", "CONTAINS"];
const ACTION_TYPES = ["FLAG", "REQUIRE_ADDITIONAL_APPROVAL", "REJECT"];

const conditionSchema = z.object({ field: z.string().min(1), operator: z.enum(OPERATORS as [string, ...string[]]), value: z.union([z.string(), z.number()]) });
const actionSchema = z.object({ type: z.enum(ACTION_TYPES as [string, ...string[]]), message: z.string().optional() });

const ruleSchema = z.object({
  name: z.string().min(2),
  businessPurpose: z.string().optional(),
  description: z.string().optional(),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  triggerPoint: z.enum(TRIGGER_POINTS as [string, ...string[]]),
  conditions: z.array(conditionSchema).min(1),
  conditionLogic: z.enum(["ALL", "ANY"]).default("ALL"),
  actions: z.array(actionSchema).min(1),
  priority: z.number().int().default(100),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
});

function generateRuleCode(existingCount: number) {
  return "BR-" + String(existingCount + 1).padStart(3, "0");
}

businessRulesRouter.get("/", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const rules = await prisma.businessRule.findMany({
    where: { institutionId: req.auth!.institutionId },
    orderBy: [{ status: "asc" }, { priority: "asc" }],
  });
  res.json({ rules });
});

businessRulesRouter.get("/:id", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const rule = await prisma.businessRule.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!rule) return res.status(404).json({ error: "Rule not found" });
  res.json({ rule });
});

businessRulesRouter.post("/", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const count = await prisma.businessRule.count({ where: { institutionId: req.auth!.institutionId } });

  const rule = await prisma.businessRule.create({
    data: {
      institutionId: req.auth!.institutionId,
      ruleCode: generateRuleCode(count),
      name: parsed.data.name,
      businessPurpose: parsed.data.businessPurpose,
      description: parsed.data.description,
      category: parsed.data.category as any,
      triggerPoint: parsed.data.triggerPoint as any,
      conditions: parsed.data.conditions as any,
      conditionLogic: parsed.data.conditionLogic,
      actions: parsed.data.actions as any,
      priority: parsed.data.priority,
      effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : null,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      status: "DRAFT",
      businessOwnerId: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "business_rule.create", resource: "business_rule", resourceId: rule.id },
  });

  res.status(201).json({ rule });
});

// Editing is only permitted for DRAFT rules — an ACTIVE rule's logic can't
// silently change underneath a business owner who approved a specific
// version. Change an active rule by retiring it and creating a new one.
businessRulesRouter.patch("/:id", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = ruleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.businessRule.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Rule not found" });
  if (existing.status !== "DRAFT") return res.status(400).json({ error: "Only DRAFT rules can be edited — retire this rule and create a new one instead" });

  const rule = await prisma.businessRule.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      category: parsed.data.category as any,
      triggerPoint: parsed.data.triggerPoint as any,
      conditions: parsed.data.conditions as any,
      actions: parsed.data.actions as any,
      effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : undefined,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : undefined,
    },
  });

  res.json({ rule });
});

// §41.6 Approval lifecycle stage — reuses the generic Approval Workflow.
businessRulesRouter.post("/:id/request-activation", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const rule = await prisma.businessRule.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!rule) return res.status(404).json({ error: "Rule not found" });
  if (rule.status !== "DRAFT") return res.status(400).json({ error: `Rule must be DRAFT to request activation (currently ${rule.status})` });

  const approval = await prisma.approvalRequest.create({
    data: {
      institutionId: req.auth!.institutionId, type: "BUSINESS_RULE_ACTIVATION", targetType: "BusinessRule", targetId: rule.id,
      payload: {}, reason: `Activate business rule ${rule.ruleCode}: ${rule.name}`, requestedById: req.auth!.userId,
    },
  });
  await prisma.businessRule.update({ where: { id: rule.id }, data: { status: "PENDING_APPROVAL" } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "business_rule.activation_requested", resource: "business_rule", resourceId: rule.id, metadata: { approvalRequestId: approval.id } },
  });

  res.status(202).json({ pendingApproval: true, approvalRequestId: approval.id });
});

businessRulesRouter.post("/:id/retire", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const rule = await prisma.businessRule.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "RETIRED" },
  });
  if (rule.count === 0) return res.status(404).json({ error: "Rule not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "business_rule.retire", resource: "business_rule", resourceId: req.params.id },
  });
  res.json({ ok: true });
});
