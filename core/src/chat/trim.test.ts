import type { ChatMessage } from "@raider/shared";
import { describe, expect, it } from "vitest";
import { trimHistory } from "./turn";

const msg = (role: ChatMessage["role"], content: string): ChatMessage => ({ role, content });

describe("Verlauf kürzen", () => {
  it("lässt einen kurzen Verlauf unangetastet", () => {
    const history = [msg("user", "Hallo"), msg("assistant", "Hi")];
    expect(trimHistory(history, 1000)).toEqual(history);
  });

  it("behält die jüngsten Nachrichten und wirft die ältesten weg", () => {
    const history = [
      msg("user", "A".repeat(100)),
      msg("assistant", "B".repeat(100)),
      msg("user", "C".repeat(100)),
    ];
    const trimmed = trimHistory(history, 250);

    // Der Hinweis kommt hinzu, die älteste Nachricht fällt weg.
    expect(trimmed.at(-1)?.content).toBe("C".repeat(100));
    expect(trimmed.at(-2)?.content).toBe("B".repeat(100));
    expect(trimmed.some((m) => m.content.startsWith("A"))).toBe(false);
  });

  it("weist das Modell darauf hin, dass der Anfang fehlt", () => {
    const history = [msg("user", "A".repeat(500)), msg("user", "B".repeat(100))];
    const trimmed = trimHistory(history, 200);
    expect(trimmed[0]?.content).toContain("weggelassen");
  });

  it("behält die jüngste Nachricht auch dann, wenn sie allein zu lang ist", () => {
    const history = [msg("user", "A".repeat(50)), msg("user", "B".repeat(5000))];
    const trimmed = trimHistory(history, 100);
    expect(trimmed.at(-1)?.content).toBe("B".repeat(5000));
  });

  it("kommt mit einem leeren Verlauf klar", () => {
    expect(trimHistory([], 100)).toEqual([]);
  });
});
