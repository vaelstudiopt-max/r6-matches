import { PermissionFlagsBits } from "discord.js";

export function teamVoiceOverwrites(guildId: string, botId: string, memberIds: string[], staffRoleIds: string[]): Array<{ id: string; allow?: bigint[]; deny?: bigint[] }> {
  return [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
    { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels] },
    ...staffRoleIds.filter(Boolean).map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] })),
    ...memberIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] })),
  ];
}
