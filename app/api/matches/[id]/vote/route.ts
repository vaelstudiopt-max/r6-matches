import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcMatchPoints } from "@/lib/ranking";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const discordId = (session.user as { discordId?: string }).discordId;
  const me = await prisma.user.findUnique({ where: { discordId } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { nomineeId } = (await req.json()) as { nomineeId: string };
  if (!nomineeId) return NextResponse.json({ error: "nomineeId required" }, { status: 400 });

  const match = await prisma.match.findUnique({
    where: { id },
    include: { players: { include: { user: true } }, mvpVotes: true },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "VOTING") return NextResponse.json({ error: "Not in voting phase" }, { status: 400 });

  const mySlot = match.players.find((p) => p.userId === me.id);
  if (!mySlot) return NextResponse.json({ error: "You are not in this match" }, { status: 403 });

  if (match.mvpVotes.some((v) => v.voterId === me.id)) {
    return NextResponse.json({ error: "Already voted" }, { status: 400 });
  }

  const nominee = match.players.find((p) => p.userId === nomineeId);
  if (!nominee || nominee.team !== match.winner) {
    return NextResponse.json({ error: "Nominee must be on the winning team" }, { status: 400 });
  }

  if (nomineeId === me.id) return NextResponse.json({ error: "Cannot vote for yourself" }, { status: 400 });

  await prisma.mvpVote.create({
    data: { matchId: id, voterId: me.id, nomineeId },
  });

  const totalVotes = match.mvpVotes.length + 1;

  if (totalVotes >= match.players.length) {
    await finalizeMatch(id, match);
  }

  const updated = await prisma.match.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, avatar: true } },
      players: {
        include: { user: { select: { id: true, name: true, avatar: true, points: true, discordId: true } } },
        orderBy: { joinedAt: "asc" },
      },
      mvpVotes: {
        include: {
          nominee: { select: { id: true, name: true } },
          voter: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json(updated);
}

type MatchWithPlayers = {
  players: { userId: string; team: "A" | "B" | null; user: { points: number } }[];
  mvpVotes: { nomineeId: string }[];
  winner: "A" | "B" | null;
};

async function finalizeMatch(matchId: string, match: MatchWithPlayers) {
  if (!match.winner) return;

  const voteCounts: Record<string, number> = {};
  for (const vote of match.mvpVotes) {
    voteCounts[vote.nomineeId] = (voteCounts[vote.nomineeId] ?? 0) + 1;
  }
  let mvpId: string | null = null;
  let maxVotes = 0;
  for (const [uid, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) { maxVotes = count; mvpId = uid; }
  }

  const teamA = match.players.filter((p) => p.team === "A").map((p) => ({ userId: p.userId, points: p.user.points }));
  const teamB = match.players.filter((p) => p.team === "B").map((p) => ({ userId: p.userId, points: p.user.points }));

  const results = calcMatchPoints(teamA, teamB, match.winner, mvpId);

  await prisma.$transaction([
    prisma.match.update({ where: { id: matchId }, data: { status: "COMPLETED" } }),
    ...results.map(({ userId, delta }) =>
      prisma.user.update({
        where: { id: userId },
        data: {
          points: { increment: delta },
          wins: match.players.find((p) => p.userId === userId)?.team === match.winner ? { increment: 1 } : undefined,
          losses: match.players.find((p) => p.userId === userId)?.team !== match.winner ? { increment: 1 } : undefined,
          mvpCount: userId === mvpId ? { increment: 1 } : undefined,
        },
      })
    ),
    ...results.map(({ userId, delta }) =>
      prisma.matchPlayer.update({
        where: { matchId_userId: { matchId, userId } },
        data: { pointsDelta: delta },
      })
    ),
  ]);
}
