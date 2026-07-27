import type {
  HealthReport,
  OllamaProbe,
  ProviderChoice,
  RaiderClient,
  SetupRequest,
  SetupStatus,
  StatsReport,
} from "@raider/shared";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";
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
        purpose: "Über welchen Anschluss das Fenster das Hintergrundprogramm erreicht.",
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

/** Erklärt, warum ein Feld hier nicht bearbeitbar ist, weil `.env` Vorrang hat. */
function EnvOverrideNote({ children }: { children: ReactNode }) {
  return (
    <Note tone="info">
      <span>
        <Icon name="lock" size={15} /> {children} Dieser Wert steht in deiner Datei{" "}
        <code>.env</code> und hat dort Vorrang. Ändere ihn dort — oder entferne ihn, dann kannst du
        ihn hier einstellen.
      </span>
    </Note>
  );
}

/**
 * Zeigt, wie Raider gerade eingestellt ist, und lässt die wichtigsten Werte
 * — Anbieter, Claude-Schlüssel, Modell, Telegram-Token — direkt hier ändern.
 * Der Core übernimmt das sofort, ohne Neustart. Geheimnisse (API-Schlüssel,
 * Bot-Token) werden nie angezeigt, auch nicht gekürzt: der Core speichert sie
 * in einer eigenen Datei mit Rechten nur für den Besitzer (0600). Steht ein
 * Wert stattdessen in der Datei `.env`, hat `.env` Vorrang — dann lässt er
 * sich hier nicht überschreiben, und die Oberfläche sagt das auch dazu.
 */
