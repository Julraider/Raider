import type { HealthReport, RaiderClient, StatsReport } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Note,
  Page,
  Skeleton,
  Stat,
  StatRow,
  StatusDot,
  Table,
} from "../kit";
import { useToast } from "../Toast";
import { errorText } from "../ui";

/** Klartext-Namen der Anbieter — „anthropic“ sagt einem Nicht-Entwickler nichts. */
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Claude (Anthropic, über das Internet)",
  ollama: "Ollama (läuft auf deinem Rechner)",
};

/** Einstellbare Werte, gruppiert — sonst ist die Liste eine unlesbare Wand. */
const SETTINGS_GROUPS: Array<{
  title: string;
  hint: string;
  rows: Array<{ name: string; purpose: string; standard: string }>;
}> = [
  {
    title: "Welche KI antwortet",
    hint: "Bestimmt, wer deine Fragen beantwortet und was das kostet.",
    rows: [
      {
        name: "RAIDER_PROVIDER",
        purpose: "„anthropic“ oder „ollama“. Ohne Angabe wählt Raider selbst.",
        standard: "automatisch",
      },
      {
        name: "ANTHROPIC_API_KEY",
        purpose: "Dein Schlüssel für Claude. Wird nie angezeigt und nie mitgeschrieben.",
        standard: "leer",
      },
      {
        name: "RAIDER_MODEL",
        purpose: "Welches Claude-Modell benutzt wird.",
        standard: "claude-sonnet-4-5",
      },
      {
        name: "RAIDER_OLLAMA_URL",
        purpose: "Adresse deines lokalen Ollama-Servers.",
        standard: "http://localhost:11434",
      },
      {
        name: "RAIDER_OLLAMA_MODEL",
        purpose: "Welches Ollama-Modell benutzt wird.",
        standard: "llama3.1",
      },
      {
        name: "RAIDER_MAX_TOKENS",
        purpose: "Wie lang eine Antwort höchstens werden darf.",
        standard: "1024",
      },
    ],
  },
  {
    title: "Wo Raider läuft",
    hint: "Adresse und Speicherorte auf deinem Rechner.",
    rows: [
      {
        name: "RAIDER_PORT",
        purpose: "Über welchen Anschluss die Oberfläche den Core erreicht.",
        standard: "4179",
      },
      {
        name: "RAIDER_DATA_DIR",
        purpose: "Ordner für Datenbank, Skills und Sicherungen.",
        standard: "~/Raider",
      },
      {
        name: "RAIDER_DB_PATH",
        purpose: "Pfad der Datenbankdatei.",
        standard: "~/Raider/raider.db",
      },
      {
        name: "RAIDER_SKILLS_DIR",
        purpose: "Ordner, in dem Skills als Dateien liegen.",
        standard: "~/Raider/skills",
      },
      {
        name: "RAIDER_LOG_REQUESTS",
        purpose: "„0“ schaltet das Mitschreiben der Zugriffe aus.",
        standard: "an",
      },
    ],
  },
  {
    title: "Gedächtnis",
    hint: "Wie viel sich Raider dauerhaft merken darf.",
    rows: [
      {
        name: "RAIDER_MEMORY_USER_LIMIT",
        purpose: "Platz für Notizen über dich (in Zeichen).",
        standard: "4000",
      },
      {
        name: "RAIDER_MEMORY_AGENT_LIMIT",
        purpose: "Platz für Notizen des Assistenten (in Zeichen).",
        standard: "2000",
      },
    ],
  },
  {
    title: "Automatik und Sicherungen",
    hint: "Was Raider von allein tut, während du nichts machst.",
    rows: [
      {
        name: "RAIDER_REVIEW_INTERVAL",
        purpose: "Alle wie viel Sekunden Raider im Hintergrund aufräumt. 0 = aus.",
        standard: "0 (aus)",
      },
      {
        name: "RAIDER_BACKUP_INTERVAL",
        purpose: "Alle wie viel Sekunden automatisch gesichert wird. 0 = aus.",
        standard: "0 (aus)",
      },
      {
        name: "RAIDER_BACKUP_KEEP",
        purpose: "Wie viele Sicherungen aufbewahrt werden.",
        standard: "10",
      },
      {
        name: "RAIDER_BACKUP_DIR",
        purpose: "Ordner für die Sicherungen.",
        standard: "~/Raider/backups",
      },
    ],
  },
  {
    title: "Telegram",
    hint: "Nur nötig, wenn du Raider auch per Telegram erreichen willst.",
    rows: [
      {
        name: "RAIDER_TELEGRAM_TOKEN",
        purpose: "Bot-Token von @BotFather. Wird nie angezeigt.",
        standard: "leer",
      },
      {
        name: "RAIDER_TELEGRAM_PAIRING_TTL",
        purpose: "Wie lange ein Kopplungscode gilt (Sekunden).",
        standard: "300",
      },
    ],
  },
];

