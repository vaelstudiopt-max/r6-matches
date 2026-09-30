import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const discordId = (session.user as { discordId?: string }).discordId;
  const me = await prisma.user.findUnique({ where: { discordId } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { pickUserId } = await req.json();
  if (!pickUserId) return NextResponse.json({ error: "pickUserId required" }, { status: 400 });

  const match = await prisma.match.findUnique({
    where: { id },
    include: { players: true },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "DRAFT") return NextResponse.json({ error: "Not in draft phase" }, { status: 400 });

  // Verify the requester is the current draft captain
  const mySlot = match.players.find((p) => p.userId === me.id);
  if (!mySlot?.isCaptain || mySlot.team !== match.draftTurn) {
    return NextResponse.json({ error: "Not your turn to pick" }, { status: 403 });
  }

  // Verify the picked player is in the match and has no team yet
  const pickSlot = match.players.find((p) => p.userId === pickUserId);
  if (!pickSlot) return NextResponse.json({ error: "Player not in match" }, { status: 400 });
  if (pickSlot.team) return NextResponse.json({ error: "Player already picked" }, { status: 400 });

  const unpicked = match.players.filter((p) => !p.team);
  const nextTurn: "A" | "B" = match.draftTurn === "A" ? "B" : "A";

  // After picking this player, check if draft is done
  const remainingAfterPick = unpicked.filter((p) => p.userId !== pickUserId);
  const draftDone = remainingAfterPick.length === 0;

  await prisma.$transaction([
    prisma.matchPlayer.update({
      where: { matchId_userId: { matchId: id, userId: pickUserId } },
      data: { team: match.draftTurn },
    }),
    prisma.match.update({
      where: { id },
      data: draftDone
        ? { status: "IN_PROGRESS", draftTurn: null }
        : { draftTurn: nextTurn },
    }),
  ]);

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
