import type { HealthReport, RaiderClient } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

/** Konfiguration ansehen und erklären. Read-only: Geheimnisse bleiben außen vor. */
export function SettingsPanel({ client }: { client: RaiderClient }) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHealth(await client.health());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Einstellungen</h2>
      {error !== null && <div style={ui.error}>{error}</div>}

      <div style={ui.card}>
        <strong>Aktuell aktiv</strong>
        {health ? (
          <>
            <div style={ui.muted}>Version: v{health.version}</div>
            <div style={ui.muted}>Datenbank: {health.database.path}</div>
            <div style={ui.muted}>
              Anbieter: {health.provider.name} / {health.provider.model} · API-Key{" "}
              {health.provider.hasApiKey ? "gesetzt" : "nicht gesetzt"}
            </div>
            <div style={ui.muted}>
              Dienste: Scheduler {on(health.workers.scheduler)} · Review {on(health.workers.review)}{" "}
              · Telegram {on(health.workers.telegram)}
            </div>
          </>
        ) : (
          <div style={ui.muted}>Lädt…</div>
        )}
      </div>

      <div style={ui.card}>
        <strong>Konfiguration ändern</strong>
        <div style={ui.muted}>
          Raider wird über die Datei <code>.env</code> (bzw. Umgebungsvariablen) eingestellt. Aus
          Sicherheitsgründen wird der API-Key nie in der Oberfläche gespeichert oder angezeigt. Nach
          einer Änderung den Core neu starten.
        </div>
        <div style={{ overflowX: "auto", marginTop: "0.6rem" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Variable</th>
                <th style={styles.th}>Zweck</th>
              </tr>
            </thead>
            <tbody>
              {ENV_VARS.map((row) => (
                <tr key={row.name}>
                  <td style={styles.td}>
                    <code>{row.name}</code>
                  </td>
                  <td style={styles.td}>{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function on(value: boolean): string {
  return value ? "an" : "aus";
}

const ENV_VARS: Array<{ name: string; purpose: string }> = [
  { name: "RAIDER_PROVIDER", purpose: "anthropic oder ollama (ohne Wert: automatisch)" },
  { name: "ANTHROPIC_API_KEY", purpose: "API-Key für Claude; nur serverseitig, nie geloggt" },
  { name: "RAIDER_MODEL", purpose: "Anthropic-Standardmodell" },
  { name: "RAIDER_OLLAMA_URL", purpose: "Adresse des lokalen Ollama-Servers" },
  { name: "RAIDER_OLLAMA_MODEL", purpose: "Ollama-Standardmodell" },
  { name: "RAIDER_PORT", purpose: "Port der lokalen API (Standard 4179)" },
  { name: "RAIDER_TELEGRAM_TOKEN", purpose: "Bot-Token von @BotFather; nie geloggt" },
  { name: "RAIDER_REVIEW_INTERVAL", purpose: "Hintergrund-Review alle N Sekunden (0 = aus)" },
  { name: "RAIDER_BACKUP_INTERVAL", purpose: "Automatische Sicherung alle N Sekunden (0 = aus)" },
  { name: "RAIDER_BACKUP_KEEP", purpose: "Wie viele Sicherungen aufbewahrt werden" },
];

const styles = {
  table: { borderCollapse: "collapse" as const, width: "100%", fontSize: "0.85rem" },
  th: {
    textAlign: "left" as const,
    padding: "0.3rem 0.5rem",
    borderBottom: "1px solid #ddd",
    color: "#555",
  },
  td: { padding: "0.3rem 0.5rem", borderBottom: "1px solid #eee", verticalAlign: "top" as const },
};
