import type { CSSProperties } from "react";

/**
 * Gemeinsame Stile und kleine UI-Helfer für die Panels. Bewusst schlicht und
 * ohne Design-Bibliothek — die Oberfläche ist ein dünner Client des Cores.
 */
export const ui: Record<string, CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "system-ui, sans-serif",
    color: "#1a1a1a",
    background: "#fafafa",
  },
  tabs: {
    display: "flex",
    gap: "0.25rem",
    padding: "0.5rem 0.75rem 0",
    borderBottom: "1px solid #e5e5e5",
    background: "white",
    flexWrap: "wrap",
    alignItems: "center",
  },
  tab: {
    padding: "0.4rem 0.8rem",
    fontSize: "0.9rem",
    border: "1px solid transparent",
    borderBottom: "none",
    borderRadius: "6px 6px 0 0",
    background: "transparent",
    color: "#555",
    cursor: "pointer",
  },
  tabActive: {
    background: "#fafafa",
    border: "1px solid #e5e5e5",
    borderBottom: "1px solid #fafafa",
    color: "#1a1a1a",
    fontWeight: 600,
    marginBottom: -1,
  },
  panel: { flex: 1, overflowY: "auto", padding: "1rem 1.25rem" },
  h2: { fontSize: "1.1rem", margin: "0 0 0.75rem" },
  card: {
    background: "white",
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    padding: "0.75rem 0.9rem",
    marginBottom: "0.6rem",
  },
  row: { display: "flex", gap: "0.5rem", alignItems: "center" },
  spread: { display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" },
  muted: { color: "#888", fontSize: "0.85rem" },
  empty: { color: "#999", padding: "1rem 0" },
  input: {
    flex: 1,
    padding: "0.5rem 0.75rem",
    fontSize: "1rem",
    border: "1px solid #ccc",
    borderRadius: 6,
  },
  select: {
    padding: "0.4rem 0.5rem",
    fontSize: "0.9rem",
    borderRadius: 6,
    border: "1px solid #ccc",
  },
  button: {
    padding: "0.45rem 0.9rem",
    fontSize: "0.9rem",
    border: "none",
    borderRadius: 6,
    background: "#1a1a1a",
    color: "white",
    cursor: "pointer",
  },
  buttonLight: {
    padding: "0.35rem 0.7rem",
    fontSize: "0.85rem",
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "white",
    color: "#333",
    cursor: "pointer",
  },
  buttonDanger: {
    padding: "0.35rem 0.7rem",
    fontSize: "0.85rem",
    border: "1px solid #f0c2bd",
    borderRadius: 6,
    background: "#fdecea",
    color: "#b3261e",
    cursor: "pointer",
  },
  error: {
    padding: "0.5rem 0.75rem",
    background: "#fdecea",
    color: "#b3261e",
    borderRadius: 6,
    marginBottom: "0.6rem",
  },
  badge: {
    fontSize: "0.75rem",
    padding: "0.1rem 0.4rem",
    borderRadius: 4,
    background: "#eee",
    color: "#555",
  },
};

/** Formt eine unbekannte Fehlerform in eine kurze Meldung. */
export function errorText(error: unknown): string {
  if (error && typeof error === "object" && "status" in error && "message" in error) {
    return `Fehler (${(error as { status: number }).status}): ${(error as { message: string }).message}`;
  }
  return "Kein Core erreichbar. Läuft der Core?";
}

/** Menschliche Byte-Angabe. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
