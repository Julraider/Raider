import type { MemoryStore, MemoryView, RaiderClient } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

const STORES: MemoryStore[] = ["user", "agent"];
const LABEL: Record<MemoryStore, string> = { user: "Nutzerprofil", agent: "Notizen" };

/** Kerngedächtnis ansehen und bearbeiten (zwei Speicher). */
export function MemoryPanel({ client }: { client: RaiderClient }) {
  const [views, setViews] = useState<Record<MemoryStore, MemoryView | null>>({
    user: null,
    agent: null,
  });
  const [drafts, setDrafts] = useState<Record<MemoryStore, string>>({ user: "", agent: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [user, agent] = await Promise.all([
        client.getMemory("user"),
        client.getMemory("agent"),
      ]);
      setViews({ user, agent });
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(store: MemoryStore): Promise<void> {
    const content = drafts[store].trim();
    if (!content) return;
    try {
      await client.addMemory(store, { content });
      setDrafts((d) => ({ ...d, [store]: "" }));
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(id: number): Promise<void> {
    try {
      await client.deleteMemory(id);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Kerngedächtnis</h2>
      {error !== null && <div style={ui.error}>{error}</div>}
      {STORES.map((store) => {
        const view = views[store];
        return (
          <section key={store} style={{ marginBottom: "1.5rem" }}>
            <div style={ui.spread}>
              <strong>{LABEL[store]}</strong>
              {view && (
                <span style={ui.muted}>
                  {view.used} / {view.limit} Zeichen
                </span>
              )}
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              {view?.entries.length === 0 && <p style={ui.empty}>Noch nichts gespeichert.</p>}
              {view?.entries.map((entry) => (
                <div key={entry.id} style={ui.card}>
                  <div style={ui.spread}>
                    <span>{entry.content}</span>
                    <button
                      type="button"
                      style={ui.buttonDanger}
                      onClick={() => void remove(entry.id)}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...ui.row, marginTop: "0.5rem" }}>
              <input
                style={ui.input}
                value={drafts[store]}
                onChange={(e) => setDrafts((d) => ({ ...d, [store]: e.target.value }))}
                placeholder={`Neuer Eintrag in ${LABEL[store]}…`}
                aria-label={`Neuer Eintrag ${LABEL[store]}`}
              />
              <button type="button" style={ui.button} onClick={() => void add(store)}>
                Hinzufügen
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
