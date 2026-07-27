import type { RaiderClient, SetupStatus, TelegramChat, TelegramPairingCode } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
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
  SectionTitle,
  Skeleton,
  StatusDot,
} from "../kit";
import { useToast } from "../Toast";
import { errorText } from "../ui";

/** Zeitpunkt fürs Lesen ohne Fachwissen (Datum + Uhrzeit, lokale Zeitzone). */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

/** Nur die Uhrzeit, für den Ablauf eines Kopplungs-Codes. */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Wie viele Minuten ein Code ab seiner Erzeugung gültig ist. */
function validMinutes(code: TelegramPairingCode): number {
  const ms = new Date(code.expiresAt).getTime() - new Date(code.createdAt).getTime();
  return Math.max(1, Math.round(ms / 60000));
}

/** Name für einen Kontakt, wenn Telegram keinen Anzeigenamen mitgeschickt hat. */
function chatLabel(chat: TelegramChat): string {
  return chat.label ?? `Unbenannter Kontakt (Chat ${chat.chatId})`;
}

type LoadState = "loading" | "error" | "ready";

/**
 * Telegram-Kopplung: Schritt-für-Schritt-Anleitung, um Raider vom Handy aus
 * erreichbar zu machen, plus Verwaltung der bereits gekoppelten Kontakte.
 *
 * Der Bot-Token wird komplett über `setup.apply` im Core verwaltet — er lässt
 * sich hier hinterlegen, ersetzen und entfernen, ohne `.env` von Hand zu
 * bearbeiten und ohne Raider neu zu starten. Der Token selbst wird NIE vom
 * Core zurückgegeben, darum zeigt diese Oberfläche ihn auch nie an.
 */
