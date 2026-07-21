"use client";

import { useEffect } from "react";

// Blocks the browser's right-click context menu app-wide, except over
// elements explicitly marked selectable (table cells and .selectable
// data displays) — where copying real values is still a legitimate need.
export function ContextMenuGuard() {
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const allowed = target.closest("td, .selectable, input, textarea, select");
      if (!allowed) e.preventDefault();
    }
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  return null;
}
