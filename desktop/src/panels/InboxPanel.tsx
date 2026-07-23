import type { MemoryProposal, PendingWrite, RaiderClient, SkillProposal } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

/** Freigabe-Posteingang: Vorschläge freigeben oder ablehnen. */
export function InboxPanel({ client }: { client: RaiderClient }) {
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { pendingWrites } = await client.listInbox("pending");
      setWrites(pendingWrites);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: number, approve: boolean): Promise<void> {
    setBusy(id);
    try {
      if (approve) await client.approvePendingWrite(id);
      else await client.rejectPendingWrite(id);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Posteingang</h2>
      {error !== null && <div style={ui.error}>{error}</div>}
      {writes.length === 0 && <p style={ui.empty}>Keine offenen Vorschläge.</p>}
      {writes.map((write) => (
        <div key={write.id} style={ui.card}>
          <div style={ui.spread}>
            <div>
              <span style={ui.badge}>{write.kind === "memory" ? "Merken" : "Skill"}</span>{" "}
              <span style={ui.muted}>({write.origin})</span>
              <div style={{ marginTop: "0.3rem" }}>{describe(write)}</div>
            </div>
            <div style={ui.row}>
              <button
                type="button"
                style={ui.button}
                disabled={busy === write.id}
                onClick={() => void decide(write.id, true)}
              >
                Freigeben
              </button>
              <button
                type="button"
                style={ui.buttonDanger}
                disabled={busy === write.id}
                onClick={() => void decide(write.id, false)}
              >
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function describe(write: PendingWrite): string {
  if (write.kind === "memory") {
    const proposal = write.proposal as MemoryProposal;
    return `${proposal.store}: ${proposal.content}`;
  }
  const proposal = write.proposal as SkillProposal;
  return `„${proposal.name}"${proposal.description ? ` — ${proposal.description}` : ""}`;
}