/** Laufzeit in etwas, das man vorlesen kann. */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} Sekunden`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} Minuten`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std. ${minutes % 60} Min.`;
  return `${Math.floor(hours / 24)} Tage ${hours % 24} Std.`;
}

/**
 * Zeigt, wie Raider gerade eingestellt ist, und erklärt jeden Wert, den man
 * ändern kann. Bewusst nur zum Ansehen: Geheimnisse (API-Schlüssel, Bot-Token)
 * werden nie angezeigt und nie hier gespeichert — sie stehen ausschließlich in
 * der Datei `.env` neben dem Programm.
 */
export function SettingsPanel({ client }: { client: RaiderClient }) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [stats, setStats] = useState<StatsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [h, s] = await Promise.all([client.health(), client.stats()]);
      setHealth(h);
      setStats(s);
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

  async function copyPath(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      toast.show("Pfad kopiert.");
    } catch {
      toast.showError("Kopieren hat nicht geklappt.");
    }
  }

  const provider = health?.provider;
  const providerName = provider ? (PROVIDER_NAMES[provider.name] ?? provider.name) : "";
  // Ein Schlüssel wird nur bei Claude gebraucht — bei Ollama wäre die Warnung falsch.
  const keyNeeded = provider?.name === "anthropic";

  return (
    <Page
      title="Einstellungen"
      subtitle="So ist Raider gerade eingestellt — und wo du es änderst."
      actions={<IconButton icon="refresh" label="Neu laden" onClick={() => void load()} />}
    >
      {error !== null && <Note tone="error">{error}</Note>}

      {loading && !health ? (
        <Card>
          <Skeleton rows={4} />
        </Card>
      ) : (
        health !== null && (
          <>
            <StatRow>
              <Stat
                label="Zustand"
                value={health.status === "ok" ? "In Ordnung" : "Eingeschränkt"}
                tone={health.status === "ok" ? "ok" : "warn"}
                hint={`Läuft seit ${formatUptime(health.uptimeSeconds)}`}
              />
              <Stat label="Version" value={`v${health.version}`} hint="Stand des Programms" />
              {stats !== null && (
                <>
                  <Stat
                    label="Gespräche"
                    value={stats.sessions.toLocaleString("de-DE")}
                    hint={`${stats.messages.toLocaleString("de-DE")} Nachrichten`}
                  />
                  <Stat
                    label="Gemerkt"
                    value={(stats.memory.user + stats.memory.agent).toLocaleString("de-DE")}
                    hint={`${stats.skills} Skills · ${stats.scheduledTasks} Aufgaben`}
                  />
                </>
              )}
            </StatRow>

            <Card title="Welche KI gerade antwortet">
              <div className="rd-stack rd-stack--tight">
                <div className="rd-row">
                  <StatusDot tone="ok" />
                  <span>{providerName}</span>
                </div>
                <div className="rd-muted">
                  Modell: <span className="rd-mono">{provider?.model}</span>
                </div>
                <div className="rd-row">
                  {keyNeeded ? (
                    <Badge tone={provider?.hasApiKey ? "ok" : "warn"}>
                      {provider?.hasApiKey ? "Schlüssel hinterlegt" : "Kein Schlüssel hinterlegt"}
                    </Badge>
                  ) : (
                    <Badge tone="quiet">Kein Schlüssel nötig</Badge>
                  )}
                </div>
                {keyNeeded && !provider?.hasApiKey && (
                  <Note tone="error">
                    Ohne Schlüssel kann Claude nicht antworten. Trag <code>ANTHROPIC_API_KEY</code>{" "}
                    in die Datei <code>.env</code> ein und starte Raider neu.
                  </Note>
                )}
              </div>
            </Card>

            <Card title="Was im Hintergrund läuft">
              <div className="rd-row" style={{ gap: "var(--space-5)" }}>
                <span className="rd-row">
                  <StatusDot tone={health.workers.scheduler ? "ok" : "neutral"} />
                  Geplante Aufgaben {health.workers.scheduler ? "an" : "aus"}
                </span>
                <span className="rd-row">
                  <StatusDot tone={health.workers.review ? "ok" : "neutral"} />
                  Aufräumen im Hintergrund {health.workers.review ? "an" : "aus"}
                </span>
                <span className="rd-row">
                  <StatusDot tone={health.workers.telegram ? "ok" : "neutral"} />
                  Telegram {health.workers.telegram ? "an" : "aus"}
                </span>
              </div>
            </Card>

            <Card
              title="Wo deine Daten liegen"
              actions={
                <Button
                  variant="ghost"
                  small
                  icon="copy"
                  onClick={() => void copyPath(health.database.path)}
                >
                  Pfad kopieren
                </Button>
              }
            >
              <div className="rd-stack rd-stack--tight">
                <div className="rd-mono rd-truncate" title={health.database.path}>
                  {health.database.path}
                </div>
                <div className="rd-muted">
                  Alles bleibt auf deinem Rechner. Diese eine Datei enthält deine Gespräche, Notizen
                  und Skills — sie ist es wert, gesichert zu werden.
                </div>
              </div>
            </Card>
          </>
        )
      )}

      <Card title="Was du ändern kannst">
        <div className="rd-stack">
          <Note tone="info">
            <span>
              <Icon name="info" size={15} />{" "}
              <strong>Raider stellst du über die Datei „.env“ ein</strong> — sie liegt im
              Programmordner neben <code>package.json</code>. Kopiere dafür{" "}
              <code>.env.example</code> nach <code>.env</code>, trag deine Werte ein und starte
              Raider neu. Schlüssel und Token werden aus Sicherheitsgründen niemals in der
              Oberfläche angezeigt oder gespeichert.
            </span>
          </Note>

          {SETTINGS_GROUPS.map((group) => (
            <div key={group.title} className="rd-stack rd-stack--tight">
              <div>
                <div className="rd-card-title">{group.title}</div>
                <div className="rd-muted">{group.hint}</div>
              </div>
              <Table head={["Name", "Wofür", "Standard"]}>
                {group.rows.map((row) => (
                  <tr key={row.name}>
                    <td>
                      <span className="rd-mono">{row.name}</span>
                    </td>
                    <td>{row.purpose}</td>
                    <td className="rd-muted">{row.standard}</td>
                  </tr>
                ))}
              </Table>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}
