import type { StatsReport } from "@raider/shared";
import type { Db } from "./index";

/** Zählt eine Tabelle (optional mit WHERE-Bedingung). */
function count(db: Db, table: string, where?: string): number {
  const sql = `SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  return (db.prepare(sql).get() as { n: number }).n;
}

/** Sammelt Zählerstände über das ganze System (für /stats). */
export function collectStats(db: Db): StatsReport {
  return {
    sessions: count(db, "sessions"),
    messages: count(db, "messages"),
    memory: {
      user: count(db, "memory_entries", "store = 'user'"),
      agent: count(db, "memory_entries", "store = 'agent'"),
    },
    skills: count(db, "skills"),
    mcpServers: count(db, "mcp_servers"),
    toolCalls: count(db, "tool_calls"),
    pendingProposals: count(db, "pending_writes", "status = 'pending'"),
    scheduledTasks: count(db, "scheduled_tasks"),
    reviewRuns: count(db, "review_runs"),
  };
}
