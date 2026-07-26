import type { McpServer, McpServerType, RaiderClient, ToolCall } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

/** MCP-Server verwalten und Werkzeuge aufrufen (nur mit Freigabe). */
export function ToolsPanel({ client }: { client: RaiderClient }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [tools, setTools] = useState<Record<number, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // Formular „neuer Server".
  const [name, setName] = useState("");
  const [type, setType] = useState<McpServerType>("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");

  // Werkzeugaufruf.
  const [callServer, setCallServer] = useState("");
  const [callTool, setCallTool] = useState("");
  const [callArgs, setCallArgs] = useState("{}");
  const [approvedBy, setApprovedBy] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [srv, log] = await Promise.all([client.listMcpServers(), client.listToolCalls()]);
      setServers(srv.servers);
      setCalls(log.toolCalls);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addServer(): Promise<void> {
    if (!name.trim()) return;
    try {
      await client.createMcpServer({
        name: name.trim(),
        type,
        ...(type === "stdio"
          ? { command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [] }
          : { url: url.trim() }),
      });
      setName("");
      setCommand("");
      setArgs("");
      setUrl("");
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function test(id: number): Promise<void> {
    setError(null);
    try {
      const res = await client.testMcpServer(id);
      setTools((t) => ({ ...t, [id]: res.tools.map((tool) => tool.name) }));
      setNote(`Server #${id}: ${res.tools.length} Werkzeug(e).`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function act(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function call(): Promise<void> {
    setResult(null);
    setError(null);
    const serverId = Number(callServer);
    if (!Number.isInteger(serverId) || !callTool.trim() || !approvedBy.trim()) {
      setError("Server, Werkzeug und Freigabe (dein Name) sind nötig.");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = callArgs.trim() ? (JSON.parse(callArgs) as Record<string, unknown>) : {};
    } catch {
      setError("Argumente sind kein gültiges JSON.");
      return;
    }
    try {
      const record = await client.callTool(serverId, callTool.trim(), {
        arguments: parsed,
        approvedBy: approvedBy.trim(),
      });
      setResult(record.result);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Werkzeuge (MCP)</h2>
      {error !== null && <div style={ui.error}>{error}</div>}
      {note !== null && <div style={ui.muted}>{note}</div>}

      {servers.length === 0 && <p style={ui.empty}>Noch keine MCP-Server.</p>}
      {servers.map((server) => (
        <div key={server.id} style={ui.card}>
          <div style={ui.spread}>
            <div>
              <strong>{server.name}</strong> <span style={ui.badge}>{server.type}</span>{" "}
              <span style={ui.muted}>{server.enabled ? "aktiv" : "aus"}</span>
              <div style={ui.muted}>
                {server.type === "stdio"
                  ? `${server.command ?? ""} ${server.args.join(" ")}`
                  : server.url}
              </div>
              {tools[server.id] && (
                <div style={ui.muted}>Werkzeuge: {tools[server.id]?.join(", ") || "keine"}</div>
              )}
            </div>
            <div style={ui.row}>
              <button type="button" style={ui.buttonLight} onClick={() => void test(server.id)}>
                Testen
              </button>
              <button
                type="button"
                style={ui.buttonLight}
                onClick={() =>
                  void act(() => client.updateMcpServer(server.id, { enabled: !server.enabled }))
                }
              >
                {server.enabled ? "Aus" : "An"}
              </button>
              {confirmId === server.id ? (
                <>
                  <button
                    type="button"
                    style={ui.buttonDanger}
                    onClick={() => {
                      setConfirmId(null);
                      void act(() => client.deleteMcpServer(server.id));
                    }}
                  >
                    Wirklich löschen
                  </button>
                  <button type="button" style={ui.buttonLight} onClick={() => setConfirmId(null)}>
                    Abbrechen
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  style={ui.buttonDanger}
                  onClick={() => setConfirmId(server.id)}
                >
                  Löschen
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      <div style={{ ...ui.card, marginTop: "1rem" }}>
        <strong>Neuer Server</strong>
        <div style={{ ...ui.row, marginTop: "0.5rem", flexWrap: "wrap" }}>
          <input
            style={{ ...ui.input, minWidth: 140 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
          />
          <select
            style={ui.select}
            value={type}
            onChange={(e) => setType(e.target.value as McpServerType)}
            aria-label="Typ"
          >
            <option value="stdio">stdio</option>
            <option value="http">http</option>
          </select>
          {type === "stdio" ? (
            <>
              <input
                style={{ ...ui.input, minWidth: 140 }}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Befehl, z. B. node"
                aria-label="Befehl"
              />
              <input
                style={{ ...ui.input, minWidth: 140 }}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="Argumente (durch Leerzeichen)"
                aria-label="Argumente"
              />
            </>
          ) : (
            <input
              style={{ ...ui.input, minWidth: 220 }}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL, z. B. http://localhost:9000"
              aria-label="URL"
            />
          )}
          <button type="button" style={ui.button} onClick={() => void addServer()}>
            Hinzufügen
          </button>
        </div>
      </div>

      <div style={{ ...ui.card, marginTop: "1rem" }}>
        <strong>Werkzeug aufrufen (mit Freigabe)</strong>
        <div style={{ ...ui.row, marginTop: "0.5rem", flexWrap: "wrap" }}>
          <input
            style={{ ...ui.input, minWidth: 90 }}
            value={callServer}
            onChange={(e) => setCallServer(e.target.value)}
            placeholder="Server-ID"
            aria-label="Server-ID"
          />
          <input
            style={{ ...ui.input, minWidth: 140 }}
            value={callTool}
            onChange={(e) => setCallTool(e.target.value)}
            placeholder="Werkzeugname"
            aria-label="Werkzeugname"
          />
          <input
            style={{ ...ui.input, minWidth: 140 }}
            value={approvedBy}
            onChange={(e) => setApprovedBy(e.target.value)}
            placeholder="Freigabe (dein Name)"
            aria-label="Freigabe"
          />
        </div>
        <textarea
          style={{
            ...ui.input,
            marginTop: "0.5rem",
            minHeight: 56,
            resize: "vertical",
            fontFamily: "monospace",
          }}
          value={callArgs}
          onChange={(e) => setCallArgs(e.target.value)}
          placeholder='Argumente als JSON, z. B. {"text":"Hallo"}'
          aria-label="Argumente"
        />
        <div style={{ ...ui.row, marginTop: "0.5rem" }}>
          <button type="button" style={ui.button} onClick={() => void call()}>
            Aufrufen
          </button>
        </div>
        {result !== null && <pre style={styles.pre}>{result || "(leer)"}</pre>}
      </div>

      <h2 style={{ ...ui.h2, marginTop: "1.5rem" }}>Protokoll</h2>
      {calls.length === 0 && <p style={ui.empty}>Noch keine Werkzeugaufrufe.</p>}
      {calls.map((entry) => (
        <div key={entry.id} style={ui.card}>
          <div style={ui.spread}>
            <div>
              <strong>{entry.toolName}</strong>{" "}
              {entry.isError && <span style={ui.badge}>Fehler</span>}
              <div style={ui.muted}>
                {entry.createdAt} · freigegeben von {entry.approvedBy ?? "—"}
              </div>
            </div>
          </div>
          <pre style={styles.pre}>{entry.result}</pre>
        </div>
      ))}
    </div>
  );
}

const styles = {
  pre: {
    marginTop: "0.5rem",
    padding: "0.6rem",
    background: "var(--border-soft)",
    borderRadius: 8,
    whiteSpace: "pre-wrap" as const,
    fontSize: "0.85rem",
    overflowX: "auto" as const,
  },
};
