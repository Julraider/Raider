import type { CSSProperties } from "react";

/**
 * Gemeinsame Stile für alle Panels — an den Design-Entwurf angelehnt (Indigo,
 * weiche Karten, warmes Hellgrau). Farben kommen als CSS-Variablen (siehe
 * styles.css) und wechseln so automatisch zwischen Hell- und Dunkelmodus.
 */
export const ui: Record<string, CSSProperties> = {
  // Grundgerüst: Seitenleiste + Inhalt.
  app: { display: "flex", height: "100vh", background: "var(--bg)", color: "var(--text)" },
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" },

  sidebar: {
    width: 236,
    flexShrink: 0,
    background: "var(--sidebar)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    padding: "0.9rem 0.75rem",
  },
  brand: { display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.35rem 0.5rem 1rem" },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "var(--accent)",
    color: "var(--accent-contrast)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    flexShrink: 0,
  },
  brandTitle: { fontWeight: 700, fontSize: "1rem", color: "var(--text-strong)", lineHeight: 1.15 },
  brandSub: { fontSize: "0.72rem", color: "var(--muted)" },

  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    width: "100%",
    padding: "0.5rem 0.6rem",
    marginBottom: 2,
    border: "none",
    borderRadius: "var(--radius-sm)",
    background: "transparent",
    color: "var(--muted)",
    fontSize: "0.92rem",
    cursor: "pointer",
    textAlign: "left",
  },
  navItemActive: {
    background: "var(--accent-soft)",
    color: "var(--accent-soft-text)",
    fontWeight: 600,
  },
  navBadge: {
    marginLeft: "auto",
    fontSize: "0.72rem",
    fontWeight: 600,
    minWidth: 20,
    height: 20,
    padding: "0 0.35rem",
    borderRadius: 10,
    background: "var(--accent)",
    color: "var(--accent-contrast)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  statusCard: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.55rem 0.65rem",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--card)",
    marginBottom: "0.5rem",
  },
  dot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  themeToggle: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    padding: "0.55rem 0.65rem",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    fontSize: "0.88rem",
    cursor: "pointer",
  },

  // Inhaltsbereich.
  panel: { flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem" },
  h2: { fontSize: "1.15rem", fontWeight: 700, color: "var(--text-strong)", margin: "0 0 0.9rem" },

  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "0.85rem 1rem",
    marginBottom: "0.7rem",
    boxShadow: "var(--shadow)",
  },
  row: { display: "flex", gap: "0.5rem", alignItems: "center" },
  spread: { display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" },
  muted: { color: "var(--muted)", fontSize: "0.85rem" },
  empty: { color: "var(--muted)", padding: "1.5rem 0", textAlign: "center" },

  input: {
    flex: 1,
    padding: "0.55rem 0.8rem",
    fontSize: "0.95rem",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--card)",
    color: "var(--text)",
    outline: "none",
  },
  select: {
    padding: "0.45rem 0.6rem",
    fontSize: "0.9rem",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
  },
  button: {
    padding: "0.5rem 1rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    border: "none",
    borderRadius: "var(--radius-sm)",
    background: "var(--accent)",
    color: "var(--accent-contrast)",
    cursor: "pointer",
  },
  buttonLight: {
    padding: "0.42rem 0.8rem",
    fontSize: "0.85rem",
    fontWeight: 500,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--card)",
    color: "var(--text)",
    cursor: "pointer",
  },
  buttonDanger: {
    padding: "0.42rem 0.8rem",
    fontSize: "0.85rem",
    fontWeight: 500,
    border: "1px solid var(--danger)",
    borderRadius: "var(--radius-sm)",
    background: "var(--danger-soft)",
    color: "var(--danger)",
    cursor: "pointer",
  },
  badge: {
    fontSize: "0.72rem",
    fontWeight: 600,
    padding: "0.12rem 0.45rem",
    borderRadius: 6,
    background: "var(--accent-soft)",
    color: "var(--accent-soft-text)",
  },
  error: {
    padding: "0.6rem 0.8rem",
    background: "var(--danger-soft)",
    color: "var(--danger)",
    borderRadius: "var(--radius-sm)",
    marginBottom: "0.7rem",
    fontSize: "0.9rem",
  },
  success: {
    padding: "0.6rem 0.8rem",
    background: "var(--success-soft)",
    color: "var(--success)",
    borderRadius: "var(--radius-sm)",
    marginBottom: "0.7rem",
    fontSize: "0.9rem",
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
