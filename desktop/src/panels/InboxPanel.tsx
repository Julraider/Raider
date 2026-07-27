import type {
  MemoryProposal,
  MemoryStore,
  PendingWrite,
  PendingWriteStatus,
  RaiderClient,
  SkillProposal,
} from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ConfirmButton, EmptyState, Note, Page, Skeleton } from "../kit";
import { Markdown } from "../Markdown";
import { useToast } from "../Toast";
import { errorText } from "../ui";

// Gleiche Bezeichnungen wie im Gedächtnis-Bereich, damit „Nutzerprofil"/„Notizen"
// überall dasselbe meinen.
const MEMORY_LABEL: Record<MemoryStore, string> = { user: "Nutzerprofil", agent: "Notizen" };

/** Erste Seite einer client-seitig begrenzten Liste (der Core paginiert nicht selbst). */
const PAGE_SIZE = 50;

const STATUSES: PendingWriteStatus[] = ["pending", "approved", "rejected"];
const STATUS_LABEL: Record<PendingWriteStatus, string> = {
  pending: "Offen",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};

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

/** Woher der Vorschlag stammt — wichtig, um ihn einordnen zu können. */
function originLabel(write: PendingWrite): string {
  if (write.origin === "chat") {
    return write.sourceSessionId !== null
      ? `Aus dem Gespräch (Sitzung ${write.sourceSessionId})`
      : "Aus einem Gespräch";
  }
  return "Automatisch vom Assistenten erkannt";
}

function kindLabel(kind: PendingWrite["kind"]): string {
  return kind === "memory" ? "Gedächtnis-Eintrag" : "Neuer Skill";
}

/** Überschrift der Karte: Name des Skills, oder der Gedächtnis-Bereich. */
function writeTitle(write: PendingWrite): string {
  if (write.kind === "skill") return (write.proposal as SkillProposal).name;
  return MEMORY_LABEL[(write.proposal as MemoryProposal).store];
}

/** Erklärt in einem Satz, was bei Freigabe tatsächlich passiert. */
function consequence(write: PendingWrite): string {
  if (write.kind === "memory") {
    const proposal = write.proposal as MemoryProposal;
    return `Wird im Gedächtnis unter „${MEMORY_LABEL[proposal.store]}" gespeichert.`;
  }
  return "Wird als neuer Skill angelegt und steht Agenten danach zur Verfügung.";
}

/**
 * Freigeben braucht — anders als Ablehnen/Löschen — keinen roten Warnton,
 * aber trotzdem einen zweiten Klick, damit nichts aus Versehen angewendet
 * wird. `ConfirmButton` aus dem Baukasten ist fest auf „Gefahr" eingefärbt,
 * darum hier eine eigene, neutral eingefärbte Variante mit gleichem Ablauf.
 */
function ApproveButton({ onApprove, disabled }: { onApprove: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button variant="primary" small disabled={disabled} onClick={() => setArmed(true)}>
        Freigeben
      </Button>
    );
  }
  return (
    <>
      <Button
        variant="primary"
        small
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          onApprove();
        }}
      >
        Wirklich freigeben
      </Button>
      <Button variant="ghost" small disabled={disabled} onClick={() => setArmed(false)}>
        Abbrechen
      </Button>
    </>
  );
}

/**
 * Freigabe-Posteingang: die wichtigste Vertrauensstelle der App. Zeigt, was
 * Raider vorschlägt, warum, und was bei Freigabe passiert — und lässt den
 * Nutzer bewusst zustimmen oder ablehnen. Die Freigabe-Logik selbst (was
 * geprüft, was angewendet wird) liegt im Core; hier wird sie nur bedient.
 */
