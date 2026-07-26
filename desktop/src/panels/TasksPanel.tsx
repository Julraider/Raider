import type { Agent, RaiderClient, ScheduledTask, ScheduleKind } from "@raider/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  IconButton,
  Input,
  Note,
  Page,
  Select,
  Skeleton,
  StatusDot,
  Table,
  Textarea,
} from "../kit";
import { useToast } from "../Toast";
import { errorText } from "../ui";

/** Deutsche Bezeichnung je Zeitplan-Art, für Auswahlfeld und Anzeige. */
const KIND_LABEL: Record<ScheduleKind, string> = {
  daily: "Täglich",
  interval: "Wiederholt sich",
  once: "Einmalig",
};
const KINDS: ScheduleKind[] = ["daily", "interval", "once"];

type ActiveFilter = "all" | "enabled" | "disabled";

/** Formular-Zustand: enthält alle möglichen Eingaben, unabhängig von der gewählten Zeitplan-Art. */
interface Draft {
  name: string;
  agentId: number | null;
  kind: ScheduleKind;
  dailyTime: string;
  onceLocal: string;
  intervalAmount: string;
  intervalUnit: "minutes" | "hours";
  prompt: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  agentId: null,
  kind: "daily",
  dailyTime: "",
  onceLocal: "",
  intervalAmount: "60",
  intervalUnit: "minutes",
  prompt: "",
};

/** Datum + Uhrzeit in deutschem Format, oder Gedankenstrich bei fehlendem/ungültigem Wert. */
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO-Zeitstempel → Wert für ein `datetime-local`-Feld, in Ortszeit. */
function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Wert eines `datetime-local`-Felds (Ortszeit) → ISO-Zeitstempel für den Core. */
function localInputToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function unitPhrase(amount: number, singular: string, plural: string): string {
  return `Alle ${amount} ${amount === 1 ? singular : plural}`;
}

/**
 * Klartext statt roher Zeitplan-Werte: „alle 3600 Sekunden" liest sich
 * niemand gern vor — „Alle 1 Stunde" schon.
 */
