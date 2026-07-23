import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BackupInfo } from "@raider/shared";
import type { Db } from "./index";

const BACKUP_PREFIX = "raider-";
const BACKUP_SUFFIX = ".db";

/**
 * Schreibt eine Sicherungskopie der Datenbank nach `backupsDir` (datierter
 * Dateiname) und behält höchstens `keep` Kopien. Nutzt die in better-sqlite3
 * eingebaute Online-Sicherung — konsistent auch während des Betriebs.
 */
export async function createBackup(db: Db, backupsDir: string, keep = 10): Promise<BackupInfo> {
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`;
  const path = join(backupsDir, file);

  await db.backup(path);
  pruneBackups(backupsDir, keep);

  const stat = statSync(path);
  return { file, path, bytes: stat.size, createdAt: new Date().toISOString() };
}

/** Vorhandene Sicherungen, neueste zuerst. */
export function listBackups(backupsDir: string): BackupInfo[] {
  let names: string[];
  try {
    names = readdirSync(backupsDir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX))
    .map((file) => {
      const path = join(backupsDir, file);
      const stat = statSync(path);
      return { file, path, bytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.file.localeCompare(a.file));
}

/** Löscht die ältesten Sicherungen, sodass höchstens `keep` übrig bleiben. */
export function pruneBackups(backupsDir: string, keep: number): number {
  const surplus = listBackups(backupsDir).slice(Math.max(0, keep));
  for (const backup of surplus) rmSync(backup.path);
  return surplus.length;
}
