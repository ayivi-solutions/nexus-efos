// EFS §249 External Service Connectors — SMS/Email Providers named as
// required categories, no vendor. GM chose Resend (email), Hubtel (SMS),
// Meta WhatsApp Cloud API directly (Hubtel's WhatsApp offering isn't in
// their public docs the way SMS is — Meta's Cloud API is the
// well-documented, standard path underneath virtually every WhatsApp
// Business integration). Endpoint/auth shapes below were verified via
// each provider's current public documentation before writing this file
// — Resend and Hubtel with high confidence (extensive public docs,
// community SDKs, and documented FAQ migration notes); Meta's Cloud API
// likewise well-documented. §249.3's business rules — connectors
// configurable, credentials encrypted, failures generate alerts, every
// transaction audited — are enforced structurally: config lives in
// NotificationProviderConfig with encrypted credentials, every send
// attempt (success or failure) is logged to Notification, and a failure
// writes an AuditLog entry too, not just the Notification row.
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./security";

// ---------------------------------------------------------------------
// Provider config — encrypted credential storage/retrieval
// ---------------------------------------------------------------------

export type ProviderCredentials = Record<string, string>;

export async function getProviderConfig(institutionId: string, channel: "SMS" | "EMAIL" | "WHATSAPP") {
  const config = await prisma.notificationProviderConfig.findUnique({
    where: { institutionId_channel: { institutionId, channel } },
  });
  if (!config || !config.active) return null;
  return { ...config, credentials: JSON.parse(decryptSecret(config.credentialsEncrypted)) as ProviderCredentials };
}

export function encryptCredentials(credentials: ProviderCredentials): string {
  return encryptSecret(JSON.stringify(credentials));
}

// ---------------------------------------------------------------------
// Resend — POST https://api.resend.com/emails, Bearer auth.
// https://resend.com/docs/api-reference/emails/send-email
// ---------------------------------------------------------------------

async function sendViaResend(credentials: ProviderCredentials, senderId: string | null, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: senderId || "onboarding@resend.dev", to: [to], subject, html }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Resend returned ${res.status}`);
  return { providerMessageId: body.id as string };
}

// ---------------------------------------------------------------------
// Hubtel Quick Send SMS — POST https://smsc.hubtel.com/v1/messages/send
// (the FAQ-documented current endpoint, migrated from api.hubtel.com/
// api.smsgh.com), Basic Auth + query params, both together per Hubtel's
// own documented example.
// https://help.hubtel.com/hubtel-for-developers/sms-api/send-sms-messages-with-quick-send-api
// ---------------------------------------------------------------------

async function sendViaHubtel(credentials: ProviderCredentials, senderId: string | null, to: string, message: string) {
  const params = new URLSearchParams({
    clientid: credentials.clientId,
    clientsecret: credentials.clientSecret,
    from: senderId || credentials.clientId,
    to,
    content: message,
  });
  const basicAuth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const res = await fetch(`https://smsc.hubtel.com/v1/messages/send?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  const body: any = await res.json().catch(() => ({}));
  // Hubtel returns HTTP 200 with a status field even for some failures —
  // status 0 means "request submitted successfully" per their docs.
  if (!res.ok || body.status !== 0) throw new Error(body.statusDescription || `Hubtel returned ${res.status}`);
  return { providerMessageId: body.messageId as string };
}

// ---------------------------------------------------------------------
// Meta WhatsApp Cloud API — POST https://graph.facebook.com/v23.0/
// {PHONE_NUMBER_ID}/messages, Bearer auth. Business-initiated messages
// outside a live 24h customer-service window require a pre-approved
// template (name + language) — free-form text only works inside that
// window. This platform always sends via template for that reason;
// templates must be created and approved in Meta's WhatsApp Manager
// before use, a real setup step on GM's side per message type.
// https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/
// ---------------------------------------------------------------------

async function sendViaMetaWhatsapp(
  credentials: ProviderCredentials,
  senderId: string | null,
  to: string,
  templateName: string,
  templateLanguage: string,
  templateParams: string[]
) {
  const phoneNumberId = senderId || credentials.phoneNumberId;
  const res = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
        ...(templateParams.length > 0
          ? { components: [{ type: "body", parameters: templateParams.map((p) => ({ type: "text", text: p })) }] }
          : {}),
      },
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `Meta WhatsApp API returned ${res.status}`);
  return { providerMessageId: body.messages?.[0]?.id as string };
}

