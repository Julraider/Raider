import { describe, expect, it } from "vitest";
import { Conversation } from "./conversation";

describe("Conversation", () => {
  it("sammelt Runden und baut eine Anfrage aus dem Verlauf", () => {
    const c = new Conversation();
    c.addUser("Hallo");
    c.addAssistant("Hi!");
    c.addUser("Wie geht's?");

    const request = c.toRequest();
    expect(request.messages).toEqual([
      { role: "user", content: "Hallo" },
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "Wie geht's?" },
    ]);
  });

  it("gibt eine Kopie zurück, kein internes Array", () => {
    const c = new Conversation();
    c.addUser("Hallo");
    const request = c.toRequest();
    request.messages.push({ role: "user", content: "manipuliert" });
    expect(c.length).toBe(1);
  });

  it("übernimmt overrides wie das Modell", () => {
    const c = new Conversation();
    c.addUser("Hallo");
    expect(c.toRequest({ model: "claude-haiku-4-5" }).model).toBe("claude-haiku-4-5");
  });

  it("dropLast entfernt die letzte Nachricht (z. B. nach einem Fehler)", () => {
    const c = new Conversation();
    c.addUser("Hallo");
    c.addUser("Zweite");
    c.dropLast();
    expect(c.length).toBe(1);
    expect(c.toRequest().messages).toEqual([{ role: "user", content: "Hallo" }]);
  });

  it("reset leert den Verlauf", () => {
    const c = new Conversation();
    c.addUser("Hallo");
    c.reset();
    expect(c.length).toBe(0);
  });
});
