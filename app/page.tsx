import { prisma } from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const users = await prisma.user.findMany({
    orderBy: { points: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      avatar: true,
      points: true,
      wins: true,
      losses: true,
      mvpCount: true,
    },
  });

  const recentMatches = await prisma.match.findMany({
    where: { status: "COMPLETED" },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      players: {
        include: { user: { select: { name: true } } },
        where: { team: { not: null } },
      },
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Leaderboard</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {users.length} players ranked
          </p>
        </div>
        <Link
          href="/matches"
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--orange)", color: "#fff" }}
        >
          View Matches →
        </Link>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {users.length === 0 ? (
          <div className="py-16 text-center" style={{ color: "var(--muted)" }}>
            No players yet. Be the first to sign in!
          </div>
        ) : (
          users.map((user, idx) => (
            <div
              key={user.id}
              className="flex items-center gap-4 px-5 py-4 border-b last:border-b-0 transition-colors hover:bg-white/[0.02]"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="w-8 text-center font-bold text-sm shrink-0"
                style={{
                  color: idx === 0 ? "#f59e0b" : idx === 1 ? "#9ca3af" : idx === 2 ? "#cd7f32" : "var(--muted)",
                }}
              >
                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
              </div>

              <div className="shrink-0">
                {user.avatar ? (
                  <Image
                    src={user.avatar}
                    alt={user.name}
                    width={36}
                    height={36}
                    className="rounded-full"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: "var(--surface2)" }}
                  >
                    {user.name[0]?.toUpperCase()}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{user.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {user.wins}W – {user.losses}L
                  {user.mvpCount > 0 && ` · ${user.mvpCount} MVP`}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-bold" style={{ color: "var(--orange)" }}>
                  {user.points}
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  pts
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {recentMatches.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold mb-4">Recent Matches</h2>
          <div className="space-y-3">
            {recentMatches.map((m) => {
              const teamA = m.players.filter((p) => p.team === "A").map((p) => p.user.name);
              const teamB = m.players.filter((p) => p.team === "B").map((p) => p.user.name);
              return (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="flex items-center gap-4 px-5 py-4 rounded-xl transition-colors hover:bg-white/[0.03]"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="flex-1 text-sm">
                    <span className={m.winner === "A" ? "font-bold text-green-400" : ""}>{teamA.join(", ")}</span>
                    <span className="mx-2" style={{ color: "var(--muted)" }}>
                      vs
                    </span>
                    <span className={m.winner === "B" ? "font-bold text-green-400" : ""}>{teamB.join(", ")}</span>
                  </div>
                  <div
                    className="text-xs px-2 py-1 rounded font-semibold"
                    style={{ background: "var(--surface2)", color: "var(--muted)" }}
                  >
                    Team {m.winner} won
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
