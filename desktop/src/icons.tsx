import type { JSX } from "react";

/** Einfache Linien-Icons (20px, folgen der Textfarbe). */
const PATHS: Record<string, JSX.Element> = {
  Chat: <path d="M4 5h16v11H8l-4 4V5z" />,
  Agenten: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <path d="M16 11a3 3 0 000-6M15 20c0-2-1-3.5-2.5-4.5" />
    </>
  ),
  Werkzeuge: <path d="M14 7a4 4 0 00-5.5 5.5l-4 4L6 18l4-4A4 4 0 0014 7z M14.5 7.5l3-3" />,
  Gedächtnis: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  Skills: <path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" />,
  Posteingang: <path d="M4 13l2.5-8h11L20 13v5H4v-5z M4 13h5l1.5 2.5h3L15 13h5" />,
  Aufgaben: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1 1 1.5-2M4 12l1 1 1.5-2M4 18l1 1 1.5-2" />
    </>
  ),
  Suche: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4-4" />
    </>
  ),
  Telegram: <path d="M21 4L3 11l6 2 2 6 3-4 4 3 3-14z M9 13l9-7-6 8" />,
  Betrieb: <path d="M3 12h4l2 6 4-14 2 8h6" />,
  Einstellungen: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M18.5 5.5l-2 2M7.5 16.5l-2 2" />
    </>
  ),
  moon: <path d="M20 14a8 8 0 01-10-10 8 8 0 1010 10z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  ),
  send: <path d="M4 12l16-7-7 16-2-6-7-3z" />,
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
