import type { RaiderClient, SearchHit } from "@raider/shared";
import { type FormEvent, useState } from "react";
import { errorText, ui } from "../ui";

/** Volltextsuche über alle gespeicherten Nachrichten. */
export function SearchPanel({ client }: { client: RaiderClient }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    try {
      const res = await client.search(q);
      setHits(res.hits);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Suche</h2>
      {error !== null && <div style={ui.error}>{error}</div>}

      <form onSubmit={onSubmit} style={{ ...ui.row, marginBottom: "1rem" }}>
        <input
          style={ui.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Begriff im Verlauf suchen…"
          aria-label="Suchbegriff"
        />
        <button type="submit" style={ui.button}>
          Suchen
        </button>
      </form>

      {hits !== null && hits.length === 0 && <p style={ui.empty}>Nichts gefunden.</p>}
      {hits?.map((hit) => (
        <div key={hit.messageId} style={ui.card}>
          <div style={ui.muted}>
            {hit.role === "user" ? "Du" : "Raider"} · Sitzung #{hit.sessionId} · {hit.createdAt}
          </div>
          <div style={{ marginTop: "0.2rem" }}>{hit.snippet}</div>
        </div>
      ))}
    </div>
  );
}
