import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { teamVoiceOverwrites } from "./permissions";

describe("team voice permissions", () => {
  it("hides a match room from the other team and unrelated server members", () => {
    const entries = teamVoiceOverwrites("guild", "bot", ["a1", "a2", "a3", "a4", "a5"], ["staff"]);
    expect(entries.map((entry) => entry.id)).toEqual(["guild", "bot", "staff", "a1", "a2", "a3", "a4", "a5"]);
    expect(entries[0].deny).toContain(PermissionFlagsBits.ViewChannel);
    expect(entries[0].deny).toContain(PermissionFlagsBits.Connect);
    expect(entries.find((entry) => entry.id === "staff")?.allow).toContain(PermissionFlagsBits.Connect);
    expect(entries.some((entry) => entry.id === "b1")).toBe(false);
  });
});
