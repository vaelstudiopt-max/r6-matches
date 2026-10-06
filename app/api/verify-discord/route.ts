import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bot = process.env.DISCORD_BOT_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID;
  if (!url || !anon || !service) return NextResponse.json({ error: "Membership verification is not configured." }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const auth = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Session expired." }, { status: 401 });
  const serviceClient = createClient(url, service, { auth: { persistSession: false } });
  const { data: membership, error: membershipError } = await serviceClient.from("player_private")
    .select("discord_id,manual_verified_at").eq("user_id", data.user.id).single();
  if (membershipError) return NextResponse.json({ error: "Membership status could not be checked." }, { status: 502 });
  const identity = data.user.identities?.find((item) => item.provider === "discord");
  const discordId = String(identity?.identity_data?.sub ?? "");
  if (membership.manual_verified_at && membership.discord_id) {
    if (discordId && discordId !== membership.discord_id) {
      return NextResponse.json({ error: "Your linked Discord account differs from the ID approved by staff." }, { status: 409 });
    }
    return NextResponse.json({ verified: true, method: "admin" });
  }
  if (!bot || !guild) return NextResponse.json({ error: "Ask an admin to verify your Discord membership before queueing." }, { status: 503 });
  if (!/^\d{15,25}$/.test(discordId)) return NextResponse.json({ error: "Link your Discord account first." }, { status: 400 });
  const response = await fetch(`https://discord.com/api/v10/guilds/${guild}/members/${discordId}`, {
    headers: { Authorization: `Bot ${bot}` }, cache: "no-store",
  });
  if (response.status === 404) return NextResponse.json({ error: "Join the Discord server before queueing." }, { status: 403 });
  if (!response.ok) return NextResponse.json({ error: "Discord membership check failed. Try again shortly." }, { status: 502 });
  const { error: saveError } = await serviceClient.from("player_private")
    .update({ discord_id: discordId, verified_until: new Date(Date.now() + 15 * 60_000).toISOString() })
    .eq("user_id", data.user.id);
  if (saveError) return NextResponse.json({ error: "This Discord account is already linked elsewhere." }, { status: 409 });
  return NextResponse.json({ verified: true });
}