// ---------------------------------------------------------------------
// Unified send functions — every call, success or failure, is logged to
// Notification; a failure also writes an AuditLog entry (§249.3
// "connection failures generate alerts"). Never throws to the caller —
// a notification failure should not fail the business action that
// triggered it (e.g. resolving a complaint still succeeds even if the
// SMS to the customer fails to send).
// ---------------------------------------------------------------------

interface SendResult {
  sent: boolean;
  notificationId: string;
  error?: string;
}

async function recordAndAlert(
  institutionId: string,
  channel: "SMS" | "EMAIL" | "WHATSAPP",
  recipient: string,
  body: string,
  opts: {
    subject?: string;
    templateName?: string;
    templateLanguage?: string;
    relatedResourceType?: string;
    relatedResourceId?: string;
    sentById?: string;
  },
  send: () => Promise<{ providerMessageId?: string }>
): Promise<SendResult> {
  try {
    const result = await send();
    const notification = await prisma.notification.create({
      data: {
        institutionId, channel, recipient, body,
        subject: opts.subject, templateName: opts.templateName, templateLanguage: opts.templateLanguage,
        status: "SENT", providerMessageId: result.providerMessageId,
        relatedResourceType: opts.relatedResourceType, relatedResourceId: opts.relatedResourceId,
        sentById: opts.sentById,
      },
    });
    return { sent: true, notificationId: notification.id };
  } catch (err: any) {
    const errorMessage = err.message || "Unknown error";
    const notification = await prisma.notification.create({
      data: {
        institutionId, channel, recipient, body,
        subject: opts.subject, templateName: opts.templateName, templateLanguage: opts.templateLanguage,
        status: "FAILED", errorMessage,
        relatedResourceType: opts.relatedResourceType, relatedResourceId: opts.relatedResourceId,
        sentById: opts.sentById,
      },
    });
    await prisma.auditLog.create({
      data: { institutionId, action: "notification.failed", resource: "notification", resourceId: notification.id, metadata: { channel, recipient, error: errorMessage } },
    });
    return { sent: false, notificationId: notification.id, error: errorMessage };
  }
}

export async function sendEmail(
  institutionId: string,
  to: string,
  subject: string,
  html: string,
  opts: { relatedResourceType?: string; relatedResourceId?: string; sentById?: string } = {}
): Promise<SendResult> {
  const config = await getProviderConfig(institutionId, "EMAIL");
  if (!config) return { sent: false, notificationId: "", error: "No active email provider configured for this institution" };
  return recordAndAlert(institutionId, "EMAIL", to, html, { subject, ...opts }, () =>
    sendViaResend(config.credentials, config.senderId, to, subject, html)
  );
}

export async function sendSms(
  institutionId: string,
  to: string,
  message: string,
  opts: { relatedResourceType?: string; relatedResourceId?: string; sentById?: string } = {}
): Promise<SendResult> {
  const config = await getProviderConfig(institutionId, "SMS");
  if (!config) return { sent: false, notificationId: "", error: "No active SMS provider configured for this institution" };
  return recordAndAlert(institutionId, "SMS", to, message, opts, () =>
    sendViaHubtel(config.credentials, config.senderId, to, message)
  );
}

export async function sendWhatsapp(
  institutionId: string,
  to: string,
  templateName: string,
  templateLanguage: string,
  templateParams: string[],
  humanReadableBody: string,
  opts: { relatedResourceType?: string; relatedResourceId?: string; sentById?: string } = {}
): Promise<SendResult> {
  const config = await getProviderConfig(institutionId, "WHATSAPP");
  if (!config) return { sent: false, notificationId: "", error: "No active WhatsApp provider configured for this institution" };
  return recordAndAlert(
    institutionId, "WHATSAPP", to, humanReadableBody,
    { templateName, templateLanguage, ...opts },
    () => sendViaMetaWhatsapp(config.credentials, config.senderId, to, templateName, templateLanguage, templateParams)
  );
}
