"use client";

import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string };
type Ctx = { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void };

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);
  const ctx: Ctx = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };
  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === "error" ? "bg-red-700 text-white" : t.kind === "success" ? "bg-leaf-600 text-white" : "bg-ink text-white"
            }`}
          >
            {t.kind === "error" ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button aria-label="Fechar aviso" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const c = useContext(ToastContext);
  if (!c) throw new Error("useToast fora do ToastProvider");
  return c;
}
