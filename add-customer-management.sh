#!/usr/bin/env bash
set -euo pipefail
# Run from ~/Documents/GitHub/nexus-efos, on develop.
# Adds Customer model (doc §33) + backend routes + frontend list/create page.

patch_file() {
  local path="$1" anchor="$2" replacement="$3" already_marker="$4"
  node -e '
    const fs = require("fs");
    const [, path, anchorB64, replB64, marker] = process.argv;
    const anchor = Buffer.from(anchorB64, "base64").toString("utf8");
    const repl = Buffer.from(replB64, "base64").toString("utf8");
    let raw = fs.readFileSync(path, "utf8");
    const hadCRLF = raw.includes("\r\n");
    let content = raw.replace(/\r\n/g, "\n");
    if (content.includes(marker)) { console.log("Already patched: " + path); process.exit(0); }
    const count = content.split(anchor).length - 1;
    if (count !== 1) { console.error(`Anchor mismatch in ${path} (found ${count}). Aborting.`); process.exit(1); }
    content = content.replace(anchor, repl);
    if (hadCRLF) content = content.replace(/\n/g, "\r\n");
    fs.writeFileSync(path, content);
    console.log("Patched: " + path);
  ' "$path" "$(printf '%s' "$anchor" | base64 -w0)" "$(printf '%s' "$replacement" | base64 -w0)" "$already_marker"
}

echo "== api/prisma/schema.prisma =="
ANCHOR='// ---------------------------------------------------------------------------
// AUTH SUPPORT
// ---------------------------------------------------------------------------'
REPL='// ---------------------------------------------------------------------------
// CUSTOMER LIFECYCLE MANAGEMENT (doc §33)
// ---------------------------------------------------------------------------

enum CustomerSegment {
  INDIVIDUAL
  BUSINESS
  FARMER_GROUP
  WOMENS_GROUP
  YOUTH
  CORPORATE

  @@schema("nexusos")
}

enum LifecycleStage {
  AWARENESS
  ACQUISITION
  ONBOARDING
  ACTIVATION
  GROWTH
  RETENTION
  ADVOCACY
  RE_ENGAGEMENT

  @@schema("nexusos")
}

enum KycStatus {
  PENDING
  VERIFIED
  REJECTED

  @@schema("nexusos")
}

model Customer {
  id            String          @id @default(cuid())
  institution   Institution     @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  institutionId String
  branch        Branch?         @relation(fields: [branchId], references: [id], onDelete: SetNull)
  branchId      String?

  fullName      String
  phone         String
  email         String?
  idType        String?
  idNumber      String?

  segment       CustomerSegment @default(INDIVIDUAL)
  lifecycleStage LifecycleStage @default(ONBOARDING)
  kycStatus     KycStatus       @default(PENDING)

  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@unique([institutionId, phone])
  @@map("customers")
  @@schema("nexusos")
}

// ---------------------------------------------------------------------------
// AUTH SUPPORT
// ---------------------------------------------------------------------------'
patch_file "api/prisma/schema.prisma" "$ANCHOR" "$REPL" "model Customer {"

node -e '
const fs = require("fs");
const path = "api/prisma/schema.prisma";
let raw = fs.readFileSync(path, "utf8");
const hadCRLF = raw.includes("\r\n");
let c = raw.replace(/\r\n/g, "\n");
if (!c.includes("customers     Customer[]\n  auditLogs")) {
  c = c.replace("  roles         Role[]\n  auditLogs     AuditLog[]", "  roles         Role[]\n  customers     Customer[]\n  auditLogs     AuditLog[]");
}
if (!c.includes("userRoles     UserRole[]\n  customers     Customer[]")) {
  c = c.replace("  userRoles     UserRole[]\n\n  createdAt     DateTime     @default(now())\n  updatedAt     DateTime     @updatedAt\n\n  @@unique([institutionId, code])\n  @@map(\"branches\")",
    "  userRoles     UserRole[]\n  customers     Customer[]\n\n  createdAt     DateTime     @default(now())\n  updatedAt     DateTime     @updatedAt\n\n  @@unique([institutionId, code])\n  @@map(\"branches\")");
}
if (hadCRLF) c = c.replace(/\n/g, "\r\n");
fs.writeFileSync(path, c);
console.log("Patched reverse relations in schema.prisma");
'

echo "== api/src/routes/customer.routes.ts =="
cat > api/src/routes/customer.routes.ts << 'EOF'
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const customerRouter = Router();
customerRouter.use(requireAuth);

