import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { Icon } from "./icons";

interface ToastMessage {
  id: number;
  text: string;
  tone: "ok" | "error";
}

interface ToastApi {
  /** Kurze Erfolgsmeldung unten rechts. */
  show: (text: string) => void;
  /** Kurze Fehlermeldung unten rechts. */
  showError: (text: string) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {}, showError: () => {} });

let nextId = 1;

/**
 * Kurze Rückmeldungen („Gespeichert", „Kopiert") unten rechts. Sie
 * verschwinden von selbst und melden sich per `role="status"` auch an
 * Screenreader.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = useCallback((text: string, tone: "ok" | "error") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show: (text) => push(text, "ok"),
      showError: (text) => push(text, "error"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="rd-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={toast.tone === "error" ? "rd-toast rd-toast--error" : "rd-toast"}
          >
            <Icon name={toast.tone === "error" ? "x" : "check"} size={15} />
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Zugriff auf die Meldungen aus jedem Bereich heraus. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
