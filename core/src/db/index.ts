import Database from "better-sqlite3";

/** Instanz-Typ einer geöffneten SQLite-Datenbank. */
export type Db = Database.Database;

/**
 * Öffnet die SQLite-Datenbank und setzt die Pragmas, die Raider überall
 * voraussetzt: WAL-Modus (siehe Spec) und aktivierte Fremdschlüssel.
 *
 * @param location Dateipfad oder ":memory:" für eine flüchtige Test-DB.
 */
export function openDatabase(location: string): Db {
  const db = new Database(location);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