customerRouter.get("/", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const { segment, stage } = req.query as { segment?: string; stage?: string };
  const customers = await prisma.customer.findMany({
    where: {
      institutionId: req.auth!.institutionId,
      ...(segment ? { segment: segment as any } : {}),
      ...(stage ? { lifecycleStage: stage as any } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ customers });
});

customerRouter.get("/:id", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ customer });
});

const createSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  branchId: z.string().optional(),
  segment: z
    .enum(["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"])
    .default("INDIVIDUAL"),
});

customerRouter.post("/", requirePermission("customers.create"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.create({
    data: { institutionId: req.auth!.institutionId, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "customer.create",
      resource: "customer",
      resourceId: customer.id,
    },
  });

  res.status(201).json({ customer });
});

const stageSchema = z.object({
  lifecycleStage: z.enum([
    "AWARENESS", "ACQUISITION", "ONBOARDING", "ACTIVATION", "GROWTH", "RETENTION", "ADVOCACY", "RE_ENGAGEMENT",
  ]),
});

customerRouter.patch("/:id/stage", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const parsed = stageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { lifecycleStage: parsed.data.lifecycleStage },
  });
  if (customer.count === 0) return res.status(404).json({ error: "Customer not found" });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "customer.stage_change",
      resource: "customer",
      resourceId: req.params.id,
      metadata: { lifecycleStage: parsed.data.lifecycleStage },
    },
  });

  res.json({ ok: true });
});

customerRouter.patch("/:id/kyc", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const { kycStatus } = req.body as { kycStatus?: "PENDING" | "VERIFIED" | "REJECTED" };
  if (!kycStatus) return res.status(400).json({ error: "kycStatus required" });

  const customer = await prisma.customer.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { kycStatus },
  });
  if (customer.count === 0) return res.status(404).json({ error: "Customer not found" });

  res.json({ ok: true });
});
EOF

echo "== api/src/app.ts =="
patch_file "api/src/app.ts" \
  'import { roleRouter } from "./routes/role.routes";' \
  'import { roleRouter } from "./routes/role.routes";
import { customerRouter } from "./routes/customer.routes";' \
  'customerRouter'
patch_file "api/src/app.ts" \
  'app.use("/roles", roleRouter);' \
  'app.use("/roles", roleRouter);
app.use("/customers", customerRouter);' \
  '/customers", customerRouter'

echo "== web/lib/api.ts =="
patch_file "web/lib/api.ts" \
  '  goLive: () => request("/institutions/onboarding/go-live", { method: "POST" }),
};' \
  '  goLive: () => request("/institutions/onboarding/go-live", { method: "POST" }),

  listCustomers: () => request("/customers"),

  createCustomer: (data: { fullName: string; phone: string; email?: string; segment: string }) =>
    request("/customers", { method: "POST", body: JSON.stringify(data) }),
};' \
  'listCustomers:'

echo "== web/app/dashboard/page.tsx: NAV hrefs + click wiring =="
node -e '
const fs = require("fs");
const path = "web/app/dashboard/page.tsx";
let raw = fs.readFileSync(path, "utf8");
const hadCRLF = raw.includes("\r\n");
let c = raw.replace(/\r\n/g, "\n");
if (c.includes("href: \"/customers\"")) { console.log("Already patched: " + path); process.exit(0); }

const navAnchor = `const NAV = [
  { label: "Overview", icon: "◆" },
  { label: "Customers", icon: "○" },
  { label: "Loans", icon: "▢" },
  { label: "Savings", icon: "▣" },
  { label: "Branches", icon: "▤" },
  { label: "Roles & Permissions", icon: "◈" },
  { label: "Audit Log", icon: "▥" },
];`;
const navRepl = `const NAV = [
  { label: "Overview", icon: "◆", href: "/dashboard" },
  { label: "Customers", icon: "○", href: "/customers" },
  { label: "Loans", icon: "▢", href: "#" },
  { label: "Savings", icon: "▣", href: "#" },
  { label: "Branches", icon: "▤", href: "#" },
  { label: "Roles & Permissions", icon: "◈", href: "#" },
  { label: "Audit Log", icon: "▥", href: "#" },
];`;
if ((c.split(navAnchor).length - 1) !== 1) { console.error("NAV anchor mismatch. Aborting."); process.exit(1); }
c = c.replace(navAnchor, navRepl);

const btnAnchor = `          {NAV.map((item, i) => (
            <button
              key={item.label}
              className={\`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-md text-[13px] transition \${
                i === 0 ? "bg-ink-800 text-gold-300 shadow-[inset_2px_0_0_#E8B563]" : "text-violet-500 hover:bg-ink-800 hover:text-paper-50"
              }\`}
            >`;
