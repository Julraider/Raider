import type { MemoryEntry, MemoryStore, MemoryView, RaiderClient } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  IconButton,
  Note,
  Page,
  Skeleton,
  Table,
  Textarea,
} from "../kit";
import { useToast } from "../Toast";
import { errorText } from "../ui";

const STORES: MemoryStore[] = ["user", "agent"];

/** Ab so vielen Einträgen wird je Speicher zunächst gekappt, mit Knopf zum Nachladen. */
const PAGE_SIZE = 50;

const LABEL: Record<MemoryStore, string> = { user: "Nutzerprofil", agent: "Notizen" };

const DESCRIPTION: Record<MemoryStore, string> = {
  user: "Feste Angaben zu dir, die Raider bei jedem Gespräch mitschickt — z. B. Vorlieben oder Kontext.",
  agent: "Notizen, die sich Raider selbst über seine Aufgaben macht.",
};

/** Datum + Uhrzeit in deutschem Format, oder Gedankenstrich bei ungültigem Wert. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Woher ein Eintrag stammt: von Hand eingetragen oder aus einem Gespräch übernommen. */
function sourceLabel(entry: MemoryEntry): string {
  return entry.sourceSessionId === null
    ? "Von Hand hinzugefügt"
    : `Aus Chat-Sitzung ${entry.sourceSessionId}`;
}

/** Ton des Auslastungs-Etiketts: erst ab 90 % warnen, sonst dezent. */
function usageTone(view: MemoryView): "warn" | "quiet" {
  return view.used >= view.limit * 0.9 ? "warn" : "quiet";
}

/** Kerngedächtnis ansehen, ergänzen und bearbeiten (Nutzerprofil + Notizen). */
export function MemoryPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<Record<MemoryStore, MemoryView | null>>({
    user: null,
    agent: null,
  });
  const [drafts, setDrafts] = useState<Record<MemoryStore, string>>({ user: "", agent: "" });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [visibleCounts, setVisibleCounts] = useState<Record<MemoryStore, number>>({
    user: PAGE_SIZE,
    agent: PAGE_SIZE,
  });

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
    } finally {
      setLoading(false);
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
      toast.show("Eintrag hinzugefügt.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  function startEdit(entry: MemoryEntry): void {
    setEditingId(entry.id);
    setEditText(entry.content);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(id: number): Promise<void> {
    const content = editText.trim();
    if (!content) return;
    try {
      await client.updateMemory(id, { content });
      cancelEdit();
      await load();
      toast.show("Gespeichert.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function remove(id: number): Promise<void> {
    try {
      await client.deleteMemory(id);
      await load();
      toast.show("Eintrag gelöscht.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  return (
    <Page
      title="Gedächtnis"
      subtitle="Das Kerngedächtnis wird bei jedem Gespräch automatisch mitgeschickt — als feste Grundlage, nicht als Verlauf."
      actions={<IconButton icon="refresh" label="Aktualisieren" onClick={() => void load()} />}
    >
      <div className="rd-stack">
        {error !== null && <Note tone="error">{error}</Note>}

        {loading &&
          error === null &&
          STORES.map((store) => (
            <Card key={store} title={LABEL[store]}>
              <Skeleton rows={3} />
            </Card>
          ))}

        {!loading &&
          error === null &&
          STORES.map((store) => {
            const view = views[store];
            return (
              <Card
                key={store}
                title={LABEL[store]}
                actions={
                  view && (
                    <Badge tone={usageTone(view)}>
                      {view.used.toLocaleString("de-DE")} / {view.limit.toLocaleString("de-DE")}{" "}
                      Zeichen
                    </Badge>
                  )
                }
              >
                <div className="rd-stack">
                  <p className="rd-muted" style={{ margin: 0 }}>
                    {DESCRIPTION[store]}
                  </p>

                  {view && view.entries.length === 0 && (
                    <EmptyState
                      icon="Gedächtnis"
                      title="Noch nichts gespeichert"
                      hint="Trag unten einen Eintrag ein, oder lass Raider im Gespräch selbst etwas festhalten."
                    />
                  )}

                  {view && view.entries.length > 0 && (
                    <Table head={["Eintrag", "Herkunft", "Aktualisiert", ""]}>
                      {view.entries.slice(0, visibleCounts[store]).map((entry) => (
                        <tr key={entry.id}>
                          <td style={{ minWidth: 220 }}>
                            {editingId === entry.id ? (
                              <Textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                aria-label="Eintrag bearbeiten"
                                autoFocus
                              />
                            ) : (
                              entry.content
                            )}
                          </td>
                          <td className="rd-muted">{sourceLabel(entry)}</td>
                          <td className="rd-muted">{formatDate(entry.updatedAt)}</td>
                          <td>
                            {editingId === entry.id ? (
                              <div className="rd-row">
                                <Button small onClick={() => void saveEdit(entry.id)}>
                                  Speichern
                                </Button>
                                <Button variant="ghost" small onClick={cancelEdit}>
                                  Abbrechen
                                </Button>
                              </div>
                            ) : (
                              <div className="rd-actions">
                                <IconButton
                                  icon="edit"
                                  label="Eintrag bearbeiten"
                                  onClick={() => startEdit(entry)}
                                />
                                <ConfirmButton onConfirm={() => void remove(entry.id)} />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  )}

                  {view && visibleCounts[store] < view.entries.length && (
                    <div>
                      <Button
                        small
                        variant="ghost"
                        onClick={() =>
                          setVisibleCounts((c) => ({ ...c, [store]: c[store] + PAGE_SIZE }))
                        }
                      >
                        Weitere anzeigen ({visibleCounts[store]} von {view.entries.length})
                      </Button>
                    </div>
                  )}

                  <Field label={`Neuer Eintrag in ${LABEL[store]}`}>
                    <div className="rd-row">
                      <div className="rd-grow">
                        <Textarea
                          value={drafts[store]}
                          onChange={(e) => setDrafts((d) => ({ ...d, [store]: e.target.value }))}
                          placeholder="Was soll sich Raider merken?"
                          rows={2}
                        />
                      </div>
                      <Button onClick={() => void add(store)} disabled={!drafts[store].trim()}>
                        Hinzufügen
                      </Button>
                    </div>
                  </Field>
                </div>
              </Card>
            );
          })}
      </div>
    </Page>
  );
}
