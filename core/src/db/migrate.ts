import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./index";

/** Stand des Migrationsmechanismus. */
export interface MigrationStatus {
  applied: number;
  latest: string | null;
}

/**
 * Buchhaltungstabelle des Migrationsmechanismus. Das ist Infrastruktur,
 * keine Fachtabelle — im Skelett gibt es sonst noch keine Tabellen.
 */
const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Führt alle noch nicht angewendeten Migrationen aus `migrationsDir` aus.
 *
 * Regeln (siehe CLAUDE.md): Jede Schemaänderung ist eine `.sql`-Datei in
 * `core/src/db/migrations/`. Dateien werden nach Namen sortiert, jede genau
 * einmal und in einer Transaktion angewendet, und der Name wird vermerkt.
 *
 * Im Skelett existiert noch keine einzige Migrationsdatei — dann legt diese
 * Funktion nur die Buchhaltungstabelle an und meldet `applied: 0`.
 */
export function runMigrations(db: Db, migrationsDir: string): MigrationStatus {
  db.exec(BOOTSTRAP_SQL);

  const alreadyApplied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const files = listMigrationFiles(migrationsDir);

  const insert = db.prepare("INSERT INTO schema_migrations (name) VALUES (?)");
  const applyOne = db.transaction((name: string, sql: string) => {
    db.exec(sql);
    insert.run(name);
  });

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    applyOne(file, sql);
  }

  return getMigrationStatus(db);
}

/** Liest aktuellen Migrationsstand aus der Datenbank. */
export function getMigrationStatus(db: Db): MigrationStatus {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();

  if (!table) return { applied: 0, latest: null };

  const row = db
    .prepare("SELECT COUNT(*) AS count, MAX(name) AS latest FROM schema_migrations")
    .get() as { count: number; latest: string | null };

  return { applied: row.count, latest: row.latest };
}

/** Sortierte Liste der `.sql`-Migrationsdateien; leer, wenn der Ordner fehlt. */
function listMigrationFiles(migrationsDir: string): string[] {
  try {
    return readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}
