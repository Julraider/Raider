import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Skills verwalten (Schritt 10).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run skills                              alle Skills anzeigen
 *   npm run skills -- new "<Name>" "<Inhalt>"   Skill anlegen
 *   npm run skills -- show <id>                 Skill inkl. Inhalt zeigen
 *   npm run skills -- on <id> | off <id>        an-/abschalten
 *   npm run skills -- assign <agentId> <skillId>   einem Agenten zuweisen
 *   npm run skills -- del <id>                  löschen
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "new") {
      const [name, content] = rest;
      if (!name) {
        console.error('Nutzung: npm run skills -- new "<Name>" "<Inhalt>"');
        process.exit(1);
      }
      const skill = await client.createSkill({ name, content: content ?? "" });
      console.log(`Skill #${skill.id} "${skill.name}" angelegt (${skill.filePath}).`);
      return;
    }

    if (command === "show") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error("Nutzung: npm run skills -- show <id>");
        process.exit(1);
      }
      const skill = await client.getSkill(id);
      console.log(`# ${skill.name}${skill.category ? ` [${skill.category}]` : ""}`);
      if (skill.description) console.log(skill.description);
      console.log(`\n${skill.content}`);
      return;
    }

    if (command === "on" || command === "off") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error(`Nutzung: npm run skills -- ${command} <id>`);
        process.exit(1);
      }
      await client.updateSkill(id, { active: command === "on" });
      console.log(`Skill #${id} ${command === "on" ? "aktiviert" : "deaktiviert"}.`);
      return;
    }

    if (command === "assign") {
      const agentId = Number(rest[0]);
      const skillId = Number(rest[1]);
      if (!Number.isInteger(agentId) || !Number.isInteger(skillId)) {
        console.error("Nutzung: npm run skills -- assign <agentId> <skillId>");
        process.exit(1);
      }
      await client.assignSkill(agentId, skillId);
      console.log(`Skill #${skillId} dem Agenten #${agentId} zugewiesen.`);
      return;
    }

    if (command === "del") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error("Nutzung: npm run skills -- del <id>");
        process.exit(1);
      }
      await client.deleteSkill(id);
      console.log(`Skill #${id} gelöscht.`);
      return;
    }

    // Standard: auflisten.
    const { skills } = await client.listSkills();
    if (skills.length === 0) {
      console.log('Noch keine Skills. Anlegen: npm run skills -- new "<Name>" "<Inhalt>"');
      return;
    }
    for (const skill of skills) {
      const state = skill.active ? "an" : "aus";
      const cat = skill.category ? ` [${skill.category}]` : "";
      console.log(`#${skill.id}  ${skill.name}${cat}  (${state}, ${skill.source})`);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Fehler (${error.status}): ${error.message}`);
    } else {
      console.error(`Kein Core erreichbar unter ${resolveBaseUrl()}. Läuft 'npm run dev'?`);
    }
    process.exit(1);
  }
}

void main();
