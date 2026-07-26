import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { createContext, useContext, useId, useState } from "react";
import { Icon } from "./icons";

/**
 * Gemeinsame Bausteine für alle Bereiche. Das Aussehen steckt in styles.css
 * (Klassen `rd-*`), damit Hover, Fokus und Zustände sauber funktionieren.
 * Alle Bereiche sollen diese Bausteine nutzen, damit die Oberfläche überall
 * gleich aussieht und sich gleich anfühlt.
 */

/* ------------------------------------------------------------------ Gerüst */

/** Kopfzeile eines Bereichs: Titel, Untertitel, Aktionen rechts. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="rd-head">
      <div className="rd-grow">
        <h2 className="rd-head-title">{title}</h2>
        {subtitle !== undefined && <div className="rd-head-sub">{subtitle}</div>}
      </div>
      {actions !== undefined && <div className="rd-head-actions">{actions}</div>}
    </header>
  );
}

/**
 * Bereichs-Gerüst: feste Kopfzeile, darunter scrollbarer Inhalt.
 * `narrow` begrenzt die Breite für Formulare und Fließtext.
 */
export function Page({
  title,
  subtitle,
  actions,
  narrow = false,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div className={narrow ? "rd-body rd-body--narrow" : "rd-body"}>{children}</div>
      </div>
    </div>
  );
}

