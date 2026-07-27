import type { OllamaProbe, ProviderChoice, RaiderClient, SetupStatus } from "@raider/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { Badge, Button, Field, IconButton, Input, Note, Select } from "./kit";
import { useToast } from "./Toast";
import { errorText } from "./ui";

const STEP_COUNT = 4;

/** Erklärungen für die Begriffe aus der Seitenleiste — ein Satz je Begriff, ohne Fachjargon. */
const GLOSSARY: Array<{ icon: string; term: string; text: string }> = [
  {
    icon: "Agenten",
    term: "Agenten",
    text: "Ein Agent ist eine eigene kleine Ausprägung von Raider – mit eigenem Auftrag und eigenem Ton, den du selbst festlegst.",
  },
  {
    icon: "Skills",
    term: "Skills",
    text: "Ein Skill ist eine Anleitung, die Raider zeigt, wie er eine bestimmte Aufgabe erledigen soll.",
  },
  {
    icon: "Gedächtnis",
    term: "Gedächtnis",
    text: "Im Gedächtnis merkt sich Raider dauerhaft wichtige Dinge über dich und eure Gespräche.",
  },
  {
    icon: "Werkzeuge",
    term: "Werkzeuge",
    text: "Werkzeuge sind Zusatzfunktionen, mit denen Raider z. B. Dateien lesen oder Dienste im Internet nutzen kann – nur mit deiner Erlaubnis.",
  },
  {
    icon: "Posteingang",
    term: "Posteingang",
    text: "Im Posteingang landen Vorschläge von Raider, die du erst bestätigen musst, bevor sie wirklich gespeichert werden.",
  },
  {
    icon: "Aufgaben",
    term: "Aufgaben",
    text: "Aufgaben sind Dinge, die Raider zu einem festen Zeitpunkt oder immer wieder von selbst erledigt.",
  },
];

