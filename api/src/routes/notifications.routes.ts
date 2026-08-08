import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { encryptCredentials, sendEmail, sendSms, sendWhatsapp } from "../lib/notifications";

// EFS §249 External Service Connectors. See lib/notifications.ts for the
// actual send implementations and the reasoning behind the three
// provider choices.
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// Credentials never returned to the frontend once saved — only whether
// a channel is configured, by whom, and when. Re-saving replaces the
// whole credential set; there's no partial-update-a-secret-field flow,
// same reasoning as any other secret in this codebase.
notificationsRouter.get("/config", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const configs = await prisma.notificationProviderConfig.findMany({
    where: { institutionId: req.auth!.institutionId },
    select: { id: true, channel: true, provider: true, senderId: true, active: true, createdAt: true, updatedAt: true },
  });
  res.json({ configs });
});

const setConfigSchema = z.object({
  channel: z.enum(["SMS", "EMAIL", "WHATSAPP"]),
  provider: z.string().min(1),
  credentials: z.record(z.string()),
  senderId: z.string().optional(),
});

notificationsRouter.post("/config", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = setConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const config = await prisma.notificationProviderConfig.upsert({
    where: { institutionId_channel: { institutionId: req.auth!.institutionId, channel: parsed.data.channel } },
    create: {
      institutionId: req.auth!.institutionId,
      channel: parsed.data.channel,
      provider: parsed.data.provider,
      credentialsEncrypted: encryptCredentials(parsed.data.credentials),
      senderId: parsed.data.senderId,
    },
    update: {
      provider: parsed.data.provider,
      credentialsEncrypted: encryptCredentials(parsed.data.credentials),
      senderId: parsed.data.senderId,
      active: true,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "notification_config.set", resource: "notification_provider_config", resourceId: config.id, metadata: { channel: parsed.data.channel, provider: parsed.data.provider } },
  });

  res.status(201).json({ id: config.id, channel: config.channel, provider: config.provider, senderId: config.senderId, active: config.active });
});

notificationsRouter.post("/config/:id/deactivate", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const config = await prisma.notificationProviderConfig.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!config) return res.status(404).json({ error: "Config not found" });
  const updated = await prisma.notificationProviderConfig.update({ where: { id: config.id }, data: { active: false } });
  res.json({ id: updated.id, active: updated.active });
});

// Sends one real message against the saved config — the practical way
// to confirm credentials actually work before relying on them for a
// real customer communication.
const testSchema = z.object({
  channel: z.enum(["SMS", "EMAIL", "WHATSAPP"]),
  to: z.string().min(1),
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
});

notificationsRouter.post("/test", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { channel, to } = parsed.data;

  let result;
  if (channel === "EMAIL") {
    result = await sendEmail(req.auth!.institutionId, to, "Nexus EFOS — test notification", "<p>This is a test notification from Nexus EFOS.</p>", { sentById: req.auth!.userId });
  } else if (channel === "SMS") {
    result = await sendSms(req.auth!.institutionId, to, "Nexus EFOS test notification: this channel is working.", { sentById: req.auth!.userId });
  } else {
    if (!parsed.data.templateName || !parsed.data.templateLanguage) {
      return res.status(400).json({ error: "WhatsApp test requires templateName and templateLanguage — a pre-approved template in Meta's WhatsApp Manager" });
    }
    result = await sendWhatsapp(req.auth!.institutionId, to, parsed.data.templateName, parsed.data.templateLanguage, [], "Test notification", { sentById: req.auth!.userId });
  }

  res.status(result.sent ? 200 : 502).json(result);
});

notificationsRouter.get("/", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { channel, status } = req.query as { channel?: string; status?: string };
  const notifications = await prisma.notification.findMany({
    where: { institutionId: req.auth!.institutionId, ...(channel ? { channel: channel as any } : {}), ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ notifications });
});
