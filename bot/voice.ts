export type VoicePlayer = { user_id: string; discord_id: string };

export function splitReadiness(players: VoicePlayer[], channelByDiscordId: Map<string, string | null>, generalId: string, existingTeamChannels: string[]) {
  const allowed = new Set([generalId, ...existingTeamChannels].filter(Boolean));
  const presence = Object.fromEntries(players.map((player) => [player.user_id, channelByDiscordId.get(player.discord_id) === generalId]));
  const ready = players.length === 10 && players.every((player) => Boolean(player.discord_id) && allowed.has(channelByDiscordId.get(player.discord_id) ?? ""));
  return { ready, presence };
}
