import type {
  BackupInfo,
  EmergencyStopState,
  HealthReport,
  RaiderClient,
  StatsReport,
} from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, formatBytes, ui } from "../ui";

/** Betrieb: Gesundheit, Statistik, Backups, Not-Stopp und Review. */
export function OpsPanel({ client }: { client: RaiderClient }) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [stats, setStats] = useState<StatsReport | null>(null);
  const [stop, setStop] = useState<EmergencyStopState | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, s, e, b] = await Promise.all([
        client.health(),
        client.stats(),
        client.getEmergencyStop(),
        client.listBackups(),
      ]);
      setHealth(h);
      setStats(s);
      setStop(e);
      setBackups(b.backups);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, message: string): Promise<void> {
    setNote(null);
    try {
      await fn();
      setNote(message);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const engaged = stop?.engaged ?? false;

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Betrieb</h2>
      {error !== null && <div style={ui.error}>{error}</div>}
      {note !== null && (
        <div
          style={{
            ...ui.error,
            background: "#e7f5ec",
            color: "#1a7f3c",
            border: "1px solid #bfe3ce",
          }}
        >
          {note}
        </div>
      )}

      <div style={ui.card}>
        <div style={ui.spread}>
          <strong>Not-Stopp</strong>
          <button
            type="button"
            style={engaged ? ui.button : ui.buttonDanger}
            onClick={() =>
              void run(
                () =>
                  engaged ? client.releaseEmergencyStop() : client.engageEmergencyStop("Desktop"),
                engaged ? "Not-Stopp gelöst." : "Not-Stopp aktiviert.",
              )
            }
          >
            {engaged ? "Lösen" : "Alles stoppen"}
          </button>
        </div>
        <div style={ui.muted}>
          {engaged
            ? `Aktiv${stop?.reason ? ` (${stop.reason})` : ""} — keine Automatik.`
            : "Scheduler, Telegram-Antworten und Werkzeugaufrufe laufen normal."}
        </div>
      </div>

      {health && (
        <div style={ui.card}>
          <strong>Gesundheit</strong>
          <div style={ui.muted}>
            {health.status === "ok" ? "✅ ok" : "⚠️ eingeschränkt"} · v{health.version} · Laufzeit{" "}
            {health.uptimeSeconds}s
          </div>
          <div style={ui.muted}>
            Anbieter: {health.provider.name} / {health.provider.model} (Key{" "}
            {health.provider.hasApiKey ? "gesetzt" : "fehlt"})
          </div>
          <div style={ui.muted}>
            Dienste: Scheduler {onOff(health.workers.scheduler)}, Review{" "}
            {onOff(health.workers.review)}, Telegram {onOff(health.workers.telegram)}
          </div>
        </div>
      )}

      {stats && (
        <div style={ui.card}>
          <strong>Zählerstände</strong>
          <div style={ui.muted}>
            Sitzungen {stats.sessions} · Nachrichten {stats.messages} · Gedächtnis{" "}
            {stats.memory.user}/{stats.memory.agent} · Skills {stats.skills}
          </div>
          <div style={ui.muted}>
            MCP {stats.mcpServers} · Werkzeugaufrufe {stats.toolCalls} · Offene Vorschläge{" "}
            {stats.pendingProposals} · Aufgaben {stats.scheduledTasks} · Review-Läufe{" "}
            {stats.reviewRuns}
          </div>
        </div>
      )}

      <div style={ui.card}>
        <div style={ui.spread}>
          <strong>Sicherungen</strong>
          <div style={ui.row}>
            <button
              type="button"
              style={ui.buttonLight}
              onClick={() =>
                void run(() => client.runReview(), "Review ausgeführt — siehe Posteingang.")
              }
            >
              Review jetzt
            </button>
            <button
              type="button"
              style={ui.button}
              onClick={() => void run(() => client.createBackup(), "Sicherung angelegt.")}
            >
              Sichern
            </button>
          </div>
        </div>
        {backups.length === 0 && <div style={ui.muted}>Noch keine Sicherungen.</div>}
        {backups.map((backup) => (
          <div key={backup.file} style={ui.muted}>
            {backup.file} ({formatBytes(backup.bytes)})
          </div>
        ))}
      </div>
    </div>
  );
}

function onOff(value: boolean): string {
  return value ? "an" : "aus";
}
