import type {
  McpServer,
  McpServerType,
  McpTool,
  RaiderClient,
  ToolCall,
  ToolPermission,
} from "@raider/shared";
import { Fragment, useCallback, useEffect, useState } from "react";
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

/** Datum + Uhrzeit in deutscher Schreibweise. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

/** Zerlegt „KEY=WERT"-Zeilen in ein Objekt; leere/kommentierte Zeilen werden übersprungen. */
function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

/**
 * Wortteile, die typischerweise auf einen eingreifenden Werkzeugnamen
 * hindeuten (etwas wird verändert, verschickt oder gelöscht). Nur ein
 * dezenter Hinweis beim Freigeben — keine Sperre, nur Ehrlichkeit.
 */
const SENSITIVE_WORDS = [
  "delete",
  "remove",
  "write",
  "send",
  "exec",
  "rm",
  "create",
  "update",
  "push",
];

/** Ob der Werkzeugname auf etwas Eingreifendes hindeutet (siehe oben). */
function looksSensitive(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return SENSITIVE_WORDS.some((word) => lower.includes(word));
}

/**
 * Werkzeuge (MCP): Zusatzprogramme verbinden, testen und je Werkzeug eine
 * Dauerfreigabe erteilen oder zurückziehen. Nur freigegebene Werkzeuge darf
 * Raider im Gespräch von sich aus benutzen — alles andere sieht das Modell
 * nicht einmal. Jeder Aufruf landet zusätzlich im Protokoll.
 */