/** Fortschrittsanzeige „Schritt X von 4" mit schlankem Balken. */
function StepProgress({ step }: { step: number }) {
  const percent = (step / STEP_COUNT) * 100;
  return (
    <div className="rd-stack rd-stack--tight" aria-hidden="true">
      <div className="rd-muted" style={{ fontSize: "0.78rem" }}>
        Schritt {step} von {STEP_COUNT}
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 999,
          background: "var(--border-soft)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            background: "var(--focus)",
            transition: "width var(--dur-2) var(--ease)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Auswahlkarte für einen Anbieter (Claude oder Ollama). Die ganze Karte ist
 * ein `<label>` um einen echten Radio-Knopf — so bleibt sie mit Tastatur und
 * Screenreader bedienbar, ohne Tastaturlogik nachzubauen. Ist `locked`
 * gesetzt (Wert kommt aus `.env`), lässt sie sich nicht anklicken — sonst
 * würde ein Klick etwas vorgaukeln, das gar nichts bewirkt.
 */
function ProviderCard({
  selected,
  locked,
  icon,
  title,
  hint,
  badge,
  onSelect,
  children,
}: {
  selected: boolean;
  locked: boolean;
  icon: string;
  title: string;
  hint: string;
  badge?: ReactNode;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <label
      className="rd-card rd-card--flat"
      style={{
        display: "block",
        borderColor: selected ? "var(--focus)" : "var(--border)",
        opacity: locked && !selected ? 0.55 : 1,
        cursor: locked ? "not-allowed" : "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <input
          type="radio"
          name="raider-onboarding-provider"
          checked={selected}
          disabled={locked}
          onChange={onSelect}
          style={{ marginTop: 4 }}
        />
        <Icon name={icon} size={22} />
        <span className="rd-grow rd-stack rd-stack--tight">
          <span className="rd-row" style={{ fontWeight: 650 }}>
            {title}
            {badge}
          </span>
          <span className="rd-muted">{hint}</span>
        </span>
      </span>
      {selected && children !== undefined && (
        <div style={{ marginTop: "var(--space-3)" }}>{children}</div>
      )}
    </label>
  );
}

/**
 * Geführte Ersteinrichtung: Begrüßung, Anbieterwahl, kurze Begriffserklärung,
 * Abschluss. Ersetzt das manuelle Bearbeiten der `.env`-Datei — alles läuft
 * über `applySetup`, ohne Neustart.
 */
export function Onboarding({ client, onDone }: { client: RaiderClient; onDone: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<SetupStatus | null>(null);

  const [provider, setProvider] = useState<ProviderChoice>("anthropic");
  const [apiKey, setApiKey] = useState("");

  const [probe, setProbe] = useState<OllamaProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [ollamaModel, setOllamaModel] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Beim Öffnen den aktuellen Stand holen — so überschreiben wir nichts, was
  // schon eingerichtet ist (z. B. einen Anbieter, der aus der .env kommt).
  useEffect(() => {
    let cancelled = false;
    void client
      .getSetup()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setProvider(s.provider);
      })
      .catch(() => {
        /* Ohne Stand starten wir einfach mit den Vorgaben. */
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const runProbe = useCallback(async (): Promise<void> => {
    setProbing(true);
    try {
      const result = await client.probeOllama();
      setProbe(result);
      if (result.reachable && result.models.length > 0) {
        setOllamaModel((current) => (current !== "" ? current : (result.models[0] ?? "")));
      }
    } catch {
      setProbe({ reachable: false, models: [] });
    } finally {
      setProbing(false);
    }
  }, [client]);

  // Sobald Schritt 2 (Anbieterwahl) zum ersten Mal sichtbar wird, einmal
  // automatisch nach einem lokalen Ollama-Server suchen. Ein Ref statt
  // `probe`/`probing` in den Abhängigkeiten hält fest, dass schon gesucht
  // wurde — sonst würde jede Zustandsänderung während der Suche einen
  // weiteren Lauf anstoßen.
  const hasProbedRef = useRef(false);
  useEffect(() => {
    if (step === 2 && !hasProbedRef.current) {
      hasProbedRef.current = true;
      void runProbe();
    }
  }, [step, runProbe]);

  const keyLocked = status?.fromEnv.apiKey ?? false;
  const providerLocked = status?.fromEnv.provider ?? false;

  async function saveProviderChoice(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const patch: Parameters<RaiderClient["applySetup"]>[0] = {};
      if (!providerLocked) patch.provider = provider;
      // Leeres Feld nie mitschicken — ein leerer String würde einen bereits
      // hinterlegten Schlüssel löschen.
      if (provider === "anthropic" && !keyLocked && apiKey.trim() !== "") {
        patch.anthropicApiKey = apiKey.trim();
      }
      if (provider === "ollama" && ollamaModel !== "") {
        patch.model = ollamaModel;
      }
      const next = await client.applySetup(patch);
      setStatus(next);
      toast.show("Gespeichert.");
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function goNext(): Promise<void> {
    if (step === 2) {
      const ok = await saveProviderChoice();
      if (!ok) return;
    }
    setStep((s) => Math.min(STEP_COUNT, s + 1));
  }

  function goBack(): void {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  return (
    <div className="rd-overlay">
      <div
        className="rd-card"
        role="dialog"
        aria-modal="true"
        aria-label="Ersteinrichtung"
        style={{ width: "min(640px, 92vw)", maxHeight: "86vh", overflowY: "auto" }}
      >
        <div className="rd-spread" style={{ marginBottom: "var(--space-4)" }}>
          <div className="rd-grow">
            <StepProgress step={step} />
          </div>
          <IconButton icon="x" label="Einrichtung überspringen" onClick={onDone} />
        </div>

        {step === 1 && (
          <div className="rd-stack">
            <div className="rd-row">
              <Icon name="Chat" size={26} />
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Willkommen bei Raider</h2>
            </div>
            <p style={{ margin: 0 }}>
              Raider ist dein persönlicher KI-Assistent, der komplett auf deinem eigenen Rechner
              läuft. Eure Gespräche verlassen deinen Rechner nie, außer wenn du dich bewusst für
              einen Anbieter im Internet entscheidest.
            </p>
            <Note tone="info">
              In wenigen Schritten richten wir Raider gemeinsam ein — ganz ohne Dateien zu
              bearbeiten oder das Programm neu zu starten.
            </Note>
          </div>
        )}

        {step === 2 && (
          <div className="rd-stack">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Womit soll Raider antworten?</h2>
            <p className="rd-muted" style={{ margin: 0 }}>
              Du kannst das später jederzeit in den Einstellungen ändern.
            </p>

            {providerLocked && (
              <Note tone="info">
                Der Anbieter ist bereits über die Datei <code>.env</code> festgelegt und lässt sich
                hier nicht ändern.
              </Note>
            )}

            <div role="radiogroup" aria-label="Anbieter" className="rd-stack rd-stack--tight">
              <ProviderCard
                selected={provider === "anthropic"}
                locked={providerLocked}
                icon="key"
                title="Claude"
                hint="Über das Internet · kostet Geld"
                onSelect={() => setProvider("anthropic")}
              >
                {keyLocked ? (
                  <Note tone="info">
                    Dein Schlüssel kommt aus der Datei <code>.env</code> und lässt sich hier nicht
                    ändern.{" "}
                    <Badge tone={status?.hasApiKey ? "ok" : "warn"}>
                      {status?.hasApiKey ? "hinterlegt" : "nicht hinterlegt"}
                    </Badge>
                  </Note>
                ) : (
                  <Field
                    label="Anthropic-Schlüssel"
                    hint={
                      <>
                        Du bekommst ihn auf console.anthropic.com. Er wird nur auf diesem Rechner
                        gespeichert und nie angezeigt.{" "}
                        {status?.hasApiKey && "Aktuell ist bereits ein Schlüssel hinterlegt."}
                      </>
                    }
                  >
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder={
                        status?.hasApiKey ? "Neuen Schlüssel eintragen (optional)" : "sk-ant-…"
                      }
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </Field>
                )}
              </ProviderCard>

              <ProviderCard
                selected={provider === "ollama"}
                locked={providerLocked}
                icon="terminal"
                title="Ollama"
                hint="Läuft auf deinem Rechner · kostenlos"
                badge={
                  probe?.reachable ? (
                    <Badge tone="ok">Gefunden!</Badge>
                  ) : probe !== null ? (
                    <Badge tone="quiet">Nicht gefunden</Badge>
                  ) : undefined
                }
                onSelect={() => setProvider("ollama")}
              >
                {probing ? (
                  <p className="rd-muted" style={{ margin: 0 }}>
                    Suche nach einem laufenden Ollama-Server …
                  </p>
                ) : probe?.reachable ? (
                  probe.models.length > 0 ? (
                    <Field
                      label="Modell"
                      hint="Welches heruntergeladene Modell Raider benutzen soll."
                    >
                      <Select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}>
                        {probe.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <Note tone="info">
                      Gefunden, aber noch kein Modell heruntergeladen. Lade eines mit{" "}
                      <code className="rd-mono">ollama pull llama3.1</code> herunter und suche
                      danach erneut.
                    </Note>
                  )
                ) : (
                  <div className="rd-stack rd-stack--tight">
                    <p className="rd-muted" style={{ margin: 0 }}>
                      Ollama ist ein kostenloses Programm, mit dem Sprachmodelle direkt auf deinem
                      Rechner laufen — ganz ohne Internet. Du findest es auf ollama.com.
                    </p>
                    <div>
                      <Button variant="ghost" small icon="refresh" onClick={() => void runProbe()}>
                        Nochmal suchen
                      </Button>
                    </div>
                  </div>
                )}
              </ProviderCard>
            </div>

            {error !== null && <Note tone="error">{error}</Note>}
          </div>
        )}

        {step === 3 && (
          <div className="rd-stack">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Kurz erklärt</h2>
            <p className="rd-muted" style={{ margin: 0 }}>
              Diese Begriffe stehen in der Seitenleiste — hier kurz erklärt.
            </p>
            <div className="rd-stack rd-stack--tight">
              {GLOSSARY.map((entry) => (
                <div key={entry.term} className="rd-row" style={{ alignItems: "flex-start" }}>
                  <Icon name={entry.icon} size={19} />
                  <span>
                    <strong>{entry.term}:</strong> {entry.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="rd-stack">
            <div className="rd-row">
              <Icon name="check" size={24} />
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Fertig!</h2>
            </div>
            <p style={{ margin: 0 }}>
              Raider ist eingerichtet. Du kannst jederzeit in den Einstellungen etwas ändern, oder
              die Ersteinrichtung über die Befehlspalette erneut öffnen.
            </p>
          </div>
        )}

        <div className="rd-spread" style={{ marginTop: "var(--space-5)" }}>
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={goBack} disabled={saving}>
                Zurück
              </Button>
            )}
          </div>
          <div className="rd-row">
            {step < STEP_COUNT && (
              <Button variant="quiet" onClick={onDone} disabled={saving}>
                Überspringen
              </Button>
            )}
            {step < STEP_COUNT ? (
              <Button icon="arrowRight" onClick={() => void goNext()} disabled={saving}>
                {saving ? "Speichert …" : "Weiter"}
              </Button>
            ) : (
              <Button icon="check" onClick={onDone}>
                Los geht's
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
