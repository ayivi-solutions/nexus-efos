#!/usr/bin/env bash
set -euo pipefail

# Run from the root of your local clone: ~/Documents/GitHub/nexus-efos
# Adds onboarding steps 2-5 UI, a shared wizard shell, a resume-onboarding
# banner on the dashboard, and a proper .gitignore (a real gap — a build
# artifact had snuck into git before this).

echo "== .gitignore =="
cat > .gitignore << 'EOF'
node_modules/
dist/
.next/
*.tsbuildinfo
.env
.env.local
npm-debug.log*
.DS_Store
EOF

echo "== Untracking previously committed build artifact =="
git rm --cached web/tsconfig.tsbuildinfo -q 2>/dev/null || true

echo "== components/OnboardingShell.tsx =="
mkdir -p web/components
cat > web/components/OnboardingShell.tsx << 'EOF'
const STEPS = ["Institution", "Details", "Branches", "Staff", "Go Live"];

export function OnboardingShell({
  step,
  title,
  children,
}: {
  step: number; // 1-5
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-paper-0 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "active" : "pending";
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                    state === "done"
                      ? "bg-gold-500 text-ink-900"
                      : state === "active"
                      ? "bg-ink-900 text-gold-400"
                      : "bg-paper-100 text-text-muted"
                  }`}
                >
                  {state === "done" ? "✓" : n}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${n < step ? "bg-gold-500" : "bg-paper-100"}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-paper-0 border border-paper-100 rounded-lg p-8 shadow-sm">
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-rose-600 mb-2">
            Institution Onboarding · Step {step} of 5
          </div>
          <h1 className="font-display font-semibold text-3xl text-ink-900 mb-6">{title}</h1>
          {children}
        </div>

        <style jsx global>{`
          .input {
            width: 100%;
            border: 1px solid #ece4d4;
            border-radius: 6px;
            padding: 10px 12px;
            font-size: 14px;
            background: #fff;
          }
          .input:focus {
            outline: 2px solid #d59535;
            outline-offset: 1px;
          }
        `}</style>
      </div>
    </main>
  );
}
EOF

echo "== app/onboarding/details/page.tsx =="
mkdir -p web/app/onboarding/details
cat > web/app/onboarding/details/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { OnboardingShell } from "@/components/OnboardingShell";

export default function OnboardingDetailsPage() {
  const router = useRouter();
  const [form, setForm] = useState({ regulatorId: "", region: "", phone: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.updateDetails(form);
      router.push("/onboarding/branches");
    } catch (err: any) {
      setError(err.message || "Could not save details");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell step={2} title="Institutional details">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Regulator / license ID</span>
            <input
              className="input"
              value={form.regulatorId}
              onChange={(e) => setForm((f) => ({ ...f, regulatorId: e.target.value }))}
              placeholder="e.g. BoG registration number"
            />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Region</span>
            <input
              className="input"
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Institutional email</span>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => router.push("/onboarding/branches")}
            className="text-sm text-text-muted hover:text-text-700"
          >
            Skip for now
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition disabled:opacity-60"
          >
            {loading ? "Saving…" : "Continue"}
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}
EOF

echo "== app/onboarding/branches/page.tsx =="
mkdir -p web/app/onboarding/branches
cat > web/app/onboarding/branches/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { OnboardingShell } from "@/components/OnboardingShell";

export default function OnboardingBranchesPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", code: "", region: "" });
  const [added, setAdded] = useState<{ name: string; code: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.addBranch(form);
      setAdded((a) => [...a, { name: form.name, code: form.code }]);
      setForm({ name: "", code: "", region: "" });
    } catch (err: any) {
      setError(err.message || "Could not add branch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell step={3} title="Add branches">
      <p className="text-text-500 text-sm mb-5">
        Head Office was created automatically. Add any additional branches — you can always add
        more later.
      </p>

      {added.length > 0 && (
        <ul className="mb-5 space-y-1.5">
          {added.map((b) => (
            <li
              key={b.code}
              className="flex items-center gap-2 text-[13px] text-text-700 bg-paper-50 border border-paper-100 rounded-md px-3 py-2"
            >
              <span className="text-gold-600">✓</span> {b.name}{" "}
              <span className="text-text-muted font-mono">({b.code})</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Branch name</span>
            <input
              required
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Code</span>
            <input
              required
              className="input"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. TAM-01"
            />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Region</span>
            <input
              className="input"
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            />
          </label>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md border border-ink-900 text-ink-900 font-semibold text-sm hover:bg-ink-900 hover:text-gold-400 transition disabled:opacity-60"
        >
          {loading ? "Adding…" : "+ Add branch"}
        </button>
      </form>

      <div className="flex justify-end">
        <button
          onClick={() => router.push("/onboarding/staff")}
          className="px-6 py-3 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition"
        >
          Continue
        </button>
      </div>
    </OnboardingShell>
  );
}
EOF

echo "== app/onboarding/staff/page.tsx =="
mkdir -p web/app/onboarding/staff
cat > web/app/onboarding/staff/page.tsx << 'EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { OnboardingShell } from "@/components/OnboardingShell";

interface RoleOption {
  id: string;
  name: string;
  category: string;
}

export default function OnboardingStaffPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [form, setForm] = useState({ fullName: "", email: "", roleId: "" });
  const [invited, setInvited] = useState<{ fullName: string; email: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .listRoles()
      .then((res) => {
        // CEO role is assigned to the founding admin already — no need to offer it here.
        const assignable = res.roles.filter((r: RoleOption) => r.name !== "Chief Executive Officer");
        setRoles(assignable);
        if (assignable[0]) setForm((f) => ({ ...f, roleId: assignable[0].id }));
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.inviteStaff(form);
      setInvited((list) => [...list, { fullName: form.fullName, email: form.email }]);
      setForm((f) => ({ ...f, fullName: "", email: "" }));
    } catch (err: any) {
      setError(err.message || "Could not send invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell step={4} title="Invite staff">
      <p className="text-text-500 text-sm mb-5">
        Assign a role to each person you invite — permissions are already set per role from the
        institution's seeded role set.
      </p>

      {invited.length > 0 && (
        <ul className="mb-5 space-y-1.5">
          {invited.map((u) => (
            <li
              key={u.email}
              className="flex items-center gap-2 text-[13px] text-text-700 bg-paper-50 border border-paper-100 rounded-md px-3 py-2"
            >
              <span className="text-gold-600">✓</span> {u.fullName}{" "}
              <span className="text-text-muted">{u.email}</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleInvite} className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
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
            <span className="block text-[13px] text-text-500 mb-1.5">Email</span>
            <input
              required
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Role</span>
            <select
              className="input"
              value={form.roleId}
              onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading || !form.roleId}
          className="px-4 py-2 rounded-md border border-ink-900 text-ink-900 font-semibold text-sm hover:bg-ink-900 hover:text-gold-400 transition disabled:opacity-60"
        >
          {loading ? "Inviting…" : "+ Send invite"}
        </button>
      </form>

      <div className="flex justify-end">
        <button
          onClick={() => router.push("/onboarding/go-live")}
          className="px-6 py-3 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition"
        >
          Continue
        </button>
      </div>
    </OnboardingShell>
  );
}
EOF

echo "== app/onboarding/go-live/page.tsx =="
mkdir -p web/app/onboarding/go-live
cat > web/app/onboarding/go-live/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { OnboardingShell } from "@/components/OnboardingShell";

export default function OnboardingGoLivePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoLive() {
    setError(null);
    setLoading(true);
    try {
      await api.goLive();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not go live");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell step={5} title="Ready to go live">
      <p className="text-text-700 text-[15px] leading-relaxed mb-8">
        Institution registered, branches added, staff invited. Going live activates the
        institution — its status moves from <span className="font-mono text-[13px]">PENDING_ONBOARDING</span> to{" "}
        <span className="font-mono text-[13px]">ACTIVE</span>, and everyone you invited can sign
        in once they accept.
      </p>

      {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={() => router.push("/onboarding/staff")}
          className="text-sm text-text-muted hover:text-text-700"
        >
          Back
        </button>
        <button
          onClick={handleGoLive}
          disabled={loading}
          className="px-6 py-3 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
        >
          {loading ? "Activating…" : "Go live →"}
        </button>
      </div>
    </OnboardingShell>
  );
}
EOF

echo "== Patching lib/api.ts (adding onboarding step 2-5 + roles calls) =="
node - << 'NODE_EOF'
const fs = require('fs');
const path = 'web/lib/api.ts';
let content = fs.readFileSync(path, 'utf8');

const anchor = '  me: () => request("/institutions/me"),\n};';
const count = content.split(anchor).length - 1;
if (count !== 1) {
  console.error(`Expected 1 occurrence of anchor in ${path}, found ${count}. Aborting — file may already be patched or has diverged.`);
  process.exit(1);
}

const replacement = `  me: () => request("/institutions/me"),

  updateDetails: (data: { regulatorId?: string; region?: string; phone?: string; email?: string }) =>
    request("/institutions/onboarding/details", { method: "PATCH", body: JSON.stringify(data) }),

  addBranch: (data: { name: string; code: string; region?: string }) =>
    request("/institutions/onboarding/branches", { method: "POST", body: JSON.stringify(data) }),

  listRoles: () => request("/roles"),

  inviteStaff: (data: { fullName: string; email: string; roleId: string; branchId?: string }) =>
    request("/institutions/onboarding/staff", { method: "POST", body: JSON.stringify(data) }),

  goLive: () => request("/institutions/onboarding/go-live", { method: "POST" }),
};`;

content = content.replace(anchor, replacement);
fs.writeFileSync(path, content);
console.log('Patched web/lib/api.ts');
NODE_EOF

echo "== Patching app/onboarding/page.tsx (redirect step 1 -> step 2) =="
node - << 'NODE_EOF'
const fs = require('fs');
const path = 'web/app/onboarding/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const anchor = 'router.push("/dashboard");';
const count = content.split(anchor).length - 1;
if (count !== 1) {
  console.error(`Expected 1 occurrence of anchor in ${path}, found ${count}. Aborting.`);
  process.exit(1);
}

content = content.replace(anchor, 'router.push("/onboarding/details");');
fs.writeFileSync(path, content);
console.log('Patched web/app/onboarding/page.tsx');
NODE_EOF

echo "== Patching app/dashboard/page.tsx (resume-onboarding banner) =="
node - << 'NODE_EOF'
const fs = require('fs');
const path = 'web/app/dashboard/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const anchor = `            <h1 className="font-display font-semibold text-4xl text-ink-900 mb-8">{institution.legalName}</h1>`;
const count = content.split(anchor).length - 1;
if (count !== 1) {
  console.error(`Expected 1 occurrence of anchor in ${path}, found ${count}. Aborting.`);
  process.exit(1);
}

const replacement = anchor + `

            {institution.onboardingStep < 5 && (
              <button
                onClick={() =>
                  router.push(
                    ["", "onboarding", "onboarding/details", "onboarding/branches", "onboarding/staff", "onboarding/go-live"][
                      institution.onboardingStep
                    ]
                  )
                }
                className="mb-8 w-full text-left px-4 py-3 rounded-md bg-gold-300/30 border border-gold-500/40 text-ink-900 text-sm hover:bg-gold-300/50 transition"
              >
                Onboarding is at step {institution.onboardingStep} of 5 — continue setup →
              </button>
            )}`;

content = content.replace(anchor, replacement);
fs.writeFileSync(path, content);
console.log('Patched web/app/dashboard/page.tsx');
NODE_EOF

echo ""
echo "== Verifying: typecheck + build =="
cd web
npm install --silent
npx tsc --noEmit -p tsconfig.json
npx next build

echo ""
echo "All good. Review with 'git status' / 'git diff', then:"
echo "  git add -A"
echo "  git commit -m \"Onboarding steps 2-5 UI, resume banner, .gitignore\""
echo "  git push"
