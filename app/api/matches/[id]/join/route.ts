import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const discordId = (session.user as { discordId?: string }).discordId;
  const me = await prisma.user.findUnique({ where: { discordId } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const match = await prisma.match.findUnique({
    where: { id },
    include: { players: true },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "LOBBY") return NextResponse.json({ error: "Match already started" }, { status: 400 });
  if (match.players.length >= 10) return NextResponse.json({ error: "Match is full (10/10)" }, { status: 400 });
  if (match.players.some((p) => p.userId === me.id)) {
    return NextResponse.json({ error: "Already in match" }, { status: 400 });
  }

  await prisma.matchPlayer.create({ data: { matchId: id, userId: me.id } });

  const updated = await prisma.match.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, avatar: true } },
      players: {
        include: { user: { select: { id: true, name: true, avatar: true, points: true, discordId: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  return NextResponse.json(updated);
}
