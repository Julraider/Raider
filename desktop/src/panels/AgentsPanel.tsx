import type { Agent, RaiderClient } from "@raider/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Input,
  Note,
  Page,
  Skeleton,
  Table,
  Textarea,
} from "../kit";
import { useToast } from "../Toast";
import { errorText } from "../ui";

/** Ab so vielen Agenten wird die Liste zunächst gekappt, mit Knopf zum Nachladen. */
const PAGE_SIZE = 50;

/** Datum + Uhrzeit in deutscher Schreibweise. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Agenten: anlegen, bearbeiten, duplizieren, löschen. Ein Agent bündelt eine
 * Anweisung (Systemprompt) und ein Modell — im Chat wählt man aus, welcher
 * Agent antwortet.
 */
export function AgentsPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);

  const [editing, setEditing] = useState<Agent | null>(null);
  const [name, setName] = useState("");
  // Symbol wird nicht mehr im Formular gewählt (siehe unten) — beim Bearbeiten
  // übernehmen wir das vorhandene Symbol unverändert, neue Agenten bekommen keins.
  const [icon, setIcon] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const formRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { agents: list } = await client.listAgents();
      setAgents(list);
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

  // Nur für den Hinweistext im Modell-Feld — schlägt der Aufruf fehl, bleibt das Feld ohne Hinweis.
  useEffect(() => {
    client
      .health()
      .then((h) => setDefaultModel(h.provider.model))
      .catch(() => undefined);
  }, [client]);

  function reset(): void {
    setEditing(null);
    setName("");
    setIcon(null);
    setPrompt("");
    setModel("");
  }

  function startCreate(): void {
    reset();
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function edit(agent: Agent): void {
    setEditing(agent);
    setName(agent.name);
    setIcon(agent.icon);
    setPrompt(agent.systemPrompt);
    setModel(agent.model ?? "");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save(): Promise<void> {
    if (!name.trim()) {
      toast.showError("Bitte einen Namen eingeben.");
      return;
    }
    const body = {
      name: name.trim(),
      icon,
      systemPrompt: prompt,
      model: model.trim() === "" ? null : model.trim(),
    };
    setSaving(true);
    try {
      if (editing === null) await client.createAgent(body);
      else await client.updateAgent(editing.id, body);
      toast.show(editing === null ? "Agent angelegt." : "Agent gespeichert.");
      reset();
      await load();
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(agent: Agent): Promise<void> {
    try {
      await client.duplicateAgent(agent.id);
      await load();
      toast.show(`„${agent.name}" dupliziert.`);
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function remove(agent: Agent): Promise<void> {
    try {
      await client.deleteAgent(agent.id);
      if (editing?.id === agent.id) reset();
      await load();
      toast.show(`„${agent.name}" gelöscht.`);
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  return (
    <Page
      title="Agenten"
      subtitle='Ein Agent bündelt eine Anweisung (Systemprompt) und ein Modell — so kannst du für verschiedene Aufgaben verschiedene "Persönlichkeiten" einrichten. Im Chat wählst du aus, welcher Agent antwortet.'
      actions={
        <Button icon="plus" onClick={startCreate}>
          Neuer Agent
        </Button>
      }
    >
      {loading ? (
        <Card>
          <Skeleton rows={4} />
        </Card>
      ) : error !== null ? (
        <Note tone="error">
          {error}
          <div style={{ marginTop: "var(--space-2)" }}>
            <Button small variant="ghost" icon="refresh" onClick={() => void load()}>
              Erneut versuchen
            </Button>
          </div>
        </Note>
      ) : agents.length === 0 ? (
        <EmptyState
          icon="Agenten"
          title="Noch keine Agenten"
          hint="Lege deinen ersten Agenten an — mit eigener Anweisung und eigenem Modell für eine bestimmte Aufgabe."
          action={
            <Button icon="plus" onClick={startCreate}>
              Ersten Agenten anlegen
            </Button>
          }
        />
      ) : (
        <Card
          title={
            visibleCount < agents.length
              ? `${visibleCount} von ${agents.length} Agenten`
              : `${agents.length} Agent${agents.length === 1 ? "" : "en"}`
          }
          flat
        >
          <Table head={["Agent", "Modell", "Systemprompt", ""]}>
            {agents.slice(0, visibleCount).map((agent) => (
              <tr key={agent.id}>
                <td>
                  <div className="rd-row">
                    <Icon name={agent.icon || "Agenten"} size={18} />
                    <strong>{agent.name}</strong>
                  </div>
                </td>
                <td>
                  {agent.model ? (
                    <Badge>{agent.model}</Badge>
                  ) : (
                    <span className="rd-muted">
                      Standard{defaultModel ? ` (${defaultModel})` : ""}
                    </span>
                  )}
                </td>
                <td
                  className="rd-truncate"
                  style={{ maxWidth: 340 }}
                  title={agent.systemPrompt || undefined}
                >
                  {agent.systemPrompt ? agent.systemPrompt : <span className="rd-muted">—</span>}
                </td>
                <td>
                  <div className="rd-actions">
                    <Button variant="ghost" small icon="edit" onClick={() => edit(agent)}>
                      Bearbeiten
                    </Button>
                    <Button variant="ghost" small icon="copy" onClick={() => void duplicate(agent)}>
                      Duplizieren
                    </Button>
                    <ConfirmButton small onConfirm={() => void remove(agent)} />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {visibleCount < agents.length && (
            <div style={{ marginTop: "var(--space-2)" }}>
              <Button small variant="ghost" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Weitere anzeigen ({visibleCount} von {agents.length})
              </Button>
            </div>
          )}
        </Card>
      )}

      <div ref={formRef}>
        <Card title={editing === null ? "Neuer Agent" : `„${editing.name}" bearbeiten`}>
          <div className="rd-stack">
            {editing !== null && (
              <div className="rd-muted" style={{ fontSize: "0.78rem" }}>
                Zuletzt geändert: {formatDateTime(editing.updatedAt)}
              </div>
            )}
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Rechercheur"
              />
            </Field>
            <Field
              label="Modell"
              hint={`Leer lassen für das Standardmodell${defaultModel ? ` (${defaultModel})` : ""}.`}
            >
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="z. B. claude-opus-4"
              />
            </Field>
            <Field
              label="Systemprompt"
              hint="Wie soll sich der Agent verhalten? Diese Anweisung wird jeder Unterhaltung vorangestellt."
            >
              <Textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="z. B. Du bist ein knapper, sachlicher Assistent für …"
              />
            </Field>
            <div className="rd-row">
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Speichert…" : editing === null ? "Anlegen" : "Speichern"}
              </Button>
              {editing !== null && (
                <Button variant="ghost" onClick={reset}>
                  Abbrechen
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
