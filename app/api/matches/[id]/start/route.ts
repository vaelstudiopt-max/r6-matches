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
    include: { players: { include: { user: true } } },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.creatorId !== me.id) return NextResponse.json({ error: "Only creator can start" }, { status: 403 });
  if (match.status !== "LOBBY") return NextResponse.json({ error: "Match already started" }, { status: 400 });
  if (match.players.length < 2) return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });

  const playerIds = match.players.map((p) => p.userId);

  if (match.mode === "RANDOM_TEAMS") {
    // Shuffle and split into two teams
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);
    const teamA = shuffled.slice(0, half);
    const teamB = shuffled.slice(half);

    await prisma.$transaction([
      ...teamA.map((uid) =>
        prisma.matchPlayer.update({
          where: { matchId_userId: { matchId: id, userId: uid } },
          data: { team: "A" },
        })
      ),
      ...teamB.map((uid) =>
        prisma.matchPlayer.update({
          where: { matchId_userId: { matchId: id, userId: uid } },
          data: { team: "B" },
        })
      ),
      prisma.match.update({
        where: { id },
        data: { status: "IN_PROGRESS" },
      }),
    ]);
  } else {
    // CAPTAIN_DRAFT — pick captains randomly and start draft
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    const captainA = shuffled[0];
    const captainB = shuffled[1];

    await prisma.$transaction([
      prisma.matchPlayer.update({
        where: { matchId_userId: { matchId: id, userId: captainA } },
        data: { team: "A", isCaptain: true },
      }),
      prisma.matchPlayer.update({
        where: { matchId_userId: { matchId: id, userId: captainB } },
        data: { team: "B", isCaptain: true },
      }),
      prisma.match.update({
        where: { id },
        data: { status: "DRAFT", draftTurn: "A" },
      }),
    ]);
  }

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
