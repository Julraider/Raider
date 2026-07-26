import { createRaiderClient } from "@raider/shared";
import { useEffect, useMemo, useState } from "react";
import { type Command, CommandPalette } from "./CommandPalette";
import { coreAccessToken, coreBaseUrl } from "./coreUrl";
import { Icon } from "./icons";
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
import { ToastProvider } from "./Toast";
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

function initialTab(): Tab {
  if (typeof window === "undefined") return "Chat";
  const wanted = new URLSearchParams(window.location.search).get("tab");
  return (TABS as readonly string[]).includes(wanted ?? "") ? (wanted as Tab) : "Chat";
}

function initialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const wanted = new URLSearchParams(window.location.search).get("theme");
  if (wanted === "light" || wanted === "dark") return wanted;
  const saved = window.localStorage.getItem("raider-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Ist das ein Mac? Nur für die Anzeige des Kürzels (⌘K statt Strg+K). */
function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

/**
 * Hülle mit linker Seitenleiste, Befehlspalette und Meldungen. Jeder Bereich
 * ist ein dünner Client des Cores — die Logik steckt im Core.
 */
export function App() {
  const client = useMemo(() => createRaiderClient(coreBaseUrl(), coreAccessToken()), []);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [version, setVersion] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [inbox, setInbox] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("raider-theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const [health, stats] = await Promise.all([client.health(), client.stats()]);
        if (!cancelled) {
          setVersion(health.version);
          setConnected(health.database.connected);
          setInbox(stats.pendingProposals);
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client]);

  // Tastenkürzel: Strg/Cmd+K öffnet die Befehlspalette.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      ...TABS.map((name) => ({
        id: `tab-${name}`,
        label: name,
        icon: name,
        hint: "Bereich",
        run: () => setTab(name),
      })),
      {
        id: "theme",
        label: theme === "dark" ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln",
        icon: theme === "dark" ? "sun" : "moon",
        run: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      },
    ],
    [theme],
  );

  const shortcut = isMac() ? "⌘K" : "Strg K";

  return (
    <ToastProvider>
      <div style={ui.app}>
        <aside style={ui.sidebar}>
          <div style={ui.brand}>
            <div style={ui.logoMark}>◆</div>
            <div>
              <div style={ui.brandTitle}>Raider</div>
              <div style={ui.brandSub}>Lokaler KI-Assistent</div>
            </div>
          </div>

          <button
            type="button"
            style={{ ...ui.themeToggle, marginBottom: "0.6rem" }}
            onClick={() => setPaletteOpen(true)}
          >
            <Icon name="Suche" size={16} />
            <span>Befehle…</span>
            <span className="rd-kbd">{shortcut}</span>
          </button>

          <nav style={{ flex: 1, overflowY: "auto" }} aria-label="Bereiche">
            {TABS.map((name) => {
              const active = tab === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={active ? undefined : "rd-nav"}
                  style={{ ...ui.navItem, ...(active ? ui.navItemActive : {}) }}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setTab(name)}
                >
                  <Icon name={name} />
                  <span>{name}</span>
                  {name === "Posteingang" && inbox > 0 && (
                    <span style={ui.navBadge} title={`${inbox} offen`}>
                      {inbox}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div style={ui.statusCard}>
            <span
              style={{ ...ui.dot, background: connected ? "var(--success)" : "var(--danger)" }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                {connected ? "Verbunden" : "Getrennt"}
              </div>
              <div style={ui.brandSub}>lokal{version ? ` · v${version}` : ""}</div>
            </div>
          </div>
          <button
            type="button"
            style={ui.themeToggle}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            <span>{theme === "dark" ? "Heller Modus" : "Dunkler Modus"}</span>
          </button>
        </aside>

        <main style={ui.main} aria-label={tab}>
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
        </main>

        <CommandPalette
          open={paletteOpen}
          commands={commands}
          onClose={() => setPaletteOpen(false)}
        />
      </div>
    </ToastProvider>
  );
}
