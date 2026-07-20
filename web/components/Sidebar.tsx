"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const NAV = [
  { label: "Overview", icon: "◆", href: "/dashboard" },
  { label: "Customers", icon: "○", href: "/customers" },
  { label: "Loans", icon: "▢", href: "/loans" },
  { label: "Savings", icon: "▣", href: "/savings" },
  { label: "Branches", icon: "▤", href: "#" },
  { label: "Roles & Permissions", icon: "◈", href: "#" },
  { label: "Audit Log", icon: "▥", href: "#" },
];

export function Sidebar({ active }: { active: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function go(href: string) {
    if (href === "#") return;
    setOpen(false);
    router.push(href);
  }

  const navList = (
    <nav className="flex-1 p-3 space-y-1">
      {NAV.map((item) => (
        <button
          key={item.label}
          onClick={() => go(item.href)}
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
  );

  const brand = (
    <div className="h-14 flex items-center gap-2 px-5 border-b" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
      <span className="w-2 h-2 rounded-full bg-gold-400" style={{ boxShadow: "0 0 8px #E8B563" }} />
      <span className="font-mono text-sm tracking-wide">
        NEXUS <b className="text-gold-400">EFOS</b>
      </span>
    </div>
  );

  const footer = (
    <div className="p-4 border-t text-[11px] text-violet-500" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
      Core Platform · Working Draft v0.1
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="md:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-ink-900 text-paper-50 border-b"
        style={{ borderColor: "rgba(232,181,99,0.14)" }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gold-400" style={{ boxShadow: "0 0 8px #E8B563" }} />
          <span className="font-mono text-sm tracking-wide">
            NEXUS <b className="text-gold-400">EFOS</b>
          </span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          className="w-9 h-9 flex items-center justify-center rounded-md text-gold-400 border border-gold-500/30 text-lg"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile drawer + overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-[260px] bg-ink-900 text-paper-50 flex flex-col h-full">
            {brand}
            {navList}
            {footer}
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>
      )}

      {/* Desktop static sidebar */}
      <aside className="hidden md:flex w-[260px] bg-ink-900 text-paper-50 flex-col shrink-0">
        {brand}
        {navList}
        {footer}
      </aside>
    </>
  );
}
