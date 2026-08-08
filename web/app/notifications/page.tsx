"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const CHANNELS = ["SMS", "EMAIL", "WHATSAPP"] as const;

const CHANNEL_INFO: Record<string, { provider: string; fields: { key: string; label: string; placeholder?: string }[]; senderLabel: string; senderPlaceholder: string }> = {
  SMS: { provider: "hubtel", fields: [{ key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client Secret" }], senderLabel: "Sender name", senderPlaceholder: "e.g. NexusEFOS" },
  EMAIL: { provider: "resend", fields: [{ key: "apiKey", label: "API Key", placeholder: "re_..." }], senderLabel: "From address", senderPlaceholder: "notifications@yourdomain.com" },
  WHATSAPP: { provider: "meta_whatsapp", fields: [{ key: "accessToken", label: "Access Token" }], senderLabel: "Phone Number ID", senderPlaceholder: "Meta WhatsApp phone number ID" },
};

export default function NotificationsPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"config" | "log">("config");

  const [configs, setConfigs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, { credentials: Record<string, string>; senderId: string }>>({
    SMS: { credentials: {}, senderId: "" }, EMAIL: { credentials: {}, senderId: "" }, WHATSAPP: { credentials: {}, senderId: "" },
  });
  const [testTo, setTestTo] = useState<Record<string, string>>({});
  const [testTemplate, setTestTemplate] = useState({ name: "", language: "en_US" });

  function load() {
    api.listNotificationConfigs().then((r: any) => setConfigs(r.configs)).catch((e: any) => setError(e.message));
    api.listNotifications().then((r: any) => setNotifications(r.notifications)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function configFor(channel: string) {
    return configs.find((c: any) => c.channel === channel);
  }

  async function handleSaveConfig(channel: string) {
    const info = CHANNEL_INFO[channel];
    const form = forms[channel];
    const missing = info.fields.filter((f) => !form.credentials[f.key]?.trim());
    if (missing.length > 0) {
      setError(`Fill in: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setBusy(channel); setError(null);
    try {
      await api.setNotificationConfig({ channel, provider: info.provider, credentials: form.credentials, senderId: form.senderId || undefined });
      toast.success(`${channel} provider saved.`);
      setForms((f) => ({ ...f, [channel]: { credentials: {}, senderId: "" } }));
      load();
    } catch (err: any) { setError(err.message || "Could not save config"); } finally { setBusy(null); }
  }

  async function handleDeactivate(id: string, channel: string) {
    if (!window.confirm(`Deactivate the ${channel} provider? Notifications on this channel will stop sending until reconfigured.`)) return;
    setBusy(id); setError(null);
    try { await api.deactivateNotificationConfig(id); toast.info(`${channel} deactivated.`); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleTest(channel: string) {
    const to = testTo[channel];
    if (!to) { setError("Enter a recipient to test."); return; }
    setBusy(`test-${channel}`); setError(null);
    try {
      const result = await api.testNotification({
        channel, to,
        ...(channel === "WHATSAPP" ? { templateName: testTemplate.name, templateLanguage: testTemplate.language } : {}),
      });
      if (result.sent) toast.success("Test message sent.");
      else setError(result.error || "Test send failed.");
      load();
    } catch (err: any) { setError(err.message || "Test send failed"); } finally { setBusy(null); }
  }

  return (
    <AppShell active="Notifications">
      <div className="p-5 dt:p-10 max-w-3xl">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Notifications</h1>
        <p className="text-text-muted text-sm mb-6">
          EFS §249 External Service Connectors. Email via Resend, SMS via Hubtel, WhatsApp via Meta&apos;s WhatsApp Cloud API directly (Hubtel&apos;s WhatsApp offering isn&apos;t in their public docs the way SMS is). Credentials are encrypted at rest and never shown again once saved. WhatsApp business-initiated messages require a pre-approved template created in Meta&apos;s WhatsApp Manager — free-form text only works inside a live 24-hour conversation window.
        </p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("config")} className={`btn-text ${tab === "config" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Providers</button>
          <button onClick={() => setTab("log")} className={`btn-text ${tab === "log" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Send Log</button>
        </div>

        {tab === "config" && CHANNELS.map((channel) => {
          const existing = configFor(channel);
          const info = CHANNEL_INFO[channel];
          const form = forms[channel];
          return (
            <div key={channel} className="card p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold text-base text-ink-900">{channel}</h2>
                {existing ? (
                  <span className={`badge ${existing.active ? "bg-green-100 text-green-600" : "bg-text-muted/15 text-text-muted"}`}>
                    {existing.active ? `Active — ${existing.provider}` : "Deactivated"}
                  </span>
                ) : (
                  <span className="badge bg-text-muted/15 text-text-muted">Not configured</span>
                )}
              </div>

              {existing?.active ? (
                <div className="flex flex-wrap items-end gap-3">
                  <input placeholder="Test recipient (phone/email)" className="input flex-1 min-w-[200px]" value={testTo[channel] || ""} onChange={(e) => setTestTo((t) => ({ ...t, [channel]: e.target.value }))} />
                  {channel === "WHATSAPP" && (
                    <>
                      <input placeholder="Template name" className="input !w-40" value={testTemplate.name} onChange={(e) => setTestTemplate((t) => ({ ...t, name: e.target.value }))} />
                      <input placeholder="Language (en_US)" className="input !w-32" value={testTemplate.language} onChange={(e) => setTestTemplate((t) => ({ ...t, language: e.target.value }))} />
                    </>
                  )}
                  <button onClick={() => handleTest(channel)} disabled={busy === `test-${channel}`} className="btn-primary !py-2">{busy === `test-${channel}` ? "Sending…" : "Send test"}</button>
                  <button onClick={() => handleDeactivate(existing.id, channel)} className="btn-text text-rose-600">Deactivate</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  {info.fields.map((f) => (
                    <input
                      key={f.key}
                      type={f.key.toLowerCase().includes("secret") || f.key.toLowerCase().includes("token") || f.key.toLowerCase().includes("key") ? "password" : "text"}
                      placeholder={f.placeholder || f.label}
                      className="input !w-48"
                      value={form.credentials[f.key] || ""}
                      onChange={(e) => setForms((prev) => ({ ...prev, [channel]: { ...prev[channel], credentials: { ...prev[channel].credentials, [f.key]: e.target.value } } }))}
                    />
                  ))}
                  <input placeholder={info.senderPlaceholder} className="input flex-1 min-w-[180px]" value={form.senderId} onChange={(e) => setForms((prev) => ({ ...prev, [channel]: { ...prev[channel], senderId: e.target.value } }))} />
                  <button onClick={() => handleSaveConfig(channel)} disabled={busy === channel} className="btn-primary">{busy === channel ? "Saving…" : "Save"}</button>
                </div>
              )}
            </div>
          );
        })}

        {tab === "log" && (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm table-modern">
              <thead><tr><th>Channel</th><th>Recipient</th><th>Status</th><th>Related to</th><th>When</th></tr></thead>
              <tbody>
                {notifications.map((n: any) => (
                  <tr key={n.id}>
                    <td className="text-text-900 font-medium">{n.channel}</td>
                    <td className="text-text-700">{n.recipient}</td>
                    <td>
                      <span className={`badge ${n.status === "SENT" ? "bg-green-100 text-green-600" : n.status === "FAILED" ? "bg-rose-100 text-rose-600" : "bg-gold-500/15 text-gold-600"}`}>{n.status}</span>
                      {n.status === "FAILED" && n.errorMessage && <div className="text-[11px] text-rose-600 mt-0.5">{n.errorMessage}</div>}
                    </td>
                    <td className="text-text-muted text-[12px]">{n.relatedResourceType || "—"}</td>
                    <td className="text-text-muted text-[12px]">{new Date(n.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {notifications.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No notifications sent yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