export function InboxPanel({ client }: { client: RaiderClient }) {
  const toast = useToast();
  const [status, setStatus] = useState<PendingWriteStatus>("pending");
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Über Monate sammeln sich in „Freigegeben"/„Abgelehnt" beliebig viele Einträge an —
  // der Core liefert alle auf einmal, hier wird darum clientseitig in Seiten gezeigt.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(
    async (forStatus: PendingWriteStatus) => {
      setLoading(true);
      try {
        const { pendingWrites } = await client.listInbox(forStatus);
        setWrites(pendingWrites);
        setVisibleCount(PAGE_SIZE);
        setError(null);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void load(status);
  }, [load, status]);

  function toggleExpand(id: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function approve(write: PendingWrite): Promise<void> {
    setBusyId(write.id);
    try {
      await client.approvePendingWrite(write.id);
      toast.show("Vorschlag freigegeben.");
      await load(status);
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(write: PendingWrite): Promise<void> {
    setBusyId(write.id);
    try {
      await client.rejectPendingWrite(write.id);
      toast.show("Vorschlag abgelehnt.");
      await load(status);
    } catch (err) {
      toast.showError(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      title="Posteingang"
      subtitle="Vorschläge von Raider — erst nach deiner Freigabe wird etwas gespeichert oder angelegt."
      actions={
        <Button variant="ghost" small icon="refresh" onClick={() => void load(status)}>
          Aktualisieren
        </Button>
      }
    >
      <div className="rd-stack">
        <div className="rd-row">
          {STATUSES.map((s) => (
            <Button
              key={s}
              variant={status === s ? "primary" : "quiet"}
              small
              onClick={() => setStatus(s)}
            >
              {STATUS_LABEL[s]}
            </Button>
          ))}
        </div>

        {error !== null && <Note tone="error">{error}</Note>}

        {loading && error === null && (
          <Card>
            <Skeleton rows={3} />
          </Card>
        )}

        {!loading && error === null && writes.length === 0 && (
          <EmptyState
            icon="Posteingang"
            title={status === "pending" ? "Keine offenen Vorschläge" : "Nichts zu sehen"}
            hint={
              status === "pending"
                ? "Wenn Raider im Gespräch etwas fürs Gedächtnis merken oder einen neuen Skill anlegen möchte, erscheint der Vorschlag hier zur Freigabe."
                : `Es gibt noch keine „${STATUS_LABEL[status]}"-Einträge.`
            }
          />
        )}

        {!loading &&
          error === null &&
          writes.slice(0, visibleCount).map((write) => {
            const isSkill = write.kind === "skill";
            const skill = isSkill ? (write.proposal as SkillProposal) : null;
            const memory = !isSkill ? (write.proposal as MemoryProposal) : null;
            const isOpen = expanded.has(write.id);
            return (
              <Card
                key={write.id}
                title={
                  <span className="rd-row" style={{ gap: "0.5rem", alignItems: "center" }}>
                    <Badge tone="neutral">{kindLabel(write.kind)}</Badge>
                    <span>{writeTitle(write)}</span>
                  </span>
                }
                actions={
                  status === "pending" ? (
                    <>
                      <ApproveButton
                        onApprove={() => void approve(write)}
                        disabled={busyId === write.id}
                      />
                      <ConfirmButton
                        onConfirm={() => void reject(write)}
                        label="Ablehnen"
                        confirmLabel="Wirklich ablehnen"
                      />
                    </>
                  ) : (
                    <Badge tone={status === "approved" ? "ok" : "quiet"}>
                      {STATUS_LABEL[status]}
                    </Badge>
                  )
                }
              >
                <div className="rd-stack rd-stack--tight">
                  <div className="rd-muted">
                    {originLabel(write)} · {formatDateTime(write.createdAt)}
                  </div>
                  <div>{consequence(write)}</div>

                  {memory && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{memory.content}</p>}

                  {skill && (
                    <div className="rd-stack rd-stack--tight">
                      {skill.description && (
                        <p className="rd-muted" style={{ margin: 0 }}>
                          {skill.description}
                        </p>
                      )}
                      {skill.category && (
                        <div>
                          <Badge tone="quiet">{skill.category}</Badge>
                        </div>
                      )}
                      <Button variant="ghost" small onClick={() => toggleExpand(write.id)}>
                        {isOpen ? "Inhalt ausblenden" : "Vollständigen Inhalt anzeigen"}
                      </Button>
                      {isOpen && (
                        <Card flat>
                          <Markdown content={skill.content} />
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

        {!loading && error === null && writes.length > visibleCount && (
          <div className="rd-row" style={{ justifyContent: "center" }}>
            <span className="rd-muted">
              {Math.min(visibleCount, writes.length)} von {writes.length}
            </span>
            <Button variant="ghost" small onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
              Weitere anzeigen
            </Button>
          </div>
        )}
      </div>
    </Page>
  );
}
