"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";
type Toast = { id: number; title: string; description?: string; tone: Tone };
type Ctx = { toast: (t: Omit<Toast, "id" | "tone"> & { tone?: Tone }) => void };

const ToastContext = createContext<Ctx | null>(null);

const icons: Record<Tone, ReactNode> = {
  info: <Info className="text-blue-300" />,
  success: <CheckCircle2 className="text-success" />,
  warning: <AlertTriangle className="text-warning" />,
  danger: <XCircle className="text-danger" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback<Ctx["toast"]>(
    ({ tone = "info", ...t }) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-3), { id, tone, ...t }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-line/10 bg-surface-3 p-3.5 pr-2 shadow-lg animate-fade-up [&_svg]:size-5 [&_svg]:shrink-0",
            )}
          >
            {icons[t.tone]}
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-bold text-fg">{t.title}</div>
              {t.description && <div className="mt-0.5 text-caption text-fg-muted">{t.description}</div>}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="rounded-xs p-1 text-fg-subtle hover:bg-line/10 hover:text-fg [&_svg]:size-4">
              <X />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
