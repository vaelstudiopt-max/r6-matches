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

  const { winner } = await req.json() as { winner: "A" | "B" };
  if (winner !== "A" && winner !== "B") {
    return NextResponse.json({ error: "winner must be A or B" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id },
    include: { players: { include: { user: true } } },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "IN_PROGRESS") return NextResponse.json({ error: "Match not in progress" }, { status: 400 });
  if (match.creatorId !== me.id) return NextResponse.json({ error: "Only creator can submit result" }, { status: 403 });

  await prisma.match.update({
    where: { id },
    data: { status: "VOTING", winner },
  });

  const updated = await prisma.match.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, avatar: true } },
      players: {
        include: { user: { select: { id: true, name: true, avatar: true, points: true, discordId: true } } },
        orderBy: { joinedAt: "asc" },
      },
      mvpVotes: true,
    },
  });

  return NextResponse.json(updated);
}
