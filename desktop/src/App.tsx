import { createRaiderClient } from "@raider/shared";
import { useMemo, useState } from "react";
import { coreBaseUrl } from "./coreUrl";
import { AgentsPanel } from "./panels/AgentsPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { InboxPanel } from "./panels/InboxPanel";
import { MemoryPanel } from "./panels/MemoryPanel";
import { OpsPanel } from "./panels/OpsPanel";
import { SearchPanel } from "./panels/SearchPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { SkillsPanel } from "./panels/SkillsPanel";
import { TasksPanel } from "./panels/TasksPanel";
import { TelegramPanel } from "./panels/TelegramPanel";
import { ToolsPanel } from "./panels/ToolsPanel";
import { ui } from "./ui";

const TABS = [
  "Chat",
  "Agenten",
  "Werkzeuge",
  "Gedächtnis",
  "Skills",
  "Posteingang",
  "Aufgaben",
  "Suche",
  "Telegram",
  "Betrieb",
  "Einstellungen",
] as const;
type Tab = (typeof TABS)[number];

/** Anfangs-Reiter, optional per `?tab=…` vorgewählt (Deep-Link). */
function initialTab(): Tab {
  if (typeof window === "undefined") return "Chat";
  const wanted = new URLSearchParams(window.location.search).get("tab");
  return (TABS as readonly string[]).includes(wanted ?? "") ? (wanted as Tab) : "Chat";
}

/**
 * Reiter-Hülle. Bewusst „dumm": jedes Panel ist ein dünner Client des Cores —
 * die Logik (Verlauf, Freigabe, Zeitplan, Betrieb) steckt im Core.
 */
export function App() {
  const client = useMemo(() => createRaiderClient(coreBaseUrl()), []);
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div style={ui.app}>
      <nav style={ui.tabs}>
        <strong style={{ marginRight: "0.5rem" }}>Raider</strong>
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            style={{ ...ui.tab, ...(tab === name ? ui.tabActive : {}) }}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>

      {tab === "Chat" && <ChatPanel client={client} />}
      {tab === "Agenten" && <AgentsPanel client={client} />}
      {tab === "Werkzeuge" && <ToolsPanel client={client} />}
      {tab === "Gedächtnis" && <MemoryPanel client={client} />}
      {tab === "Skills" && <SkillsPanel client={client} />}
      {tab === "Posteingang" && <InboxPanel client={client} />}
      {tab === "Aufgaben" && <TasksPanel client={client} />}
      {tab === "Suche" && <SearchPanel client={client} />}
      {tab === "Telegram" && <TelegramPanel client={client} />}
      {tab === "Betrieb" && <OpsPanel client={client} />}
      {tab === "Einstellungen" && <SettingsPanel client={client} />}
    </div>
  );
}
