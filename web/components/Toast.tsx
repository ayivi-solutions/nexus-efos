"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cleanErrorMessage, generateRefId } from "@/lib/errorMessage";

type ToastKind = "error" | "success" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string; refId?: string; retry?: () => void };

type ToastContextValue = {
  error: (message: string, opts?: { retry?: () => void }) => void;
  success: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// Convenience hook: fires a toast automatically whenever a page's existing
// `error` state string changes to a non-null value. Lets every page keep
// its own error state/catch blocks untouched — only the display changes.
export function useErrorToast(error: string | null) {
  const toast = useToast();
  const [lastShown, setLastShown] = useState<string | null>(null);
  if (error && error !== lastShown) {
    setLastShown(error);
    toast.error(error);
  }
  if (!error && lastShown) setLastShown(null);
}

let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string, opts?: { retry?: () => void }) => {
    const id = ++idCounter;
    const refId = kind === "error" ? generateRefId() : undefined;
    const item: ToastItem = { id, kind, message: cleanErrorMessage(message), refId, retry: opts?.retry };
    setToasts((t) => [...t, item]);
    const ttl = kind === "error" ? 9000 : 5000;
    setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const value: ToastContextValue = {
    error: (message, opts) => push("error", message, opts),
    success: (message) => push("success", message),
    info: (message) => push("info", message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed z-[100] bottom-20 dt:bottom-6 left-1/2 -translate-x-1/2 dt:left-auto dt:translate-x-0 dt:right-6 flex flex-col gap-2 w-[92vw] max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-[10px] px-4 py-3 text-sm shadow-[0_4px_16px_rgba(8,23,46,0.18)] flex items-start gap-2.5 ${
              t.kind === "error" ? "bg-ink-900 text-paper-50 border border-rose-600/40"
              : t.kind === "success" ? "bg-ink-900 text-paper-50 border border-green-600/40"
              : "bg-ink-900 text-paper-50 border border-gold-500/40"
            }`}
          >
            <span className="mt-0.5">
              {t.kind === "error" ? "⚠" : t.kind === "success" ? "✓" : "ℹ"}
            </span>
            <div className="flex-1 min-w-0">
              <div>{t.message}</div>
              {t.refId && <div className="text-[11px] text-violet-500 mt-1 selectable">{t.refId}</div>}
              {t.retry && (
                <button onClick={() => { t.retry?.(); dismiss(t.id); }} className="text-[12px] text-gold-400 font-semibold mt-1.5">
                  Retry
                </button>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-violet-500 hover:text-paper-50 shrink-0">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
