import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";

export interface Command {
  id: string;
  label: string;
  /** Icon-Name aus icons.tsx. */
  icon: string;
  /** Kurzer Zusatz rechts (z. B. „Bereich"). */
  hint?: string;
  run: () => void;
}

/** Einfache, tolerante Suche: alle Buchstaben der Eingabe in dieser Reihenfolge. */
function matches(label: string, query: string): boolean {
  const l = label.toLowerCase();
  const q = query.toLowerCase().trim();
  if (q === "") return true;
  let i = 0;
  for (const char of q) {
    if (char === " ") continue;
    i = l.indexOf(char, i);
    if (i === -1) return false;
    i++;
  }
  return true;
}

/**
 * Befehlspalette (Strg/Cmd + K): springt in Bereiche und löst Aktionen aus —
 * ganz ohne Maus. Schließt mit Esc, wählt mit Pfeiltasten und Enter.
 */
export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => commands.filter((command) => matches(command.label, query)),
    [commands, query],
  );

  // Beim Öffnen zurücksetzen und den Fokus ins Suchfeld legen.
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  // Ausgewählten Eintrag im Blick behalten.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, []);

  if (!open) return null;

  function choose(command: Command | undefined): void {
    if (!command) return;
    onClose();
    command.run();
  }

  return (
    <div className="rd-overlay">
      {/* Klick daneben schließt — als Knopf, damit es auch per Tastatur geht. */}
      <button
        type="button"
        className="rd-overlay-close"
        aria-label="Befehle schließen"
        onClick={onClose}
      />
      <div
        className="rd-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Befehle"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((i) => (visible.length === 0 ? 0 : (i + 1) % visible.length));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((i) => (visible.length === 0 ? 0 : (i - 1 + visible.length) % visible.length));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(visible[index]);
          }
        }}
      >
        <input
          ref={inputRef}
          className="rd-palette-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          placeholder="Bereich oder Befehl suchen…"
          aria-label="Bereich oder Befehl suchen"
          role="combobox"
          aria-expanded="true"
          aria-controls="rd-palette-list"
          aria-activedescendant={visible[index] ? `rd-cmd-${visible[index].id}` : undefined}
        />
        <div className="rd-palette-list" id="rd-palette-list" role="listbox" ref={listRef}>
          {visible.length === 0 && <div className="rd-palette-empty">Nichts gefunden.</div>}
          {visible.map((command, i) => (
            // Standard-Muster für Auswahllisten (ARIA combobox + listbox): Der
            // Fokus bleibt im Suchfeld, die Tastatur läuft über Pfeiltasten und
            // Enter dort. Die Einträge sind darum bewusst nicht selbst
            // fokussierbar; markiert wird über aria-activedescendant.
            // biome-ignore lint/a11y/useFocusableInteractive: Fokus bleibt im Suchfeld
            // biome-ignore lint/a11y/useKeyWithClickEvents: Tastatur läuft über das Suchfeld
            <div
              key={command.id}
              id={`rd-cmd-${command.id}`}
              className="rd-palette-item"
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(command)}
            >
              <Icon name={command.icon} size={17} />
              <span>{command.label}</span>
              {command.hint !== undefined && <span className="rd-kbd">{command.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
