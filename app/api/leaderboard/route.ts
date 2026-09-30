import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { points: "desc" },
    take: 50,
    select: {
      id: true,
      discordId: true,
      name: true,
      avatar: true,
      points: true,
      wins: true,
      losses: true,
      mvpCount: true,
    },
  });

  return NextResponse.json(users);
}
