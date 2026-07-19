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
