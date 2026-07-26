import type { JSX } from "react";

/**
 * Einfache Linien-Icons (Lucide-Geometrie nachempfunden, 24er-Raster).
 * Folgen der Textfarbe (stroke: currentColor) und sind rein dekorativ.
 */
const PATHS: Record<string, JSX.Element> = {
  // --- Navigation (Seitenleiste) ---
  Chat: <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />,
  Agenten: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5" />
      <path d="M16 3.5a3 3 0 0 1 0 6" />
      <path d="M14.5 14.7c2.6.6 4.5 2.7 4.5 5.3" />
    </>
  ),
  Werkzeuge: (
    <path d="M14.7 6.3a4 4 0 0 0-5.3 5.3l-6 6a1.5 1.5 0 0 0 2.1 2.1l6-6a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.1-2.1z" />
  ),
  Gedächtnis: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  Skills: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  Posteingang: (
    <>
      <path d="M3 12h5l2 3h4l2-3h5" />
      <path d="M5.5 5h13l2.5 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
    </>
  ),
  Aufgaben: (
    <>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="M3 6l1.2 1.2L6.5 4.8M3 12l1.2 1.2L6.5 10.8M3 18l1.2 1.2L6.5 16.8" />
    </>
  ),
  Suche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  Telegram: (
    <>
      <path d="M21.5 4.3 2.8 11.5c-.7.3-.7 1.3.1 1.5l4.6 1.4 1.8 5.6c.2.7 1.1.8 1.5.2l2.5-3 4.6 3.4c.6.4 1.4.1 1.6-.6l3.4-14.4c.2-.8-.6-1.5-1.9-1.3z" />
      <path d="M8 14.4 17 7l-6.4 8.4" />
    </>
  ),
  Betrieb: <path d="M3 12h4l2.5 7 4-16 2.5 9h5" />,
  Einstellungen: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1z" />
    </>
  ),

  // --- Theme ---
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),

  // --- Aktionen (Chat / Werkzeuge) ---
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chevron: <path d="M6 9l6 6 6-6" />,
};

export function Icon({ name, size = 19 }: { name: string; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name] ?? null}
    </svg>
  );
}