const btnRepl = `          {NAV.map((item, i) => (
            <button
              key={item.label}
              onClick={() => item.href !== "#" && router.push(item.href)}
              className={\`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-md text-[13px] transition \${
                i === 0 ? "bg-ink-800 text-gold-300 shadow-[inset_2px_0_0_#E8B563]" : "text-violet-500 hover:bg-ink-800 hover:text-paper-50"
              }\`}
            >`;
if ((c.split(btnAnchor).length - 1) !== 1) { console.error("button anchor mismatch. Aborting."); process.exit(1); }
c = c.replace(btnAnchor, btnRepl);

if (hadCRLF) c = c.replace(/\n/g, "\r\n");
fs.writeFileSync(path, c);
console.log("Patched: " + path);
'

echo "== web/app/customers/page.tsx =="
mkdir -p web/app/customers
cat > web/app/customers/page.tsx << 'EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];

const STAGE_COLOR: Record<string, string> = {
  ONBOARDING: "bg-violet-500/15 text-violet-500",
  ACTIVATION: "bg-gold-500/15 text-gold-600",
  GROWTH: "bg-green-100 text-green-600",
  RETENTION: "bg-green-100 text-green-600",
  ADVOCACY: "bg-green-100 text-green-600",
  RE_ENGAGEMENT: "bg-rose-100 text-rose-600",
};

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .listCustomers()
      .then((res) => setCustomers(res.customers))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createCustomer(form);
      setForm({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-paper-0">
      <DashboardSidebar active="Customers" router={router} />
      <main className="flex-1 p-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display font-semibold text-3xl text-ink-900">Customers</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="px-4 py-2 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition"
          >
            {showForm ? "Cancel" : "+ New customer"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleCreate} className="border border-paper-100 rounded-lg p-6 mb-8 bg-paper-50">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
                <input
                  required
                  className="input"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
                <input
                  required
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Email (optional)</span>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Segment</span>
                <select
                  className="input"
                  value={form.segment}
                  onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
                >
                  {SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {s.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
            >
              {saving ? "Saving…" : "Create customer"}
            </button>
          </form>
        )}

        <div className="border border-paper-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">KYC</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 text-text-900">{c.fullName}</td>
                  <td className="px-4 py-3 text-text-700">{c.phone}</td>
                  <td className="px-4 py-3 text-text-700">{c.segment.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STAGE_COLOR[c.lifecycleStage] || ""}`}>
                      {c.lifecycleStage.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-500">{c.kycStatus}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-sm">
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function DashboardSidebar({ active, router }: { active: string; router: ReturnType<typeof useRouter> }) {
  const NAV = [
    { label: "Overview", icon: "◆", href: "/dashboard" },
    { label: "Customers", icon: "○", href: "/customers" },
    { label: "Loans", icon: "▢", href: "#" },
    { label: "Savings", icon: "▣", href: "#" },
    { label: "Branches", icon: "▤", href: "#" },
    { label: "Roles & Permissions", icon: "◈", href: "#" },
    { label: "Audit Log", icon: "▥", href: "#" },
  ];
  return (
    <aside className="w-[260px] bg-ink-900 text-paper-50 flex flex-col shrink-0">
      <div className="h-14 flex items-center gap-2 px-5 border-b" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
        <span className="w-2 h-2 rounded-full bg-gold-400" style={{ boxShadow: "0 0 8px #E8B563" }} />
        <span className="font-mono text-sm tracking-wide">
          NEXUS <b className="text-gold-400">EFOS</b>
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => (
          <button
            key={item.label}
            onClick={() => item.href !== "#" && router.push(item.href)}
            className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-md text-[13px] transition ${
              item.label === active
                ? "bg-ink-800 text-gold-300 shadow-[inset_2px_0_0_#E8B563]"
                : "text-violet-500 hover:bg-ink-800 hover:text-paper-50"
            }`}
          >
            <span className="text-gold-500">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t text-[11px] text-violet-500" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
        Core Platform · Working Draft v0.1
      </div>
    </aside>
  );
}
EOF

echo ""
echo "== Verifying: API typecheck =="
cd api
npm install --silent
npx tsc --noEmit
cd ..

echo "== Verifying: web typecheck + build =="
cd web
npm install --silent
npx tsc --noEmit -p tsconfig.json
npx next build
cd ..

echo ""
echo "All good. Then:"
echo "  git add -A"
echo "  git commit -m \"Customer Lifecycle Management: model, routes, frontend (doc §33)\""
echo "  git push"