export function ToolsPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();

  const [servers, setServers] = useState<McpServer[]>([]);
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  // Volle Werkzeug-Info (Name + Beschreibung) je Server, gefüllt beim Testen.
  const [tools, setTools] = useState<Record<number, McpTool[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  // Welcher Server gerade seine Werkzeuge samt Freigabe-Schaltern zeigt.
  const [expandedServer, setExpandedServer] = useState<number | null>(null);
  // Schlüssel `serverId:toolName` einer Freigabe, die gerade gesetzt/entfernt wird.
  const [pendingPermission, setPendingPermission] = useState<string | null>(null);

  // Formular „neuer Server".
  const [name, setName] = useState("");
  const [type, setType] = useState<McpServerType>("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [envText, setEnvText] = useState("");
  const [creating, setCreating] = useState(false);

  // Werkzeugaufruf.
  const [callServer, setCallServer] = useState("");
  const [callTool, setCallTool] = useState("");
  const [callArgs, setCallArgs] = useState("{}");
  const [approvedBy, setApprovedBy] = useState("");
  const [result, setResult] = useState<ToolCall | null>(null);
  const [calling, setCalling] = useState(false);

  // Protokoll: Filter.
  const [logServerFilter, setLogServerFilter] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);

  const load = useCallback(async () => {
    try {
      const [srv, log, perms] = await Promise.all([
        client.listMcpServers(),
        client.listToolCalls(),
        client.listToolPermissions(),
      ]);
      setServers(srv.servers);
      setCalls(log.toolCalls);
      setPermissions(perms.permissions);
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

  async function test(id: number): Promise<void> {
    setTesting(id);
    try {
      const res = await client.testMcpServer(id);
      setTools((t) => ({ ...t, [id]: res.tools }));
      toast.show(
        res.tools.length === 0
          ? "Verbunden — keine Werkzeuge gefunden."
          : `Verbunden — ${res.tools.length} Werkzeug${res.tools.length === 1 ? "" : "e"} gefunden.`,
      );
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setTesting(null);
    }
  }

  async function toggleEnabled(server: McpServer): Promise<void> {
    try {
      await client.updateMcpServer(server.id, { enabled: !server.enabled });
      await load();
      toast.show(server.enabled ? "Server ausgeschaltet." : "Server eingeschaltet.");
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  async function removeServer(server: McpServer): Promise<void> {
    try {
      await client.deleteMcpServer(server.id);
      await load();
      toast.show(`„${server.name}" gelöscht.`);
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  /** Ob dieses Werkzeug gerade eine Dauerfreigabe hat. */
  function isGranted(serverId: number, toolName: string): boolean {
    return permissions.some((p) => p.serverId === serverId && p.toolName === toolName);
  }

  /** Wie viele der bekannten Werkzeuge eines Servers freigegeben sind. */
  function grantedCount(serverId: number): number {
    return (tools[serverId] ?? []).filter((tool) => isGranted(serverId, tool.name)).length;
  }

  /** Schaltet die Dauerfreigabe für genau ein Werkzeug an oder aus. */
  async function togglePermission(serverId: number, toolName: string): Promise<void> {
    const key = `${serverId}:${toolName}`;
    const granted = isGranted(serverId, toolName);
    setPendingPermission(key);
    try {
      if (granted) {
        await client.revokeToolPermission(serverId, toolName);
        toast.show(`„${toolName}" gesperrt.`);
      } else {
        await client.grantToolPermission(serverId, toolName);
        toast.show(`„${toolName}" freigegeben — Raider darf es jetzt selbst benutzen.`);
      }
      const perms = await client.listToolPermissions();
      setPermissions(perms.permissions);
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setPendingPermission(null);
    }
  }

  async function addServer(): Promise<void> {
    if (!name.trim()) {
      toast.showError("Bitte einen Namen eingeben.");
      return;
    }
    if (type === "stdio" && !command.trim()) {
      toast.showError("Bitte einen Befehl eingeben.");
      return;
    }
    if (type === "http" && !url.trim()) {
      toast.showError("Bitte eine Adresse eingeben.");
      return;
    }
    setCreating(true);
    try {
      await client.createMcpServer({
        name: name.trim(),
        type,
        ...(type === "stdio"
          ? { command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [] }
          : { url: url.trim() }),
        env: parseEnvLines(envText),
      });
      setName("");
      setCommand("");
      setArgs("");
      setUrl("");
      setEnvText("");
      await load();
      toast.show("Server hinzugefügt.");
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setCreating(false);
    }
  }

  async function call(): Promise<void> {
    const serverId = Number(callServer);
    if (!callServer || !Number.isInteger(serverId)) {
      toast.showError("Bitte einen Server auswählen.");
      return;
    }
    if (!callTool.trim()) {
      toast.showError("Bitte ein Werkzeug auswählen oder eingeben.");
      return;
    }
    if (!approvedBy.trim()) {
      toast.showError("Bitte deinen Namen als Freigabe eintragen.");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = callArgs.trim() ? (JSON.parse(callArgs) as Record<string, unknown>) : {};
    } catch {
      toast.showError("Argumente sind kein gültiges JSON.");
      return;
    }
    setCalling(true);
    try {
      const record = await client.callTool(serverId, callTool.trim(), {
        arguments: parsed,
        approvedBy: approvedBy.trim(),
      });
      setResult(record);
      await load();
      if (record.isError) toast.showError("Das Werkzeug hat einen Fehler gemeldet.");
      else toast.show("Werkzeug ausgeführt.");
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setCalling(false);
    }
  }

  async function copyResult(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.show("In die Zwischenablage kopiert.");
    } catch {
      toast.showError("Kopieren nicht möglich.");
    }
  }

  function serverName(serverId: number | null): string {
    if (serverId === null) return "—";
    const server = servers.find((s) => s.id === serverId);
    return server ? server.name : `Server #${serverId} (gelöscht)`;
  }

  const selectedTools = callServer ? (tools[Number(callServer)] ?? []).map((t) => t.name) : [];
  const filteredCalls = calls.filter((entry) => {
    if (onlyErrors && !entry.isError) return false;
    if (logServerFilter && String(entry.serverId) !== logServerFilter) return false;
    return true;
  });
  const errorCount = calls.filter((entry) => entry.isError).length;

  return (
    <Page
      title="Werkzeuge"
      subtitle="Ein MCP-Server ist ein Zusatzprogramm, das Raider neue Fähigkeiten gibt — z. B. Dateizugriff, Websuche oder einen Kalender. Freigegebene Werkzeuge darf Raider im Gespräch von sich aus benutzen, ohne jedes Mal zu fragen. Alles andere bleibt gesperrt."
    >
      <Card title="Verbundene Server">
        {loading ? (
          <Skeleton rows={3} />
        ) : error !== null ? (
          <Note tone="error">{error}</Note>
        ) : servers.length === 0 ? (
          <EmptyState
            icon="Werkzeuge"
            title="Noch kein Server verbunden"
            hint="Füge unten deinen ersten MCP-Server hinzu, um Raider neue Fähigkeiten zu geben."
          />
        ) : (
          <Table head={["Server", "Verbindung", "Status", "Werkzeuge", ""]}>
            {servers.map((server) => {
              const serverTools = tools[server.id];
              return (
                <Fragment key={server.id}>
                  <tr>
                    <td>
                      <div className="rd-row">
                        <strong>{server.name}</strong>
                        <Badge tone="quiet">{server.type}</Badge>
                      </div>
                    </td>
                    <td className="rd-mono rd-truncate" style={{ maxWidth: 260 }}>
                      {server.type === "stdio"
                        ? `${server.command ?? ""} ${server.args.join(" ")}`.trim() || "—"
                        : (server.url ?? "—")}
                    </td>
                    <td>
                      <span className="rd-row">
                        <StatusDot tone={server.enabled ? "ok" : "neutral"} />
                        {server.enabled ? "Aktiv" : "Aus"}
                      </span>
                    </td>
                    <td>
                      {serverTools === undefined ? (
                        <span className="rd-muted">Noch nicht getestet</span>
                      ) : serverTools.length === 0 ? (
                        <span className="rd-muted">Keine gefunden</span>
                      ) : (
                        <Badge tone={grantedCount(server.id) > 0 ? "ok" : "quiet"}>
                          {grantedCount(server.id)} von {serverTools.length} freigegeben
                        </Badge>
                      )}
                    </td>
                    <td>
                      <div className="rd-actions">
                        <IconButton
                          icon="chevron"
                          label={
                            expandedServer === server.id
                              ? "Freigaben verbergen"
                              : "Freigaben zeigen"
                          }
                          onClick={() =>
                            setExpandedServer((v) => (v === server.id ? null : server.id))
                          }
                        />
                        <Button
                          variant="ghost"
                          small
                          icon="refresh"
                          disabled={testing === server.id}
                          onClick={() => void test(server.id)}
                        >
                          {testing === server.id ? "Testet…" : "Testen"}
                        </Button>
                        <Button variant="ghost" small onClick={() => void toggleEnabled(server)}>
                          {server.enabled ? "Ausschalten" : "Einschalten"}
                        </Button>
                        <ConfirmButton small onConfirm={() => void removeServer(server)} />
                      </div>
                    </td>
                  </tr>
                  {expandedServer === server.id && (
                    <tr>
                      <td colSpan={5}>
                        {serverTools === undefined ? (
                          <Note tone="info">
                            Dieser Server wurde noch nicht getestet. Erst testen, dann freigeben —
                            teste ihn oben, um seine Werkzeuge zu sehen.
                          </Note>
                        ) : serverTools.length === 0 ? (
                          <Note tone="info">
                            Beim letzten Test wurden keine Werkzeuge gefunden.
                          </Note>
                        ) : (
                          <div className="rd-stack">
                            {serverTools.map((tool) => {
                              const granted = isGranted(server.id, tool.name);
                              const key = `${server.id}:${tool.name}`;
                              return (
                                <div className="rd-spread" key={tool.name}>
                                  <div className="rd-grow">
                                    <div className="rd-row">
                                      <span className="rd-mono">{tool.name}</span>
                                      <Badge tone={granted ? "ok" : "quiet"}>
                                        {granted ? "Freigegeben" : "Gesperrt"}
                                      </Badge>
                                      {looksSensitive(tool.name) && (
                                        <Badge tone="warn">Verändert etwas</Badge>
                                      )}
                                    </div>
                                    <div className="rd-hint">
                                      {tool.description ?? "Keine Beschreibung vorhanden."}
                                    </div>
                                  </div>
                                  <Button
                                    variant={granted ? "ghost" : "primary"}
                                    small
                                    icon={granted ? "lock" : "check"}
                                    disabled={pendingPermission === key}
                                    onClick={() => void togglePermission(server.id, tool.name)}
                                  >
                                    {pendingPermission === key
                                      ? "Einen Moment…"
                                      : granted
                                        ? "Sperren"
                                        : "Freigeben"}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="Neuer Server">
        <div className="rd-stack">
          <div className="rd-row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 200px" }}>
              <Field label="Name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Dateizugriff"
                />
              </Field>
            </div>
            <div style={{ flex: "0 1 200px" }}>
              <Field
                label="Art der Verbindung"
                hint="Programm startet Raider selbst, Adresse verbindet sich mit einem laufenden Dienst."
              >
                <Select value={type} onChange={(e) => setType(e.target.value as McpServerType)}>
                  <option value="stdio">Programm (stdio)</option>
                  <option value="http">Adresse (http)</option>
                </Select>
              </Field>
            </div>
          </div>
          {type === "stdio" ? (
            <div className="rd-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 200px" }}>
                <Field label="Befehl" hint="z. B. npx oder node">
                  <Input value={command} onChange={(e) => setCommand(e.target.value)} />
                </Field>
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <Field label="Argumente" hint="Durch Leerzeichen getrennt">
                  <Input value={args} onChange={(e) => setArgs(e.target.value)} />
                </Field>
              </div>
            </div>
          ) : (
            <Field label="Adresse (URL)" hint="z. B. http://localhost:9000">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          )}
          <Field
            label="Umgebungsvariablen (optional)"
            hint="Für Zugangsdaten, die der Server braucht — eine Zeile pro Eintrag, z. B. API_KEY=abc123. Werte werden danach in der Liste verborgen angezeigt."
          >
            <Textarea
              className="rd-mono"
              rows={2}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder="API_KEY=…"
            />
          </Field>
          <div>
            <Button icon="plus" disabled={creating} onClick={() => void addServer()}>
              {creating ? "Fügt hinzu…" : "Server hinzufügen"}
            </Button>
          </div>
        </div>
      </Card>

      {/*
        Frühere Kernfunktion, jetzt nur noch Diagnose: Seit Raider Werkzeuge
        selbst aufruft, braucht ein normaler Nutzer diese Karte praktisch nie
        mehr — sie bleibt eingeklappt und nur für Fortgeschrittene sichtbar,
        die einen einzelnen Aufruf von Hand ausprobieren wollen.
      */}
      <details className="rd-card">
        <summary className="rd-card-title" style={{ cursor: "pointer" }}>
          Zum Ausprobieren (für Fortgeschrittene)
        </summary>
        <Note tone="info">
          Diagnose-Werkzeug: Hier kannst du ein Werkzeug einmalig von Hand aufrufen — unabhängig von
          den Dauerfreigaben oben. Trag deinen Namen ein, um zu bestätigen, dass du genau diesen
          einen Aufruf erlaubst.
        </Note>
        <div className="rd-stack" style={{ marginTop: "var(--space-3)" }}>
          <div className="rd-row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 200px" }}>
              <Field label="Server">
                <Select
                  value={callServer}
                  onChange={(e) => {
                    setCallServer(e.target.value);
                    setCallTool("");
                  }}
                >
                  <option value="">Bitte wählen…</option>
                  {servers.map((s) => (
                    <option key={s.id} value={String(s.id)} disabled={!s.enabled}>
                      {s.name}
                      {s.enabled ? "" : " (aus)"}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <Field
                label="Werkzeug"
                hint={
                  callServer && selectedTools.length === 0
                    ? "Server zuerst testen, um die Namen zu sehen."
                    : undefined
                }
              >
                {selectedTools.length > 0 ? (
                  <Select value={callTool} onChange={(e) => setCallTool(e.target.value)}>
                    <option value="">Bitte wählen…</option>
                    {selectedTools.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={callTool}
                    onChange={(e) => setCallTool(e.target.value)}
                    placeholder="Werkzeugname"
                  />
                )}
              </Field>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <Field label="Freigabe (dein Name)" hint="Bestätigt, dass du diesen Aufruf erlaubst.">
                <Input
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  placeholder="z. B. Anna"
                />
              </Field>
            </div>
          </div>
          <Field label="Argumente (JSON)" hint='z. B. {"text":"Hallo"}'>
            <Textarea
              className="rd-mono"
              rows={3}
              value={callArgs}
              onChange={(e) => setCallArgs(e.target.value)}
            />
          </Field>
          <div>
            <Button icon="shield" disabled={calling} onClick={() => void call()}>
              {calling ? "Wird ausgeführt…" : "Freigeben und ausführen"}
            </Button>
          </div>
          {result !== null && (
            <Card
              flat
              title={
                <span className="rd-row">
                  Ergebnis {result.isError && <Badge tone="warn">Fehler</Badge>}
                </span>
              }
              actions={
                <IconButton
                  icon="copy"
                  label="Ergebnis kopieren"
                  onClick={() => void copyResult(result.result)}
                />
              }
            >
              <pre className="rd-mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {result.result || "(leer)"}
              </pre>
            </Card>
          )}
        </div>
      </details>

      <Card
        title="Protokoll"
        actions={
          <div className="rd-row">
            <Badge tone="quiet">{calls.length} gesamt</Badge>
            {errorCount > 0 && <Badge tone="warn">{errorCount} Fehler</Badge>}
          </div>
        }
      >
        {calls.length > 0 && (
          <div className="rd-row" style={{ marginBottom: "var(--space-3)" }}>
            <Select
              value={logServerFilter}
              onChange={(e) => setLogServerFilter(e.target.value)}
              aria-label="Protokoll nach Server filtern"
              style={{ maxWidth: 220 }}
            >
              <option value="">Alle Server</option>
              {servers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button
              variant={onlyErrors ? "primary" : "ghost"}
              small
              icon="alert"
              aria-pressed={onlyErrors}
              onClick={() => setOnlyErrors((v) => !v)}
            >
              Nur Fehler
            </Button>
          </div>
        )}
        {loading ? (
          <Skeleton rows={3} />
        ) : filteredCalls.length === 0 ? (
          <EmptyState
            icon="Suche"
            title={calls.length === 0 ? "Noch keine Werkzeugaufrufe" : "Keine Treffer"}
            hint={
              calls.length === 0
                ? "Sobald ein Werkzeug ausgeführt wurde, erscheint es hier — mit Ergebnis und wer es freigegeben hat."
                : "Passe die Filter oben an, um mehr Einträge zu sehen."
            }
          />
        ) : (
          <Table head={["Zeit", "Server", "Werkzeug", "Freigegeben von", "Status", ""]}>
            {filteredCalls.map((entry) => (
              <Fragment key={entry.id}>
                <tr>
                  <td className="rd-muted">{formatDateTime(entry.createdAt)}</td>
                  <td>{serverName(entry.serverId)}</td>
                  <td className="rd-mono">{entry.toolName}</td>
                  <td>{entry.approvedBy ?? "—"}</td>
                  <td>
                    {entry.isError ? (
                      <Badge tone="warn">Fehler</Badge>
                    ) : (
                      <Badge tone="ok">Erfolg</Badge>
                    )}
                  </td>
                  <td>
                    <IconButton
                      icon="chevron"
                      label={expanded === entry.id ? "Details einklappen" : "Details anzeigen"}
                      onClick={() => setExpanded((v) => (v === entry.id ? null : entry.id))}
                    />
                  </td>
                </tr>
                {expanded === entry.id && (
                  <tr>
                    <td colSpan={6}>
                      <div className="rd-row" style={{ alignItems: "flex-start" }}>
                        <pre
                          className="rd-mono rd-grow"
                          style={{ whiteSpace: "pre-wrap", margin: 0 }}
                        >
                          {entry.result || "(leer)"}
                        </pre>
                        <IconButton
                          icon="copy"
                          label="Ergebnis kopieren"
                          onClick={() => void copyResult(entry.result)}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        )}
      </Card>
    </Page>
  );
}
