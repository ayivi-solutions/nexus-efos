"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const NAV_FULL: { label: string; icon: string; href: string; perm: string | null }[] = [
  { label: "Dashboard", icon: "◆", href: "/dashboard", perm: null },
  { label: "Customers", icon: "○", href: "/customers", perm: "customers.view" },
  { label: "Loans", icon: "▢", href: "/loans", perm: "reports.view" },
  { label: "Savings", icon: "▣", href: "/savings", perm: "reports.view" },
  { label: "Branches", icon: "▤", href: "/branches", perm: "branches.administer" },
  { label: "Roles & Permissions", icon: "◈", href: "/roles", perm: "users.administer" },
  { label: "Audit Log", icon: "▥", href: "/audit-log", perm: "audit.view" },
  { label: "Reports", icon: "▧", href: "/reports", perm: "reports.view" },
  { label: "Products", icon: "◫", href: "/products", perm: "institution.configure" },
  { label: "Watchlist", icon: "▨", href: "/watchlist", perm: "institution.configure" },
  { label: "Approvals", icon: "✓", href: "/approvals", perm: "institution.configure" },
  { label: "Migration", icon: "⇪", href: "/migration/customers", perm: "data.migrate" },
  { label: "Business Rules", icon: "⚡", href: "/business-rules", perm: "institution.configure" },
  { label: "Collections", icon: "⚑", href: "/collections", perm: "users.administer" },
];

export function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [permissions, setPermissions] = useState<string[] | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    api
      .whoAmI()
      .then((res) => setPermissions(res.permissions))
      .catch(() => setPermissions([]));
  }, [router]);

  const hasPerm = (perm: string | null) => perm === null || (permissions?.includes(perm) ?? false);

  const visibleNav = permissions === null ? NAV_FULL : NAV_FULL.filter((item) => hasPerm(item.perm));

  const tabItems = [
    NAV_FULL[0],
    ...NAV_FULL.slice(1)
      .filter((item) => hasPerm(item.perm))
      .slice(0, 3),
  ];

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function handleLogout() {
    setOpen(false);
    await api.logout();
    sessionStorage.removeItem("nexus_access_token");
    sessionStorage.removeItem("nexus_refresh_token");
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-paper-0">
      {/* EUXS Volume XVII (Accessibility) §163 Keyboard Accessibility /
          WCAG 2.4.1 Bypass Blocks — lets keyboard users jump straight past
          the repeated nav chrome on every single page. Visually hidden
          until focused (Tab from page load reveals it first). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[200] focus:top-2 focus:left-2 focus:bg-gold-500 focus:text-ink-900 focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Fixed top chrome */}
      <header className="fixed top-0 inset-x-0 h-14 z-40 flex items-center gap-3 px-4 bg-ink-900 text-paper-0 border-b border-ink-700/40">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle navigation"
          aria-expanded={open}
          className="dt:hidden w-9 h-9 flex items-center justify-center rounded-md text-gold-400 border border-gold-500/30 text-lg shrink-0"
        >
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gold-400" style={{ boxShadow: "0 0 8px #e2c46a" }} aria-hidden="true" />
          <span className="font-mono text-sm tracking-wide">
            NEXUS <b className="text-gold-400">EFOS</b>
          </span>
        </div>
      </header>

      <div className="flex pt-14 min-h-screen">
        {/* Drawer: overlay <dt, persistent sidebar >=dt */}
        <aside
          className={`fixed top-14 bottom-0 left-0 w-[82vw] max-w-[320px] z-50 bg-ink-900 text-paper-0 flex flex-col border-r border-ink-700/40 transition-transform duration-300 ${
            open ? "translate-x-0" : "-translate-x-full"
          } dt:sticky dt:top-14 dt:translate-x-0 dt:w-[280px] dt:max-w-none dt:h-[calc(100vh-56px)] dt:shrink-0`}
        >
          <nav aria-label="Primary" className="flex-1 p-3 space-y-1 overflow-y-auto">
            {visibleNav.map((item) => (
              <button
                key={item.label}
                onClick={() => go(item.href)}
                aria-current={item.label === active ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-md text-[13px] transition ${
                  item.label === active
                    ? "bg-ink-800 text-gold-300 shadow-[inset_2px_0_0_#e2c46a]"
                    : "text-violet-500 hover:bg-ink-800 hover:text-paper-50"
                }`}
              >
                <span className="text-gold-500" aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="border-t border-ink-700/40">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 text-left px-5 py-3 text-[13px] text-rose-600 hover:bg-ink-800 transition"
            >
              <span aria-hidden="true">⏻</span> Log out
            </button>
            <div className="px-4 pb-4 text-[11px] text-violet-500">Core Platform · Working Draft v0.1</div>
          </div>
        </aside>

        {/* Scrim, mobile only */}
        {open && (
          <div
            className="dt:hidden fixed top-14 inset-x-0 bottom-0 bg-black/40 z-45"
            onClick={() => setOpen(false)}
          />
        )}

        {/* Main content — bottom padding clears the mobile tab bar */}
        <main id="main-content" className="flex-1 min-w-0 pb-24 dt:pb-0">{children}</main>
      </div>

      {/* Bottom tab bar — mobile only, role-aware (Dashboard + top 3 permitted) */}
      <nav aria-label="Mobile" className="dt:hidden fixed bottom-0 inset-x-0 h-16 z-40 flex bg-ink-900 border-t border-ink-700/40" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabItems.map((item) => (
          <button
            key={item.label}
            onClick={() => go(item.href)}
            aria-current={item.label === active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10.5px] ${
              item.label === active ? "text-gold-400" : "text-violet-500"
            }`}
          >
            <span className="text-base" aria-hidden="true">{item.icon}</span>
            {item.label === "Roles & Permissions" ? "Roles" : item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
