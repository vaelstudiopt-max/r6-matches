import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const matches = await prisma.match.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      creator: { select: { name: true, avatar: true } },
      players: {
        include: { user: { select: { name: true, avatar: true, points: true } } },
      },
    },
  });

  return NextResponse.json(matches);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const discordId = (session.user as { discordId?: string }).discordId;
  const me = await prisma.user.findUnique({ where: { discordId } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { mode, maps } = await req.json();
  if (!mode || !maps || !Array.isArray(maps) || maps.length === 0) {
    return NextResponse.json({ error: "mode and maps required" }, { status: 400 });
  }

  const match = await prisma.match.create({
    data: {
      creatorId: me.id,
      mode,
      maps,
      players: {
        create: { userId: me.id },
      },
    },
    include: {
      creator: { select: { name: true } },
      players: {
        include: { user: { select: { name: true, avatar: true } } },
      },
    },
  });

  return NextResponse.json(match, { status: 201 });
}
