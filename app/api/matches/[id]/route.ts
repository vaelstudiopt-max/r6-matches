import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, avatar: true } },
      players: {
        include: {
          user: { select: { id: true, name: true, avatar: true, points: true, discordId: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      mvpVotes: {
        include: {
          voter: { select: { name: true } },
          nominee: { select: { name: true } },
        },
      },
    },
  });

  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(match);
}
