"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

// Avisos flotantes para confirmar una acción sin mover la página («Orden enviada»).
// Se anuncian a los lectores de pantalla y se van solos a los 5 segundos.
type Toast = { id: number; message: string; tone: "ok" | "danger" };
const ToastContext = createContext<((message: string, tone?: Toast["tone"]) => void) | null>(null);

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast va dentro de ToastProvider");
  return show;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    setToasts((list) => [...list.slice(-2), { id: Date.now() + Math.random(), message, tone }]);
  }, []);
  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 5000);
    return () => clearTimeout(timer);
  }, [onDone]);
  const Icon = toast.tone === "ok" ? CircleCheck : CircleAlert;
  return (
    <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[var(--radius-control)] bg-nav px-4 py-3 text-sm text-nav-strong shadow-xl">
      <Icon aria-hidden="true" size={18} className={toast.tone === "ok" ? "text-[#4ade80]" : "text-[#f87171]"} />
      <span className="min-w-0 flex-1">{toast.message}</span>
      <button type="button" onClick={onDone} aria-label="Cerrar aviso" className="-mr-1 rounded p-1 text-nav-muted hover:text-nav-strong">
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
