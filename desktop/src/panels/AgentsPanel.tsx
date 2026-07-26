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
  Select,
  Skeleton,
  Table,
  Textarea,
} from "../kit";
import { useToast } from "../Toast";
import { errorText } from "../ui";

/** Symbole zur Auswahl für einen Agenten — nur bestehende Icons, keine neuen. */
const AGENT_ICONS: { key: string; label: string }[] = [
  { key: "Agenten", label: "Agent (Standard)" },
  { key: "user", label: "Person" },
  { key: "shield", label: "Schutz" },
  { key: "terminal", label: "Terminal" },
  { key: "key", label: "Schlüssel" },
  { key: "eye", label: "Beobachter" },
  { key: "bell", label: "Erinnerung" },
  { key: "tag", label: "Etikett" },
];

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
  const [icon, setIcon] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [saving, setSaving] = useState(false);

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
    setIcon("");
    setPrompt("");
    setModel("");
    setFallbackModel("");
  }

  function startCreate(): void {
    reset();
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function edit(agent: Agent): void {
    setEditing(agent);
    setName(agent.name);
    setIcon(agent.icon ?? "");
    setPrompt(agent.systemPrompt);
    setModel(agent.model ?? "");
    setFallbackModel(agent.fallbackModel ?? "");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save(): Promise<void> {
    if (!name.trim()) {
      toast.showError("Bitte einen Namen eingeben.");
      return;
    }
    const body = {
      name: name.trim(),
      icon: icon === "" ? null : icon,
      systemPrompt: prompt,
      model: model.trim() === "" ? null : model.trim(),
      fallbackModel: fallbackModel.trim() === "" ? null : fallbackModel.trim(),
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
        <Card title={`${agents.length} Agent${agents.length === 1 ? "" : "en"}`} flat>
          <Table head={["Agent", "Modell", "Systemprompt", ""]}>
            {agents.map((agent) => (
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
                  {agent.fallbackModel && (
                    <div className="rd-muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                      Ausweichmodell: {agent.fallbackModel}
                    </div>
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
                  <div className="rd-row">
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
            <div className="rd-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 200px" }}>
                <Field label="Name">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z. B. Rechercheur"
                  />
                </Field>
              </div>
              <div style={{ flex: "0 1 200px" }}>
                <Field label="Symbol" hint="Erscheint neben dem Namen.">
                  <div className="rd-row">
                    <Icon name={icon || "Agenten"} size={20} />
                    <Select value={icon} onChange={(e) => setIcon(e.target.value)}>
                      <option value="">Kein Symbol</option>
                      {AGENT_ICONS.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Field>
              </div>
            </div>
            <div className="rd-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 200px" }}>
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
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <Field
                  label="Ausweichmodell (optional)"
                  hint="Springt ein, wenn das Hauptmodell nicht antwortet."
                >
                  <Input
                    value={fallbackModel}
                    onChange={(e) => setFallbackModel(e.target.value)}
                    placeholder="z. B. claude-haiku-4"
                  />
                </Field>
              </div>
            </div>
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