export function TelegramPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [code, setCode] = useState<TelegramPairingCode | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [creatingCode, setCreatingCode] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([client.getSetup(), client.listTelegramChats()]);
      setSetup(s);
      setChats(c.chats);
      setError(null);
      setLoadState("ready");
    } catch (err) {
      setError(errorText(err));
      setLoadState("error");
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Speichert, ersetzt (nicht-leerer Wert) oder entfernt (leerer String) den Token. */
  async function saveToken(value: string): Promise<void> {
    setSavingToken(true);
    try {
      const next = await client.applySetup({ telegramToken: value });
      setSetup(next);
      setTokenInput("");
      setReplacing(false);
      toast.show(value === "" ? "Bot-Token entfernt." : "Bot-Token gespeichert.");
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setSavingToken(false);
    }
  }

  function startReplace(): void {
    setTokenInput("");
    setReplacing(true);
  }

  async function makeCode(): Promise<void> {
    setCreatingCode(true);
    try {
      setCode(await client.createPairingCode());
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setCreatingCode(false);
    }
  }

  async function copyCode(text: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(message);
    } catch {
      toast.showError("Kopieren war leider nicht möglich.");
    }
  }

  async function unpair(chat: TelegramChat): Promise<void> {
    try {
      await client.unpairTelegramChat(chat.chatId);
      await load();
      toast.show(`${chatLabel(chat)} wurde entkoppelt.`);
    } catch (err) {
      toast.showError(errorText(err));
    }
  }

  return (
    <Page
      title="Telegram"
      subtitle="Kopple deinen Telegram-Zugang, um mit Raider auch unterwegs vom Handy aus zu schreiben."
      actions={<IconButton icon="refresh" label="Aktualisieren" onClick={() => void load()} />}
      narrow
    >
      {loadState === "loading" && (
        <Card>
          <Skeleton rows={3} />
        </Card>
      )}

      {loadState === "error" && error !== null && <Note tone="error">{error}</Note>}

      {loadState === "ready" && setup !== null && (
        <>
          <Card title="1. Bot-Token einrichten">
            {setup.fromEnv.telegramToken ? (
              <div className="rd-stack rd-stack--tight">
                <div className="rd-row">
                  <StatusDot tone="ok" />
                  <strong>Bot-Token ist gesetzt</strong>
                </div>
                <Note tone="info">
                  Der Wert kommt aus der Datei <code className="rd-mono">.env</code> im
                  Raider-Ordner — dort hat er Vorrang, darum lässt er sich hier nicht ändern.
                </Note>
              </div>
            ) : setup.hasTelegramToken && !replacing ? (
              <div className="rd-spread">
                <div className="rd-row">
                  <Badge tone="ok">Hinterlegt</Badge>
                  <span className="rd-muted">
                    Raider kann Telegram-Nachrichten empfangen und beantworten.
                  </span>
                </div>
                <div className="rd-row">
                  <Button variant="ghost" small onClick={startReplace} disabled={savingToken}>
                    Ersetzen
                  </Button>
                  <ConfirmButton
                    label="Entfernen"
                    confirmLabel="Wirklich entfernen"
                    onConfirm={() => void saveToken("")}
                  />
                </div>
              </div>
            ) : (
              <div className="rd-stack rd-stack--tight">
                <Field
                  label="Bot-Token"
                  hint="Bekommst du von @BotFather in Telegram. Wird nur gespeichert, nie wieder angezeigt."
                >
                  <Input
                    type="password"
                    autoComplete="off"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Bot-Token einfügen…"
                  />
                </Field>
                <div className="rd-row">
                  <Button
                    variant="primary"
                    disabled={tokenInput.trim() === "" || savingToken}
                    onClick={() => void saveToken(tokenInput.trim())}
                  >
                    {savingToken ? "Speichere…" : "Speichern"}
                  </Button>
                  {replacing && (
                    <Button
                      variant="ghost"
                      onClick={() => setReplacing(false)}
                      disabled={savingToken}
                    >
                      Abbrechen
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card title="2. Kopplungs-Code erzeugen">
            <p className="rd-muted" style={{ marginBottom: "var(--space-3)" }}>
              Der Code verbindet dein Telegram-Konto einmalig mit einem neuen Gespräch in Raider.
            </p>
            <Button
              variant="primary"
              icon="key"
              disabled={!setup.hasTelegramToken || creatingCode}
              onClick={() => void makeCode()}
            >
              {creatingCode ? "Erzeuge Code…" : "Kopplungs-Code erzeugen"}
            </Button>
            {!setup.hasTelegramToken && (
              <p className="rd-muted" style={{ marginTop: "var(--space-2)", fontSize: "0.85rem" }}>
                Zuerst oben einen Bot-Token hinterlegen.
              </p>
            )}

            {code !== null && (
              <div
                className="rd-card rd-card--flat"
                style={{ marginTop: "var(--space-3)", textAlign: "center" }}
              >
                <div className="rd-muted" style={{ marginBottom: "var(--space-2)" }}>
                  Schick deinem Bot in Telegram diese Nachricht:
                </div>
                <div
                  className="rd-mono"
                  style={{
                    fontSize: "1.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  /pair {code.code}
                </div>
                <div className="rd-row" style={{ justifyContent: "center" }}>
                  <Button
                    variant="ghost"
                    small
                    icon="copy"
                    onClick={() => void copyCode(`/pair ${code.code}`, "Befehl kopiert.")}
                  >
                    Befehl kopieren
                  </Button>
                  <Button
                    variant="quiet"
                    small
                    icon="copy"
                    onClick={() => void copyCode(code.code, "Code kopiert.")}
                  >
                    Nur den Code kopieren
                  </Button>
                </div>
                <div
                  className="rd-muted"
                  style={{ marginTop: "var(--space-2)", fontSize: "0.8rem" }}
                >
                  Gültig {validMinutes(code)} Minuten ab jetzt, also bis{" "}
                  {formatClock(code.expiresAt)} Uhr. Danach ist der Code wertlos — erzeuge dann
                  einfach einen neuen.
                </div>
              </div>
            )}
          </Card>

          <Card title="3. Erfolg erkennen">
            <p className="rd-muted">
              Sobald dein Bot den Code entgegennimmt, erscheint der Kontakt unten in der Liste —
              danach kannst du Raider ganz normal per Telegram-Nachricht schreiben.
            </p>
          </Card>

          <SectionTitle>
            Gekoppelte Kontakte {chats.length > 0 && <Badge tone="neutral">{chats.length}</Badge>}
          </SectionTitle>

          {chats.length === 0 && (
            <EmptyState
              icon="Telegram"
              title="Noch keine gekoppelten Kontakte"
              hint="Sobald jemand einen Kopplungs-Code an den Bot schickt und er angenommen wird, erscheint der Kontakt hier."
            />
          )}

          {chats.length > 0 && (
            <div className="rd-stack">
              {chats.map((chat) => (
                <Card key={chat.chatId}>
                  <div className="rd-spread">
                    <div>
                      <strong>{chatLabel(chat)}</strong>
                      <div className="rd-muted">
                        Gekoppelt seit {formatWhen(chat.pairedAt)} · Gespräch #{chat.sessionId}
                      </div>
                    </div>
                    <ConfirmButton
                      label="Entkoppeln"
                      confirmLabel="Wirklich entkoppeln"
                      onConfirm={() => void unpair(chat)}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
