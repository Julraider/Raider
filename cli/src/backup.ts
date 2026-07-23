import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Datenbank-Sicherungen (Schritt 14).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run backup             jetzt eine Sicherung anlegen
 *   npm run backup -- list     vorhandene Sicherungen anzeigen
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command] = process.argv.slice(2);

  try {
    if (command === "list") {
      const { backups } = await client.listBackups();
      if (backups.length === 0) {
        console.log("Noch keine Sicherungen. Anlegen: npm run backup");
        return;
      }
      for (const backup of backups) {
        console.log(`${backup.file}  (${formatBytes(backup.bytes)}, ${backup.createdAt})`);
      }
      return;
    }

    const info = await client.createBackup();
    console.log(`Sicherung angelegt: ${info.file} (${formatBytes(info.bytes)})`);
    console.log(`Ort: ${info.path}`);
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Fehler (${error.status}): ${error.message}`);
    } else {
      console.error(`Kein Core erreichbar unter ${resolveBaseUrl()}. Läuft 'npm run dev'?`);
    }
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

void main();
