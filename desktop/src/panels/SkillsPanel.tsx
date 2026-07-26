import type { Agent, RaiderClient, Skill } from "@raider/shared";
import { type CSSProperties, Fragment, useCallback, useEffect, useState } from "react";
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
  Table,
  Textarea,
} from "../kit";
import { useToast } from "../Toast";
import { errorText } from "../ui";

type StatusFilter = "all" | "active" | "inactive";

/** Passt ein Skill zur Suche (Name, Beschreibung, Kategorie)? */
function matchesSearch(skill: Skill, term: string): boolean {
  if (term === "") return true;
  const haystack = `${skill.name} ${skill.description} ${skill.category ?? ""}`.toLowerCase();
  return haystack.includes(term);
}

/**
 * Skills: anlegen, importieren, exportieren, Agenten zuweisen, an/aus, löschen.
 * Ein Skill ist eine Markdown-Datei mit zusätzlichen Anweisungen, die ein
 * Agent bei Bedarf bekommt (Ton, Fachwissen, feste Abläufe).
 */
export function SkillsPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  // Welche Agenten je Skill zugewiesen sind — der Core liefert das nur pro Agent,
  // deshalb bauen wir hier die umgekehrte Zuordnung (Skill -> Agenten) selbst auf.
  const [assignments, setAssignments] = useState<Record<number, Agent[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [content, setContent] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Anlegen.
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newContent, setNewContent] = useState("");

  // Import.
  const [markdown, setMarkdown] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([client.listSkills(), client.listAgents()]);
      setSkills(s.skills);
      setAgents(a.agents);
      const perAgent = await Promise.all(a.agents.map((agent) => client.listAgentSkills(agent.id)));
      const bySkill: Record<number, Agent[]> = {};
      a.agents.forEach((agent, i) => {
        for (const skill of perAgent[i]?.skills ?? []) {
          if (!bySkill[skill.id]) bySkill[skill.id] = [];
          bySkill[skill.id]?.push(agent);
        }
      });
      setAssignments(bySkill);
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

  async function show(id: number): Promise<void> {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    try {
      const skill = await client.getSkill(id);
      setContent(skill.content);
      setOpenId(id);
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  /** Vollständigen Markdown (mit Kopfdaten) in die Zwischenablage kopieren. */
  async function exportSkill(skill: Skill): Promise<void> {
    try {
      const { markdown: md } = await client.exportSkill(skill.id);
      await navigator.clipboard.writeText(md);
      toast.show(`„${skill.name}“ als Markdown kopiert.`);
    } catch {
      toast.showError("Kopieren nicht möglich.");
    }
  }

  async function toggleActive(skill: Skill): Promise<void> {
    try {
      await client.updateSkill(skill.id, { active: !skill.active });
      await load();
      toast.show(skill.active ? "Skill deaktiviert." : "Skill aktiviert.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function removeSkill(id: number): Promise<void> {
    try {
      await client.deleteSkill(id);
      if (openId === id) setOpenId(null);
      await load();
      toast.show("Skill gelöscht.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function create(): Promise<void> {
    if (!newName.trim()) return;
    try {
      await client.createSkill({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        category: newCategory.trim() || null,
        content: newContent,
      });
      setNewName("");
      setNewDescription("");
      setNewCategory("");
      setNewContent("");
      await load();
      toast.show("Skill angelegt.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function doImport(): Promise<void> {
    if (!markdown.trim()) return;
    try {
      await client.importSkill({ markdown });
      setMarkdown("");
      await load();
      toast.show("Skill importiert.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function assign(agentId: number, skillId: number): Promise<void> {
    try {
      await client.assignSkill(agentId, skillId);
      await load();
      toast.show("Skill zugewiesen.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function unassign(agentId: number, skillId: number): Promise<void> {
    try {
      await client.unassignSkill(agentId, skillId);
      await load();
      toast.show("Zuweisung entfernt.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  const term = search.trim().toLowerCase();
  const filtered = skills.filter(
    (skill) =>
      matchesSearch(skill, term) &&
      (statusFilter === "all" || (statusFilter === "active" ? skill.active : !skill.active)),
  );

  return (
    <Page
      title="Skills"
      subtitle="Skills sind zusätzliche Anweisungen für deine Agenten — Ton, Fachwissen oder feste Abläufe."
      actions={<IconButton icon="refresh" label="Aktualisieren" onClick={() => void load()} />}
    >
      <div className="rd-stack">
        {error !== null && <Note tone="error">{error}</Note>}

        {loading && error === null && (
          <Card>
            <Skeleton rows={4} />
          </Card>
        )}

        {!loading && error === null && (
          <Card title="Alle Skills" actions={<Badge tone="quiet">{skills.length} gesamt</Badge>}>
            <div className="rd-stack">
              <div className="rd-row">
                <div className="rd-grow">
                  <Field label="Suchen">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Nach Name, Beschreibung oder Kategorie…"
                    />
                  </Field>
                </div>
                <Field label="Status">
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  >
                    <option value="all">Alle</option>
                    <option value="active">Nur aktive</option>
                    <option value="inactive">Nur inaktive</option>
                  </Select>
                </Field>
              </div>

              {skills.length === 0 && (
                <EmptyState
                  icon="Skills"
                  title="Noch keine Skills"
                  hint="Leg unten einen neuen Skill an oder importiere eine vorhandene Markdown-Datei."
                />
              )}

              {skills.length > 0 && filtered.length === 0 && (
                <EmptyState
                  icon="Suche"
                  title="Keine Treffer"
                  hint="Andere Suche versuchen oder den Filter zurücksetzen."
                  action={
                    <Button
                      variant="ghost"
                      small
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                      }}
                    >
                      Filter zurücksetzen
                    </Button>
                  }
                />
              )}

              {filtered.length > 0 && (
                <Table head={["Skill", "Kategorie", "Status", "Zugewiesen an", "Aktionen"]}>
                  {filtered.map((skill) => {
                    const assigned = assignments[skill.id] ?? [];
                    const assignable = agents.filter(
                      (agent) => !assigned.some((a) => a.id === agent.id),
                    );
                    return (
                      <Fragment key={skill.id}>
                        <tr>
                          <td style={{ minWidth: 200 }}>
                            <div style={{ fontWeight: 600 }}>{skill.name}</div>
                            {skill.description && (
                              <div className="rd-muted">{skill.description}</div>
                            )}
                          </td>
                          <td>
                            {skill.category ? (
                              <Badge>{skill.category}</Badge>
                            ) : (
                              <span className="rd-muted">—</span>
                            )}
                          </td>
                          <td>
                            <Badge tone={skill.active ? "ok" : "quiet"}>
                              {skill.active ? "Aktiv" : "Aus"}
                            </Badge>
                          </td>
                          <td style={{ minWidth: 200 }}>
                            <div className="rd-row" style={{ flexWrap: "wrap" }}>
                              {assigned.length === 0 && (
                                <span className="rd-muted">Keinem Agenten zugewiesen</span>
                              )}
                              {assigned.map((agent) => (
                                <span key={agent.id} className="rd-row" style={{ gap: 2 }}>
                                  <Badge tone="quiet">{agent.name}</Badge>
                                  <IconButton
                                    icon="x"
                                    label={`Zuweisung zu ${agent.name} entfernen`}
                                    onClick={() => void unassign(agent.id, skill.id)}
                                  />
                                </span>
                              ))}
                            </div>
                            {assignable.length > 0 && (
                              <Select
                                defaultValue=""
                                onChange={(e) => {
                                  const agentId = Number(e.target.value);
                                  if (Number.isInteger(agentId) && agentId > 0) {
                                    void assign(agentId, skill.id);
                                  }
                                  e.target.value = "";
                                }}
                                aria-label={`Agent für ${skill.name} zuweisen`}
                                style={{ marginTop: "0.35rem" }}
                              >
                                <option value="">+ Agent zuweisen…</option>
                                {assignable.map((agent) => (
                                  <option key={agent.id} value={String(agent.id)}>
                                    {agent.name}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </td>
                          <td>
                            <div className="rd-row">
                              <Button variant="ghost" small onClick={() => void show(skill.id)}>
                                {openId === skill.id ? "Zu" : "Inhalt"}
                              </Button>
                              <Button
                                variant="ghost"
                                small
                                icon="copy"
                                onClick={() => void exportSkill(skill)}
                              >
                                Kopieren
                              </Button>
                              <Button
                                variant="ghost"
                                small
                                onClick={() => void toggleActive(skill)}
                              >
                                {skill.active ? "Aus" : "An"}
                              </Button>
                              <ConfirmButton onConfirm={() => void removeSkill(skill.id)} />
                            </div>
                          </td>
                        </tr>
                        {openId === skill.id && (
                          <tr>
                            <td colSpan={5}>
                              <pre style={styles.pre}>{content || "(kein Inhalt)"}</pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Table>
              )}
            </div>
          </Card>
        )}

        {!loading && error === null && (
          <Card title="Neuer Skill">
            <div className="rd-stack">
              <Field label="Name">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z. B. Höflicher Ton"
                />
              </Field>
              <div className="rd-row">
                <div className="rd-grow">
                  <Field label="Beschreibung" hint="Optional — wofür ist der Skill gedacht?">
                    <Input
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Kurze Erklärung"
                    />
                  </Field>
                </div>
                <div className="rd-grow">
                  <Field label="Kategorie" hint="Optional — zum Gruppieren">
                    <Input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="z. B. Ton"
                    />
                  </Field>
                </div>
              </div>
              <Field
                label="Inhalt"
                hint="Die Anweisung, die der Agent bekommt, wenn der Skill aktiv ist."
              >
                <Textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  placeholder="z. B. Antworte immer kurz und in einfachen Sätzen."
                />
              </Field>
              <div>
                <Button onClick={() => void create()} disabled={!newName.trim()}>
                  Anlegen
                </Button>
              </div>
            </div>
          </Card>
        )}

        {!loading && error === null && (
          <Card title="Skill importieren" flat>
            <div className="rd-stack">
              <Field
                label="Markdown"
                hint="Eine bestehende SKILL.md einfügen (mit Kopfdaten und Inhalt)."
              >
                <Textarea
                  className="rd-mono"
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  rows={5}
                  placeholder={"---\nname: Beispiel\ndescription: …\n---\n\nInhalt…"}
                />
              </Field>
              <div>
                <Button onClick={() => void doImport()} disabled={!markdown.trim()}>
                  Importieren
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Page>
  );
}

const styles: Record<string, CSSProperties> = {
  pre: {
    margin: 0,
    padding: "0.6rem",
    background: "var(--border-soft)",
    borderRadius: 8,
    whiteSpace: "pre-wrap",
    fontSize: "0.85rem",
    overflowX: "auto",
  },
};
