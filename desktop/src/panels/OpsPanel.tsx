import type {
  BackupInfo,
  EmergencyStopState,
  HealthReport,
  RaiderClient,
  StatsReport,
} from "@raider/shared";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Note,
  Page,
  Skeleton,
  StatusDot,
  Table,
} from "../kit";
import { useToast } from "../Toast";
import { errorText, formatBytes } from "../ui";

/**
 * Betrieb: ein Zustands-Überblick, kein Formular. Zeigt zuerst, ob alles in
 * Ordnung ist, dann den großen Not-Stopp, Nutzungszahlen, Sicherungen und
 * Wartungsaktionen — in der Reihenfolge, in der ein Problem auffallen würde.
 */
export function OpsPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [stats, setStats] = useState<StatsReport | null>(null);
  const [stop, setStop] = useState<EmergencyStopState | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Führt eine Aktion aus, meldet sie per Toast und lädt danach den Zustand neu. */
  async function run(action: () => Promise<unknown>, message: string): Promise<void> {
    setBusy(true);
    try {
      await action();
      toast.show(message);
      await load();
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const engaged = stop?.engaged ?? false;
  const overall = overallState(health, engaged);
  const key = health ? keyBadge(health) : null;
  const statItems = stats ? buildStatItems(stats) : [];
  // Die Sicherungen kommen neueste zuerst; die erste ist die letzte Sicherung.
  const letzteSicherung = backups[0];

  return (
    <Page
      title="Betrieb"
      subtitle="Zustand, Sicherungen und Wartung von Raider auf einen Blick."
      actions={<IconButton icon="refresh" label="Aktualisieren" onClick={() => void load()} />}
    >
      <div className="rd-stack">
        {loading && <Skeleton rows={10} />}

        {!loading && health === null && (
          <EmptyState
            icon="Betrieb"
            title="Keine Verbindung zum Hintergrundprogramm"
            hint="Raider konnte sich nicht mit seinem Hintergrundprogramm verbinden. Starte Raider einmal neu — hilft das nicht, notiere dir diese Meldung."
            action={
              <Button icon="refresh" onClick={() => void load()}>
                Erneut versuchen
              </Button>
            }
          />
        )}

        {!loading && health !== null && (
          <>
            {error !== null && <Note tone="error">{error}</Note>}

            <Card
              title="Gesamtzustand"
              actions={<Badge tone={overall.tone}>{overall.label}</Badge>}
            >
              <div className="rd-stack rd-stack--tight">
                <div className="rd-row">
                  <StatusDot tone={health.database.connected ? "ok" : "warn"} />
                  <span>
                    Datenbank {health.database.connected ? "verbunden" : "nicht erreichbar"} ·
                    Version {health.version} · läuft seit {formatUptime(health.uptimeSeconds)}
                  </span>
                </div>
                <div className="rd-row">
                  <span>
                    Anbieter <strong>{providerLabel(health.provider.name)}</strong> · Modell{" "}
                    <span className="rd-mono">{health.provider.model}</span>
                  </span>
                  {key !== null && <Badge tone={key.tone}>{key.label}</Badge>}
                </div>
                <div className="rd-row">
                  <span className="rd-row">
                    <StatusDot tone={health.workers.scheduler ? "ok" : "neutral"} />
                    Zeitplan
                  </span>
                  <span className="rd-row">
                    <StatusDot tone={health.workers.review ? "ok" : "neutral"} />
                    Hintergrund-Review
                  </span>
                  <span className="rd-row">
                    <StatusDot tone={health.workers.telegram ? "ok" : "neutral"} />
                    Telegram
                  </span>
                </div>
                <div className="rd-row">
                  <StatusDot tone={letzteSicherung ? "ok" : "warn"} />
                  <span>
                    {letzteSicherung
                      ? `Letzte Sicherung ${formatDateTime(letzteSicherung.createdAt)}`
                      : "Noch keine Sicherung angelegt"}
                  </span>
                </div>
              </div>
            </Card>

            <Card title="Not-Stopp">
              <div className="rd-spread">
                <div className="rd-stack rd-stack--tight" style={{ maxWidth: 460 }}>
                  <div className="rd-row">
                    <StatusDot tone={engaged ? "warn" : "ok"} />
                    <strong>{engaged ? "Angehalten" : "Läuft normal"}</strong>
                  </div>
                  <p className="rd-muted" style={{ margin: 0 }}>
                    {engaged
                      ? `Zeitplan, Telegram und Werkzeugaufrufe pausieren${
                          stop?.reason ? ` (${stop.reason})` : ""
                        }${
                          stop?.engagedAt ? ` — seit ${formatDateTime(stop.engagedAt)}` : ""
                        }. Im Chat antwortet Raider weiter, aber ohne Werkzeuge. Erst nach „Wieder freigeben" läuft alles wieder normal.`
                      : "Zeitplan, Telegram und Werkzeugaufrufe laufen normal. Der Not-Stopp hält den Zeitplan und Telegram sofort an und nimmt Raider alle Werkzeuge weg — auch mitten in einer laufenden Antwort."}
                  </p>
                </div>
                <Button
                  variant={engaged ? "primary" : "danger"}
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        engaged
                          ? client.releaseEmergencyStop()
                          : client.engageEmergencyStop("Desktop"),
                      engaged ? "Not-Stopp gelöst." : "Not-Stopp aktiviert.",
                    )
                  }
                >
                  {engaged ? "Wieder freigeben" : "Alles stoppen"}
                </Button>
              </div>
            </Card>

            <Card title="Nutzung">
              <div style={statStyles.grid}>
                {statItems.map((item) => (
                  <div key={item.label} style={statStyles.tile}>
                    <div style={statStyles.value}>{item.value.toLocaleString("de-DE")}</div>
                    <div className="rd-muted">{item.label}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Sicherungen"
              actions={
                backups.length > 0 && (
                  <Button
                    small
                    icon="save"
                    disabled={busy}
                    onClick={() => void run(() => client.createBackup(), "Sicherung angelegt.")}
                  >
                    Jetzt sichern
                  </Button>
                )
              }
            >
              {backups.length === 0 ? (
                <EmptyState
                  icon="save"
                  title="Noch keine Sicherung vorhanden"
                  hint="Eine Sicherung ist eine Kopie deiner Datenbank — sie schützt Gespräche, Gedächtnis und Skills vor Datenverlust."
                  action={
                    <Button
                      disabled={busy}
                      onClick={() => void run(() => client.createBackup(), "Sicherung angelegt.")}
                    >
                      Jetzt sichern
                    </Button>
                  }
                />
              ) : (
                <Table head={["Datei", "Angelegt", "Größe"]}>
                  {backups.map((backup) => (
                    <tr key={backup.file}>
                      <td>
                        <div
                          className="rd-mono rd-truncate"
                          style={{ maxWidth: 280 }}
                          title={backup.path}
                        >
                          {backup.file}
                        </div>
                      </td>
                      <td className="rd-muted">{formatDateTime(backup.createdAt)}</td>
                      <td className="rd-num">{formatBytes(backup.bytes)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card title="Wartung">
              <div className="rd-spread">
                <div className="rd-grow">
                  <div style={{ fontWeight: 600 }}>Hintergrund-Review</div>
                  <p className="rd-muted" style={{ margin: "0.2rem 0 0" }}>
                    Raider sieht sich die letzte Aktivität an und schlägt Verbesserungen vor
                    (Gedächtnis-Einträge, Skills). Vorschläge landen im Posteingang — nichts wird
                    automatisch übernommen.
                  </p>
                  {stats && (
                    <p className="rd-muted" style={{ margin: "0.3rem 0 0" }}>
                      {stats.reviewRuns.toLocaleString("de-DE")} Läufe bisher
                      {stats.pendingProposals > 0
                        ? ` · ${stats.pendingProposals.toLocaleString("de-DE")} offene Vorschläge`
                        : ""}
                      .
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() => client.runReview(), "Review ausgeführt — siehe Posteingang.")
                  }
                >
                  Jetzt ausführen
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </Page>
  );
}

/** Zusammenfassung des Gesamtzustands für das Etikett oben auf der Karte. */
function overallState(
  health: HealthReport | null,
  engaged: boolean,
): { tone: "ok" | "warn"; label: string } {
  if (health === null) return { tone: "warn", label: "Unbekannt" };
  if (engaged) return { tone: "warn", label: "Angehalten" };
  if (health.status === "ok") return { tone: "ok", label: "Alles in Ordnung" };
  return { tone: "warn", label: "Eingeschränkt" };
}

/** Anzeigename des Anbieters statt der internen Kennung. */
function providerLabel(name: string): string {
  if (name === "anthropic") return "Claude (Anthropic)";
  if (name === "ollama") return "Ollama (lokal)";
  return name;
}

/** Etikett für den API-Schlüssel — Ollama braucht keinen, darum kein Etikett. */
function keyBadge(health: HealthReport): { tone: "ok" | "warn" | "quiet"; label: string } | null {
  if (health.provider.name === "ollama") return null;
  return health.provider.hasApiKey
    ? { tone: "ok", label: "Schlüssel gesetzt" }
    : { tone: "warn", label: "Kein Schlüssel hinterlegt" };
}

/** Kacheln für die Nutzungs-Übersicht, aus den Zählerständen des Cores. */
function buildStatItems(stats: StatsReport): Array<{ label: string; value: number }> {
  return [
    { label: "Sitzungen", value: stats.sessions },
    { label: "Nachrichten", value: stats.messages },
    { label: "Gedächtnis · Nutzer", value: stats.memory.user },
    { label: "Gedächtnis · Agent", value: stats.memory.agent },
    { label: "Skills", value: stats.skills },
    { label: "MCP-Server", value: stats.mcpServers },
    { label: "Werkzeugaufrufe", value: stats.toolCalls },
    { label: "Offene Vorschläge", value: stats.pendingProposals },
    { label: "Geplante Aufgaben", value: stats.scheduledTasks },
    { label: "Review-Läufe", value: stats.reviewRuns },
  ];
}

/** Laufzeit in Stunden/Minuten statt roher Sekunden. */
function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  if (minutes > 0) return `${minutes} Min.`;
  return `${totalSeconds} Sek.`;
}

/** Datum + Uhrzeit in deutschem Format, oder Gedankenstrich bei ungültigem Wert. */
function formatDateTime(iso: string): string {
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

// Nutzungs-Kacheln: kit.tsx hat (noch) keinen Baustein für ein Kachelraster,
// darum ein kleines lokales Layout — Farben und Abstände bleiben CSS-Variablen.
const statStyles: Record<string, CSSProperties> = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: "var(--space-4)",
  },
  tile: { display: "flex", flexDirection: "column", gap: "0.15rem" },
  value: {
    fontSize: "1.3rem",
    fontWeight: 700,
    color: "var(--text-strong)",
    fontVariantNumeric: "tabular-nums",
  },
};