export function SettingsPanel({ client }: { client: RaiderClient }) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [stats, setStats] = useState<StatsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  // Einrichtung (Anbieter, Schlüssel, Modell, Telegram-Token) — eigener
  // Ladezustand, weil `getSetup()` unabhängig von Health/Stats läuft.
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [switchingProvider, setSwitchingProvider] = useState(false);

  // Ollama-Suche: eigener Zustand, weil sie nur gebraucht wird, wenn Ollama
  // gerade der gewählte Anbieter ist.
  const [ollama, setOllama] = useState<OllamaProbe | null>(null);
  const [probing, setProbing] = useState(false);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyReplacing, setApiKeyReplacing] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);

  const [modelInput, setModelInput] = useState("");
  const [savingModel, setSavingModel] = useState(false);

  const [telegramInput, setTelegramInput] = useState("");
  const [telegramReplacing, setTelegramReplacing] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);

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

  const loadSetup = useCallback(async () => {
    try {
      const s = await client.getSetup();
      setSetup(s);
      setSetupError(null);
    } catch (err) {
      setSetupError(errorText(err));
    } finally {
      setSetupLoading(false);
    }
  }, [client]);

  const runProbe = useCallback(async () => {
    setProbing(true);
    try {
      setOllama(await client.probeOllama());
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setProbing(false);
    }
  }, [client, toast]);

  useEffect(() => {
    void load();
    void loadSetup();
  }, [load, loadSetup]);

  // Das Modell-Textfeld folgt dem geladenen Stand, solange der Nutzer es
  // nicht gerade selbst bearbeitet (er tippt ja im selben Feld weiter).
  useEffect(() => {
    setModelInput(setup?.model ?? "");
  }, [setup?.model]);

  // Bei Ollama einmal automatisch nach einem laufenden Server suchen, statt
  // den Nutzer zuerst zum Klicken zu zwingen.
  useEffect(() => {
    if (setup?.provider === "ollama" && ollama === null && !probing) {
      void runProbe();
    }
  }, [setup?.provider, ollama, probing, runProbe]);

  /** Sendet eine Änderung an den Core und übernimmt die Antwort als neuen Stand. */
  async function applyPatch(patch: SetupRequest, successMessage: string): Promise<boolean> {
    try {
      const next = await client.applySetup(patch);
      setSetup(next);
      toast.show(successMessage);
      // Anbieter und Modell wirken sich auch auf die Zustandsanzeige unten aus.
      void load();
      return true;
    } catch (err) {
      toast.showError(errorText(err));
      return false;
    }
  }

  async function switchProvider(next: ProviderChoice): Promise<void> {
    if (setup === null || setup.fromEnv.provider || setup.provider === next) return;
    setSwitchingProvider(true);
    await applyPatch(
      { provider: next },
      next === "anthropic" ? "Claude ist jetzt aktiv." : "Ollama ist jetzt aktiv.",
    );
    setSwitchingProvider(false);
  }

  async function saveApiKey(): Promise<void> {
    if (apiKeyInput.trim() === "") {
      toast.showError("Bitte zuerst einen Schlüssel eintragen.");
      return;
    }
    setSavingApiKey(true);
    const ok = await applyPatch({ anthropicApiKey: apiKeyInput }, "Schlüssel gespeichert.");
    setSavingApiKey(false);
    if (ok) {
      setApiKeyInput("");
      setApiKeyReplacing(false);
    }
  }

  async function removeApiKey(): Promise<void> {
    const ok = await applyPatch({ anthropicApiKey: "" }, "Schlüssel entfernt.");
    if (ok) {
      setApiKeyInput("");
      setApiKeyReplacing(false);
    }
  }

  async function saveModel(): Promise<void> {
    const value = modelInput.trim();
    if (value === "" || value === setup?.model) return;
    setSavingModel(true);
    await applyPatch({ model: value }, "Modell gespeichert.");
    setSavingModel(false);
  }

  async function chooseOllamaModel(model: string): Promise<void> {
    if (model === "" || model === setup?.model) return;
    await applyPatch({ model }, "Modell gespeichert.");
  }

  async function saveTelegramToken(): Promise<void> {
    if (telegramInput.trim() === "") {
      toast.showError("Bitte zuerst ein Token eintragen.");
      return;
    }
    setSavingTelegram(true);
    const ok = await applyPatch({ telegramToken: telegramInput }, "Telegram-Token gespeichert.");
    setSavingTelegram(false);
    if (ok) {
      setTelegramInput("");
      setTelegramReplacing(false);
    }
  }

  async function removeTelegramToken(): Promise<void> {
    const ok = await applyPatch({ telegramToken: "" }, "Telegram-Token entfernt.");
    if (ok) {
      setTelegramInput("");
      setTelegramReplacing(false);
    }
  }

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
      actions={
        <IconButton
          icon="refresh"
          label="Neu laden"
          onClick={() => {
            void load();
            void loadSetup();
          }}
        />
      }
    >
      <Card title="Wie Raider antwortet">
        {setupLoading && setup === null ? (
          <Skeleton rows={4} />
        ) : setupError !== null && setup === null ? (
          <Note tone="error">{setupError}</Note>
        ) : setup === null ? (
          <EmptyState
            icon="alert"
            title="Einstellungen nicht geladen"
            hint="Versuch es oben über „Neu laden“ noch einmal."
          />
        ) : (
          <div className="rd-stack">
            <div className="rd-stack rd-stack--tight">
              <div className="rd-label">Anbieter</div>
              {setup.fromEnv.provider ? (
                <EnvOverrideNote>
                  Gerade aktiv: {PROVIDER_NAMES[setup.provider] ?? setup.provider}.
                </EnvOverrideNote>
              ) : (
                <div className="rd-row">
                  <Button
                    variant={setup.provider === "anthropic" ? "primary" : "ghost"}
                    icon="shield"
                    disabled={switchingProvider}
                    onClick={() => void switchProvider("anthropic")}
                  >
                    Claude
                  </Button>
                  <Button
                    variant={setup.provider === "ollama" ? "primary" : "ghost"}
                    icon="terminal"
                    disabled={switchingProvider}
                    onClick={() => void switchProvider("ollama")}
                  >
                    Ollama
                  </Button>
                </div>
              )}
            </div>

            {setup.provider === "anthropic" ? (
              <div className="rd-stack rd-stack--tight">
                <div className="rd-label">Claude-Schlüssel</div>
                {setup.fromEnv.apiKey ? (
                  <EnvOverrideNote>Dein Claude-Schlüssel ist gesetzt.</EnvOverrideNote>
                ) : setup.hasApiKey && !apiKeyReplacing ? (
                  <div className="rd-row">
                    <Badge tone="ok">hinterlegt</Badge>
                    <Button
                      variant="ghost"
                      small
                      icon="key"
                      onClick={() => setApiKeyReplacing(true)}
                    >
                      Ersetzen
                    </Button>
                    <ConfirmButton
                      label="Entfernen"
                      confirmLabel="Schlüssel wirklich entfernen"
                      onConfirm={() => void removeApiKey()}
                    />
                  </div>
                ) : (
                  <>
                    <Field
                      label="Neuer Schlüssel"
                      hint="Von console.anthropic.com — wird nie angezeigt, auch nicht gekürzt."
                    >
                      <Input
                        type="password"
                        autoComplete="off"
                        value={apiKeyInput}
                        placeholder="sk-ant-…"
                        onChange={(e) => setApiKeyInput(e.target.value)}
                      />
                    </Field>
                    <div className="rd-row">
                      <Button icon="save" disabled={savingApiKey} onClick={() => void saveApiKey()}>
                        {savingApiKey ? "Speichert…" : "Speichern"}
                      </Button>
                      {setup.hasApiKey && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setApiKeyReplacing(false);
                            setApiKeyInput("");
                          }}
                        >
                          Abbrechen
                        </Button>
                      )}
                    </div>
                    {!setup.hasApiKey && (
                      <Note tone="error">Ohne Schlüssel kann Claude nicht antworten.</Note>
                    )}
                  </>
                )}

                <div className="rd-label" style={{ marginTop: "var(--space-3)" }}>
                  Modell
                </div>
                <div className="rd-row">
                  <Input
                    value={modelInput}
                    style={{ maxWidth: 320 }}
                    onChange={(e) => setModelInput(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    small
                    disabled={savingModel || modelInput.trim() === "" || modelInput === setup.model}
                    onClick={() => void saveModel()}
                  >
                    {savingModel ? "Speichert…" : "Übernehmen"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rd-stack rd-stack--tight">
                <div className="rd-label">Ollama-Modell</div>
                {probing ? (
                  <Skeleton rows={2} />
                ) : ollama === null ? (
                  <Note tone="info">Suche nach einem laufenden Ollama-Server…</Note>
                ) : ollama.reachable && ollama.models.length > 0 ? (
                  <Field label="Modell" hint="Wird sofort übernommen.">
                    <Select
                      value={setup.model}
                      onChange={(e) => void chooseOllamaModel(e.target.value)}
                    >
                      {!ollama.models.includes(setup.model) && (
                        <option value={setup.model}>{setup.model}</option>
                      )}
                      {ollama.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <EmptyState
                    icon="alert"
                    title={
                      ollama.reachable ? "Keine Modelle gefunden" : "Kein Ollama-Server gefunden"
                    }
                    hint={
                      ollama.reachable
                        ? "Der Server läuft, hat aber noch kein Modell geladen. Lad eines mit „ollama pull …“ herunter und such dann erneut."
                        : "Ollama läuft nicht, oder ist unter der eingestellten Adresse nicht erreichbar. Starte Ollama und versuch es erneut."
                    }
                    action={
                      <Button variant="ghost" small icon="refresh" onClick={() => void runProbe()}>
                        Nochmal suchen
                      </Button>
                    }
                  />
                )}
              </div>
            )}

            <div className="rd-stack rd-stack--tight">
              <div className="rd-label">Telegram-Token</div>
              <div className="rd-muted">
                Damit du Raider auch per Telegram erreichst. Das Bot-Token bekommst du von
                @BotFather in Telegram.
              </div>
              {setup.fromEnv.telegramToken ? (
                <EnvOverrideNote>Dein Telegram-Token ist gesetzt.</EnvOverrideNote>
              ) : setup.hasTelegramToken && !telegramReplacing ? (
                <div className="rd-row">
                  <Badge tone="ok">hinterlegt</Badge>
                  <Button
                    variant="ghost"
                    small
                    icon="key"
                    onClick={() => setTelegramReplacing(true)}
                  >
                    Ersetzen
                  </Button>
                  <ConfirmButton
                    label="Entfernen"
                    confirmLabel="Token wirklich entfernen"
                    onConfirm={() => void removeTelegramToken()}
                  />
                </div>
              ) : (
                <>
                  <Field label="Neues Bot-Token">
                    <Input
                      type="password"
                      autoComplete="off"
                      value={telegramInput}
                      placeholder="123456:ABC-…"
                      onChange={(e) => setTelegramInput(e.target.value)}
                    />
                  </Field>
                  <div className="rd-row">
                    <Button
                      icon="save"
                      disabled={savingTelegram}
                      onClick={() => void saveTelegramToken()}
                    >
                      {savingTelegram ? "Speichert…" : "Speichern"}
                    </Button>
                    {setup.hasTelegramToken && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setTelegramReplacing(false);
                          setTelegramInput("");
                        }}
                      >
                        Abbrechen
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

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
                    Ohne Schlüssel kann Claude nicht antworten. Trag ihn oben bei „Wie Raider
                    antwortet“ ein.
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

      {/*
        Frühere Kernfunktion, jetzt nur noch zum Nachschlagen: Schlüssel und
        Anbieter stellt man oben bei „Wie Raider antwortet“ ein. Diese Tabelle
        bleibt für Fortgeschrittene, die einen Wert über `.env` setzen wollen —
        `.env` hat dabei weiterhin Vorrang vor den Einstellungen oben.
      */}
      <details className="rd-card">
        <summary className="rd-card-title" style={{ cursor: "pointer" }}>
          Alle Einstellungen zum Nachschlagen (für Fortgeschrittene)
        </summary>
        <div className="rd-stack" style={{ marginTop: "var(--space-3)" }}>
          <Note tone="info">
            <span>
              <Icon name="info" size={15} /> Schlüssel und Anbieter stellst du jetzt oben ein — ohne
              Neustart. Die Datei <code>.env</code> im Programmordner (neben{" "}
              <code>package.json</code>) ist nur noch für Fortgeschrittene gedacht: Ein dort
              eingetragener Wert hat Vorrang und lässt sich in der Oberfläche nicht überschreiben.
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
      </details>
    </Page>
  );
}