/** Karte mit optionaler Überschrift. */
export function Card({
  title,
  actions,
  flat = false,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  flat?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={flat ? "rd-card rd-card--flat" : "rd-card"}>
      {(title !== undefined || actions !== undefined) && (
        <div className="rd-spread" style={{ marginBottom: "var(--space-3)" }}>
          {title !== undefined && <div className="rd-card-title">{title}</div>}
          {actions !== undefined && <div className="rd-row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Kleine Überschrift, um lange Bereiche zu gliedern. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="rd-section-title">{children}</h3>;
}

/**
 * Mehrere Felder nebeneinander, die bei schmalem Fenster automatisch
 * untereinander rutschen — spart das Nachbauen mit rd-row/rd-grow in jedem
 * Bereich.
 */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="rd-fieldrow">{children}</div>;
}

/**
 * Kennzahl-Kachel für Übersichten („Datenbank 12,4 MB"). `tone` färbt nur den
 * Zustandspunkt, nicht die ganze Kachel — so bleibt die Fläche ruhig.
 */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rd-stat">
      <div className="rd-stat-label">
        {tone !== undefined && <StatusDot tone={tone} />}
        {label}
      </div>
      <div className="rd-stat-value">{value}</div>
      {hint !== undefined && <div className="rd-hint">{hint}</div>}
    </div>
  );
}

/** Reihe aus Kennzahl-Kacheln, die sich an die Fensterbreite anpasst. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="rd-statrow">{children}</div>;
}

/* ---------------------------------------------------------------- Bedienung */

type ButtonVariant = "primary" | "ghost" | "quiet" | "danger";

/** Knopf in vier Ausprägungen, optional mit Icon. */
export function Button({
  variant = "primary",
  small = false,
  icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  small?: boolean;
  icon?: string;
}) {
  const classes = ["rd-btn"];
  if (variant !== "primary") classes.push(`rd-btn--${variant}`);
  if (small) classes.push("rd-btn--sm");
  if (className) classes.push(className);
  return (
    <button type="button" className={classes.join(" ")} {...rest}>
      {icon !== undefined && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </button>
  );
}

/** Knopf nur mit Icon — braucht immer ein `label` für Screenreader. */
export function IconButton({
  icon,
  label,
  variant = "quiet",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
  variant?: ButtonVariant;
}) {
  const classes = ["rd-btn", "rd-btn--icon"];
  if (variant !== "primary") classes.push(`rd-btn--${variant}`);
  if (className) classes.push(className);
  return (
    <button type="button" className={classes.join(" ")} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/**
 * Löschen mit Sicherheitsabfrage: erst „Löschen", nach dem Klick
 * „Wirklich löschen" + „Abbrechen". Nie ohne Rückfrage löschen.
 */
export function ConfirmButton({
  onConfirm,
  label = "Löschen",
  confirmLabel = "Wirklich löschen",
  small = true,
}: {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  small?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button variant="danger" small={small} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="rd-row">
      <Button
        variant="danger"
        small={small}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" small={small} onClick={() => setArmed(false)}>
        Abbrechen
      </Button>
    </span>
  );
}

/* ---------------------------------------------------------------- Formulare */

/**
 * Verknüpft die Beschriftung mit dem Bedienelement darin: `Field` erzeugt eine
 * ID, `Input`/`Textarea`/`Select` übernehmen sie automatisch. So liest ein
 * Screenreader zu jedem Feld die richtige Beschriftung vor.
 */
const FieldIdContext = createContext<string | undefined>(undefined);

/** Feld mit Beschriftung und optionalem Hinweis. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="rd-field">
      <label className="rd-label" htmlFor={id}>
        {label}
      </label>
      <FieldIdContext.Provider value={id}>{children}</FieldIdContext.Provider>
      {hint !== undefined && <span className="rd-hint">{hint}</span>}
    </div>
  );
}

export function Input({ className, id, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const fieldId = useContext(FieldIdContext);
  return (
    <input
      id={id ?? fieldId}
      className={className ? `rd-control ${className}` : "rd-control"}
      {...rest}
    />
  );
}

export function Textarea({ className, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fieldId = useContext(FieldIdContext);
  return (
    <textarea
      id={id ?? fieldId}
      className={className ? `rd-control ${className}` : "rd-control"}
      {...rest}
    />
  );
}

export function Select({ className, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldId = useContext(FieldIdContext);
  return (
    <select
      id={id ?? fieldId}
      className={className ? `rd-control ${className}` : "rd-control"}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------ Anzeige */

/** Etikett für Zustände („aktiv", „Fehler", …). */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "quiet";
  children: ReactNode;
}) {
  const suffix = tone === "neutral" ? "" : ` rd-badge--${tone}`;
  return <span className={`rd-badge${suffix}`}>{children}</span>;
}

/** Farbiger Punkt für Zustände (an/aus, verbunden/getrennt). */
export function StatusDot({ tone = "neutral" }: { tone?: "neutral" | "ok" | "warn" }) {
  const suffix = tone === "neutral" ? "" : ` rd-dot--${tone}`;
  return <span className={`rd-dot${suffix}`} />;
}

/** Tabelle mit Kopfzeile; `align` markiert Zahlenspalten (rechtsbündig). */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="rd-tablewrap">
      <table className="rd-table">
        <thead>
          <tr>
            {head.map((cell, i) => (
              // Spaltenköpfe sind fest — der Index ist hier ein stabiler Schlüssel.
              // biome-ignore lint/suspicious/noArrayIndexKey: feste Spaltenliste
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Leerer Zustand: sagt, was fehlt — und was man tun kann. */
export function EmptyState({
  icon = "Suche",
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rd-empty">
      <span className="rd-empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <div className="rd-empty-title">{title}</div>
      {hint !== undefined && <div className="rd-empty-hint">{hint}</div>}
      {action !== undefined && <div style={{ marginTop: "var(--space-2)" }}>{action}</div>}
    </div>
  );
}

/** Platzhalter während des Ladens — verhindert springende Layouts. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rd-stack rd-stack--tight" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: reine Platzhalter ohne Identität
          key={i}
          className="rd-skel"
          style={{ width: `${88 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

/** Hinweisstreifen für Fehler, Erfolge oder Erklärungen. */
export function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "ok";
  children: ReactNode;
}) {
  const suffix = tone === "info" ? "" : ` rd-note--${tone}`;
  return (
    <div className={`rd-note${suffix}`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}
