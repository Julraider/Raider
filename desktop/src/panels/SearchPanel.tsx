import type { ChatRole, RaiderClient, SearchHit } from "@raider/shared";
import { type CSSProperties, type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Note,
  Page,
  Select,
  Skeleton,
} from "../kit";
import { useToast } from "../Toast";
import { errorText } from "../ui";

type SortOrder = "relevanz" | "neu";
type Status = "idle" | "loading" | "error" | "done";

/**
 * Hervorhebung einer Fundstelle. Nutzt nur bestehende Farbvariablen (wie die
 * aktive Navigation), damit kein neuer Farbton in die Oberfläche kommt.
 */
const MARK_STYLE: CSSProperties = {
  background: "var(--accent-soft)",
  color: "var(--accent-soft-text)",
  borderRadius: 3,
  padding: "0 0.15rem",
  fontWeight: 600,
};

/** Rolle als deutsches Label für die Trefferliste. */
function roleLabel(role: ChatRole): string {
  if (role === "user") return "Du";
  if (role === "assistant") return "Raider";
  return "System";
}

/** Zeitpunkt eines Treffers, ausgeschrieben fürs Lesen ohne Fachwissen. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Zerlegt einen Snippet-Text in normale und hervorgehobene Abschnitte.
 * Der Core markiert Fundstellen mit eckigen Klammern (siehe
 * `snippet(messages_fts, 0, '[', ']', …)` in core/src/db/repository.ts) —
 * hier NIE dangerouslySetInnerHTML verwenden, sondern selbst zerlegen und
 * mit <mark> darstellen, damit kein Servertext als HTML interpretiert wird.
 */
function renderSnippet(snippet: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]*)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(snippet);
  let key = 0;
  while (match !== null) {
    if (match.index > cursor) {
      parts.push(<span key={key++}>{snippet.slice(cursor, match.index)}</span>);
    }
    parts.push(
      <mark key={key++} style={MARK_STYLE}>
        {match[1]}
      </mark>,
    );
    cursor = pattern.lastIndex;
    match = pattern.exec(snippet);
  }
  if (cursor < snippet.length) {
    parts.push(<span key={key++}>{snippet.slice(cursor)}</span>);
  }
  return parts;
}

/** Volltextsuche über alle gespeicherten Nachrichten (Chat- und Telegram-Verlauf). */
export function SearchPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOrder>("relevanz");

  async function runSearch(event: FormEvent): Promise<void> {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await client.search(q);
      setHits(res.hits);
      setSearchedFor(q);
      setStatus("done");
    } catch (err) {
      setError(errorText(err));
      setStatus("error");
    }
  }

  async function copySessionId(hit: SearchHit): Promise<void> {
    try {
      await navigator.clipboard.writeText(String(hit.sessionId));
      toast.show(`Gesprächs-Kennung #${hit.sessionId} kopiert.`);
    } catch {
      toast.showError("Kopieren war leider nicht möglich.");
    }
  }

  // Die Reihenfolge des Cores ist nach Relevanz sortiert; „Neueste zuerst"
  // sortiert nur die bereits geladenen Treffer neu — keine neue Anfrage nötig.
  const sortedHits = useMemo(() => {
    if (!hits) return hits;
    if (sort === "relevanz") return hits;
    return [...hits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [hits, sort]);

  return (
    <Page
      title="Suche"
      subtitle="Durchsucht den gesamten Verlauf — alle Chats und alle gekoppelten Telegram-Gespräche."
    >
      <Card>
        <form onSubmit={(e) => void runSearch(e)}>
          <Field label="Suchbegriff" hint="Enter zum Suchen">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Wonach suchst du? Z. B. ein Stichwort oder ein Name…"
            />
          </Field>
          <div style={{ marginTop: "var(--space-3)" }}>
            <Button variant="primary" icon="Suche" type="submit" disabled={query.trim() === ""}>
              Suchen
            </Button>
          </div>
        </form>
      </Card>

      {status === "error" && error !== null && <Note tone="error">{error}</Note>}

      {status === "loading" && (
        <Card>
          <Skeleton rows={4} />
        </Card>
      )}

      {status === "idle" && (
        <EmptyState
          icon="Suche"
          title="Noch nichts gesucht"
          hint="Gib oben einen Begriff ein und drück Enter — Raider durchsucht dann jede gespeicherte Nachricht."
        />
      )}

      {status === "done" && sortedHits !== null && sortedHits.length === 0 && (
        <EmptyState
          icon="Suche"
          title={`Nichts gefunden für „${searchedFor}"`}
          hint="Versuch ein kürzeres oder anderes Wort — die Suche findet nur ganze Wörter."
        />
      )}

      {status === "done" && sortedHits !== null && sortedHits.length > 0 && (
        <>
          <div className="rd-spread" style={{ marginBottom: "var(--space-3)" }}>
            <div className="rd-muted">
              {sortedHits.length === 1 ? "1 Treffer" : `${sortedHits.length} Treffer`} für „
              {searchedFor}"
            </div>
            {sortedHits.length > 1 && (
              <Field label="Reihenfolge">
                <Select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOrder)}
                  style={{ width: "auto" }}
                >
                  <option value="relevanz">Beste zuerst</option>
                  <option value="neu">Neueste zuerst</option>
                </Select>
              </Field>
            )}
          </div>
          <div className="rd-stack">
            {sortedHits.map((hit) => (
              <Card key={hit.messageId}>
                <div className="rd-spread" style={{ marginBottom: "var(--space-2)" }}>
                  <div className="rd-row">
                    <Badge tone={hit.role === "user" ? "quiet" : "neutral"}>
                      {roleLabel(hit.role)}
                    </Badge>
                    <span className="rd-muted">{formatWhen(hit.createdAt)}</span>
                  </div>
                  <Button variant="quiet" small icon="copy" onClick={() => void copySessionId(hit)}>
                    Gespräch #{hit.sessionId}
                  </Button>
                </div>
                <div>{renderSnippet(hit.snippet)}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
