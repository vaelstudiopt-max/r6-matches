import { createClient } from "@supabase/supabase-js";
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Guild,
  VoiceChannel,
} from "discord.js";
import { teamVoiceOverwrites } from "./permissions";
import { splitReadiness } from "./voice";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const guildId = required("DISCORD_GUILD_ID");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

type Match = {
  id: string;
  status: string;
  voice_a: string | null;
  voice_b: string | null;
  voice_error: string | null;
};
type Player = { user_id: string; team: number; discord_id: string };
type Settings = { general_channel_id: string; match_category_id: string; staff_role_ids: string[] };

async function settings(): Promise<Settings> {
  const { data, error } = await supabase.from("app_settings").select("general_channel_id,match_category_id,staff_role_ids").single();
  if (error) throw error;
  return data;
}

async function players(matchId: string): Promise<Player[]> {
  const { data: members, error } = await supabase.from("match_players").select("user_id,team").eq("match_id", matchId);
  if (error) throw error;
  const ids = (members ?? []).map((member) => member.user_id);
  const { data: identities, error: identityError } = await supabase.from("player_private").select("user_id,discord_id").in("user_id", ids);
  if (identityError) throw identityError;
  return (members ?? []).map((member) => ({ ...member, discord_id: identities?.find((identity) => identity.user_id === member.user_id)?.discord_id ?? "" }));
}

async function updateMatch(id: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("matches").update(values).eq("id", id);
  if (error) throw error;
}

async function makeChannel(guild: Guild, match: Match, team: 0 | 1, roster: Player[], config: Settings) {
  const name = `Match ${match.id.slice(0, 6).toUpperCase()} · Team ${team === 0 ? "A" : "B"}`;
  const existing = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildVoice && channel.name === name);
  if (existing) {
    await updateMatch(match.id, team === 0 ? { voice_a: existing.id } : { voice_b: existing.id });
    return existing as VoiceChannel;
  }
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: config.match_category_id || undefined,
    permissionOverwrites: teamVoiceOverwrites(guild.id, client.user!.id, roster.map((player) => player.discord_id), config.staff_role_ids),
    reason: `R6 Scrims match ${match.id}`,
  });
  await updateMatch(match.id, team === 0 ? { voice_a: channel.id } : { voice_b: channel.id });
  return channel;
}

async function prepareVoice(guild: Guild, match: Match, config: Settings) {
  if (match.voice_error) return;
  if (!config.general_channel_id) {
    await updateMatch(match.id, { voice_error: "Configure the General voice channel in Admin." });
    return;
  }
  const roster = await players(match.id);
  if (roster.length !== 10 || roster.some((player) => !player.discord_id)) {
    await updateMatch(match.id, { voice_error: "A matched player has no linked Discord account." });
    return;
  }
  const channels = new Map(roster.map((player) => [player.discord_id, guild.voiceStates.cache.get(player.discord_id)?.channelId ?? null]));
  const readiness = splitReadiness(roster, channels, config.general_channel_id, [match.voice_a, match.voice_b].filter((id): id is string => Boolean(id)));
  await updateMatch(match.id, { voice_presence: readiness.presence });
  if (!readiness.ready) return;
  try {
    const a = (match.voice_a ? await guild.channels.fetch(match.voice_a) : null) as VoiceChannel | null
      ?? await makeChannel(guild, match, 0, roster.filter((player) => player.team === 0), config);
    const b = (match.voice_b ? await guild.channels.fetch(match.voice_b) : null) as VoiceChannel | null
      ?? await makeChannel(guild, match, 1, roster.filter((player) => player.team === 1), config);
    for (const player of roster) {
      const member = await guild.members.fetch(player.discord_id);
      const target = player.team === 0 ? a : b;
      if (member.voice.channelId !== target.id) await member.voice.setChannel(target, `R6 Scrims match ${match.id}`);
    }
    await updateMatch(match.id, { voice_a: a.id, voice_b: b.id, voice_error: null, voice_presence: Object.fromEntries(roster.map((p) => [p.user_id, true])), status: "veto", turn_deadline: new Date(Date.now() + 60_000).toISOString() });
  } catch (error) {
    await updateMatch(match.id, { voice_error: error instanceof Error ? error.message : String(error) });
  }
}

async function cleanupVoice(guild: Guild, match: Match, config: Settings) {
  const channels = [match.voice_a, match.voice_b].filter((id): id is string => Boolean(id));
  if (!channels.length) return;
  try {
    if (!config.general_channel_id) throw new Error("General voice channel is not configured.");
    for (const player of await players(match.id)) {
      const member = player.discord_id ? await guild.members.fetch(player.discord_id).catch(() => null) : null;
      if (member && member.voice.channelId && channels.includes(member.voice.channelId)) {
        await member.voice.setChannel(config.general_channel_id, `R6 Scrims match ${match.id} ended`);
      }
    }
    for (const id of channels) {
      const channel = await guild.channels.fetch(id).catch(() => null);
      if (channel) await channel.delete(`R6 Scrims match ${match.id} ended`);
    }
    await updateMatch(match.id, { voice_a: null, voice_b: null, voice_error: null });
  } catch (error) {
    await updateMatch(match.id, { voice_error: error instanceof Error ? error.message : String(error) });
  }
}

let processing = false;
async function reconcile() {
  if (processing || !client.isReady()) return;
  processing = true;
  try {
    const guild = await client.guilds.fetch(guildId);
    const config = await settings();
    const { error: timeoutError } = await supabase.rpc("process_timeouts");
    if (timeoutError) throw timeoutError;
    const { data, error } = await supabase.from("matches").select("id,status,voice_a,voice_b,voice_error")
      .in("status", ["waiting_voice", "completed", "cancelled"]);
    if (error) throw error;
    for (const match of (data ?? []) as Match[]) {
      if (match.status === "waiting_voice") await prepareVoice(guild, match, config);
      else await cleanupVoice(guild, match, config);
    }
  } catch (error) {
    console.error("Bot reconciliation failed:", error);
  } finally {
    processing = false;
  }
}

client.on("voiceStateUpdate", () => { void reconcile(); });
client.once("ready", async () => {
  console.log(`Discord bot ready as ${client.user?.tag}`);
  await reconcile();
  setInterval(() => { void reconcile(); }, 5_000);
});

void client.login(required("DISCORD_BOT_TOKEN"));
