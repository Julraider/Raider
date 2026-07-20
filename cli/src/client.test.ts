import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "./client";

describe("resolveBaseUrl", () => {
  it("nutzt 4179 als Standard", () => {
    expect(resolveBaseUrl({})).toBe("http://localhost:4179");
  });

  it("respektiert RAIDER_PORT", () => {
    expect(resolveBaseUrl({ RAIDER_PORT: "5000" })).toBe("http://localhost:5000");
  });
});
