import type {
  RaiderClient,
  TelegramChat,
  TelegramPairingCode,
  TelegramStatusResponse,
} from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  IconButton,
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
 */
export function TelegramPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [code, setCode] = useState<TelegramPairingCode | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [creatingCode, setCreatingCode] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([client.telegramStatus(), client.listTelegramChats()]);
      setStatus(s);
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

      {loadState === "ready" && status !== null && (
        <>
          <Card title="1. Bot-Token einrichten">
            <div className="rd-row" style={{ marginBottom: "var(--space-2)" }}>
              <StatusDot tone={status.enabled ? "ok" : "warn"} />
              <strong>{status.enabled ? "Bot-Token ist gesetzt" : "Bot-Token fehlt noch"}</strong>
            </div>
            {status.enabled ? (
              <p className="rd-muted">
                Raider kann Telegram-Nachrichten empfangen und beantworten. Aus Sicherheitsgründen
                wird der Token selbst nie angezeigt.
              </p>
            ) : (
              <Note tone="info">
                Trag in der Datei <code className="rd-mono">.env</code> im Raider-Ordner den Wert{" "}
                <code className="rd-mono">RAIDER_TELEGRAM_TOKEN=</code> ein (Bot-Token von{" "}
                @BotFather in Telegram) und starte Raider neu. Erst danach lässt sich ein
                Kopplungs-Code erzeugen.
              </Note>
            )}
          </Card>

          <Card title="2. Kopplungs-Code erzeugen">
            <p className="rd-muted" style={{ marginBottom: "var(--space-3)" }}>
              Der Code verbindet dein Telegram-Konto einmalig mit einem neuen Gespräch in Raider.
            </p>
            <Button
              variant="primary"
              icon="key"
              disabled={!status.enabled || creatingCode}
              onClick={() => void makeCode()}
            >
              {creatingCode ? "Erzeuge Code…" : "Kopplungs-Code erzeugen"}
            </Button>

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