function describeSchedule(kind: ScheduleKind, value: string): string {
  if (kind === "daily") {
    return /^\d{2}:\d{2}$/.test(value) ? `Täglich um ${value} Uhr` : `Täglich (${value})`;
  }
  if (kind === "once") {
    return `Einmalig am ${formatDateTime(value)}`;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return `Alle ${value} Sekunden`;
  if (seconds % 86400 === 0) return unitPhrase(seconds / 86400, "Tag", "Tage");
  if (seconds % 3600 === 0) return unitPhrase(seconds / 3600, "Stunde", "Stunden");
  if (seconds % 60 === 0) return unitPhrase(seconds / 60, "Minute", "Minuten");
  return unitPhrase(seconds, "Sekunde", "Sekunden");
}

/** Baut den Formular-Zustand aus einer bestehenden Aufgabe (zum Bearbeiten). */
function draftFromTask(task: ScheduledTask): Draft {
  const base: Draft = {
    ...EMPTY_DRAFT,
    name: task.name,
    agentId: task.agentId,
    kind: task.scheduleKind,
    prompt: task.prompt,
  };
  if (task.scheduleKind === "daily") return { ...base, dailyTime: task.scheduleValue };
  if (task.scheduleKind === "once")
    return { ...base, onceLocal: isoToLocalInput(task.scheduleValue) };
  const seconds = Number(task.scheduleValue);
  if (Number.isFinite(seconds) && seconds > 0 && seconds % 3600 === 0) {
    return { ...base, intervalAmount: String(seconds / 3600), intervalUnit: "hours" };
  }
  const minutes = Number.isFinite(seconds) ? Math.max(1, Math.round(seconds / 60)) : 60;
  return { ...base, intervalAmount: String(minutes), intervalUnit: "minutes" };
}

/** Errechnet den rohen Zeitplan-Wert für den Core aus dem Formular — oder `null`, solange er unvollständig ist. */
function scheduleValueFromDraft(draft: Draft): string | null {
  if (draft.kind === "daily") {
    return /^\d{2}:\d{2}$/.test(draft.dailyTime) ? draft.dailyTime : null;
  }
  if (draft.kind === "once") {
    return draft.onceLocal ? localInputToIso(draft.onceLocal) : null;
  }
  const amount = Number(draft.intervalAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return String(Math.round(amount * (draft.intervalUnit === "hours" ? 3600 : 60)));
}

function isValidDraft(draft: Draft): boolean {
  return (
    draft.name.trim() !== "" && draft.prompt.trim() !== "" && scheduleValueFromDraft(draft) !== null
  );
}

function agentName(agents: Agent[], agentId: number | null): string {
  if (agentId === null) return "Kein bestimmter Agent";
  return agents.find((a) => a.id === agentId)?.name ?? `Agent #${agentId}`;
}

/**
 * Geplante Aufgaben: anlegen, bearbeiten, an-/abschalten, sofort ausführen,
 * löschen. Die eigentliche Zeitsteuerung läuft im Core — hier wird sie nur
 * angezeigt und bedient.
 */
export function TasksPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActiveFilter>("all");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskList, agentList] = await Promise.all([
        client.listScheduledTasks(),
        client.listAgents(),
      ]);
      setTasks(taskList.tasks);
      setAgents(agentList.agents);
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

  const filteredTasks = useMemo(() => {
    if (filter === "enabled") return tasks.filter((t) => t.enabled);
    if (filter === "disabled") return tasks.filter((t) => !t.enabled);
    return tasks;
  }, [tasks, filter]);

  const enabledCount = useMemo(() => tasks.filter((t) => t.enabled).length, [tasks]);

  function openCreate(): void {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
  }

  function openEdit(task: ScheduledTask): void {
    setDraft(draftFromTask(task));
    setEditingId(task.id);
  }

  function closeForm(): void {
    setEditingId(null);
  }

  async function submitDraft(): Promise<void> {
    const scheduleValue = scheduleValueFromDraft(draft);
    if (!isValidDraft(draft) || scheduleValue === null || editingId === null) return;
    const payload = {
      name: draft.name.trim(),
      scheduleKind: draft.kind,
      scheduleValue,
      prompt: draft.prompt.trim(),
      agentId: draft.agentId,
    };
    setSaving(true);
    try {
      if (editingId === "new") {
        await client.createScheduledTask(payload);
        toast.show("Aufgabe angelegt.");
      } else {
        await client.updateScheduledTask(editingId, payload);
        toast.show("Aufgabe gespeichert.");
      }
      closeForm();
      await load();
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function runNow(id: number): Promise<void> {
    try {
      await client.runScheduledTask(id);
      toast.show("Aufgabe wurde gestartet.");
      await load();
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function toggleEnabled(task: ScheduledTask): Promise<void> {
    try {
      await client.updateScheduledTask(task.id, { enabled: !task.enabled });
      toast.show(task.enabled ? "Aufgabe pausiert." : "Aufgabe aktiviert.");
      await load();
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function removeTask(id: number): Promise<void> {
    try {
      await client.deleteScheduledTask(id);
      toast.show("Aufgabe gelöscht.");
      await load();
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  return (
    <Page
      title="Aufgaben"
      subtitle="Aufträge, die Raider automatisch zu einem Zeitpunkt oder in festen Abständen ausführt."
      actions={
        <Button variant="primary" icon="plus" onClick={openCreate} disabled={editingId !== null}>
          Neue Aufgabe
        </Button>
      }
    >
      <div className="rd-stack">
        {error !== null && <Note tone="error">{error}</Note>}

        {editingId !== null && (
          <Card title={editingId === "new" ? "Neue Aufgabe" : "Aufgabe bearbeiten"}>
            <div className="rd-stack">
              <Field label="Name" hint="Kurzer Name, an dem du die Aufgabe in der Liste erkennst.">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="z. B. Tägliche Zusammenfassung"
                />
              </Field>

              <Field
                label="Agent"
                hint="Wer den Auftrag erhält. Ohne Auswahl übernimmt der Standard-Agent."
              >
                <Select
                  value={draft.agentId === null ? "" : String(draft.agentId)}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      agentId: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">Kein bestimmter Agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={String(agent.id)}>
                      {agent.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Zeitplan-Art">
                <Select
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, kind: e.target.value as ScheduleKind }))
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>

              {draft.kind === "daily" && (
                <Field label="Uhrzeit" hint="Läuft jeden Tag zu dieser Uhrzeit.">
                  <Input
                    type="time"
                    value={draft.dailyTime}
                    onChange={(e) => setDraft((d) => ({ ...d, dailyTime: e.target.value }))}
                  />
                </Field>
              )}

              {draft.kind === "once" && (
                <Field label="Zeitpunkt" hint="Läuft genau einmal, zu diesem Zeitpunkt.">
                  <Input
                    type="datetime-local"
                    value={draft.onceLocal}
                    onChange={(e) => setDraft((d) => ({ ...d, onceLocal: e.target.value }))}
                  />
                </Field>
              )}

              {draft.kind === "interval" && (
                <Field label="Abstand" hint="Läuft immer wieder, in diesem Abstand.">
                  <div className="rd-row">
                    <Input
                      type="number"
                      min={1}
                      style={{ maxWidth: 120 }}
                      value={draft.intervalAmount}
                      onChange={(e) => setDraft((d) => ({ ...d, intervalAmount: e.target.value }))}
                      aria-label="Abstand, Anzahl"
                    />
                    <Select
                      style={{ maxWidth: 140 }}
                      value={draft.intervalUnit}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          intervalUnit: e.target.value as "minutes" | "hours",
                        }))
                      }
                      aria-label="Abstand, Einheit"
                    >
                      <option value="minutes">Minuten</option>
                      <option value="hours">Stunden</option>
                    </Select>
                  </div>
                </Field>
              )}

              <Field
                label="Prompt"
                hint="Die Nachricht, die Raider zu diesem Zeitpunkt bearbeitet."
              >
                <Textarea
                  rows={3}
                  value={draft.prompt}
                  onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                  placeholder="z. B. Fasse meine offenen Aufgaben zusammen."
                />
              </Field>

              <div className="rd-row" style={{ justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={closeForm} disabled={saving}>
                  Abbrechen
                </Button>
                <Button
                  onClick={() => void submitDraft()}
                  disabled={saving || !isValidDraft(draft)}
                >
                  {editingId === "new" ? "Anlegen" : "Speichern"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {loading && error === null && (
          <Card>
            <Skeleton rows={4} />
          </Card>
        )}

        {!loading && error === null && tasks.length === 0 && editingId === null && (
          <EmptyState
            icon="Aufgaben"
            title="Noch keine Aufgaben"
            hint="Lege eine Aufgabe an — Raider führt sie automatisch zur passenden Zeit aus, z. B. eine tägliche Zusammenfassung am Morgen."
            action={
              <Button variant="primary" icon="plus" onClick={openCreate}>
                Aufgabe anlegen
              </Button>
            }
          />
        )}

        {!loading && error === null && tasks.length > 0 && (
          <>
            <div className="rd-row">
              <Button
                variant={filter === "all" ? "primary" : "quiet"}
                small
                onClick={() => setFilter("all")}
              >
                Alle ({tasks.length})
              </Button>
              <Button
                variant={filter === "enabled" ? "primary" : "quiet"}
                small
                onClick={() => setFilter("enabled")}
              >
                Aktiv ({enabledCount})
              </Button>
              <Button
                variant={filter === "disabled" ? "primary" : "quiet"}
                small
                onClick={() => setFilter("disabled")}
              >
                Pausiert ({tasks.length - enabledCount})
              </Button>
            </div>

            {filteredTasks.length === 0 ? (
              <Note>Keine Aufgaben in dieser Ansicht.</Note>
            ) : (
              <Table
                head={["Name", "Zeitplan", "Agent", "Status", "Letzter Lauf", "Nächster Lauf", ""]}
              >
                {filteredTasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.name}</td>
                    <td className="rd-muted">
                      {describeSchedule(task.scheduleKind, task.scheduleValue)}
                    </td>
                    <td className="rd-muted">{agentName(agents, task.agentId)}</td>
                    <td>
                      <span className="rd-row" style={{ gap: "0.4rem", alignItems: "center" }}>
                        <StatusDot tone={task.enabled ? "ok" : "neutral"} />
                        <Badge tone={task.enabled ? "ok" : "quiet"}>
                          {task.enabled ? "Aktiv" : "Pausiert"}
                        </Badge>
                      </span>
                    </td>
                    <td className="rd-muted">{formatDateTime(task.lastRunAt)}</td>
                    <td className="rd-muted">{formatDateTime(task.nextRunAt)}</td>
                    <td>
                      <div className="rd-row">
                        <IconButton
                          icon="play"
                          label="Jetzt ausführen"
                          onClick={() => void runNow(task.id)}
                        />
                        <IconButton
                          icon={task.enabled ? "pause" : "play"}
                          label={task.enabled ? "Pausieren" : "Aktivieren"}
                          onClick={() => void toggleEnabled(task)}
                        />
                        <IconButton icon="edit" label="Bearbeiten" onClick={() => openEdit(task)} />
                        <ConfirmButton onConfirm={() => void removeTask(task.id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
