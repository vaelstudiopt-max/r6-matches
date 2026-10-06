import { describe, expect, it } from "vitest";
import { splitReadiness } from "./voice";

const players = Array.from({ length: 10 }, (_, index) => ({ user_id: `u${index}`, discord_id: `d${index}` }));

describe("voice split readiness", () => {
  it("waits for all ten matched players in General", () => {
    const channels = new Map(players.map((player) => [player.discord_id, "general"]));
    channels.set("d9", "other");
    expect(splitReadiness(players, channels, "general", []).ready).toBe(false);
    channels.set("d9", "general");
    channels.set("unrelated", "general");
    expect(splitReadiness(players, channels, "general", []).ready).toBe(true);
  });

  it("resumes a partially completed split without pulling a missing player from elsewhere", () => {
    const channels = new Map(players.map((player) => [player.discord_id, "general"]));
    channels.set("d0", "team-a");
    expect(splitReadiness(players, channels, "general", ["team-a"]).ready).toBe(true);
    channels.delete("d9");
    expect(splitReadiness(players, channels, "general", ["team-a"]).ready).toBe(false);
  });
});
