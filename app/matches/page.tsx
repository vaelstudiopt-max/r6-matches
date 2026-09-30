import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  LOBBY: "Lobby",
  DRAFT: "Draft",
  IN_PROGRESS: "Live",
  VOTING: "Voting",
  COMPLETED: "Done",
};

const STATUS_COLOR: Record<string, string> = {
  LOBBY: "#6b7280",
  DRAFT: "#8b5cf6",
  IN_PROGRESS: "#22c55e",
  VOTING: "#f59e0b",
  COMPLETED: "#374151",
};

export default async function MatchesPage() {
  const session = await auth();
  const matches = await prisma.match.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      creator: { select: { name: true, avatar: true } },
      players: {
        include: { user: { select: { name: true, avatar: true } } },
      },
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Matches</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            All matches
          </p>
        </div>
        {session && (
          <Link
            href="/matches/new"
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: "var(--orange)", color: "#fff" }}
          >
            + New Match
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {matches.length === 0 ? (
          <div
            className="py-16 text-center rounded-xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            No matches yet.{" "}
            {session ? (
              <Link href="/matches/new" style={{ color: "var(--orange)" }}>
                Create the first one!
              </Link>
            ) : (
              "Sign in to create one."
            )}
          </div>
        ) : (
          matches.map((m) => (
            <Link
              key={m.id}
              href={`/matches/${m.id}`}
              className="flex items-center gap-4 px-5 py-4 rounded-xl transition-colors hover:bg-white/[0.03]"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              {/* Status badge */}
              <div
                className="text-xs px-2 py-1 rounded font-semibold shrink-0"
                style={{ background: STATUS_COLOR[m.status] + "22", color: STATUS_COLOR[m.status] }}
              >
                {STATUS_LABEL[m.status]}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">
                  {m.mode === "CAPTAIN_DRAFT" ? "Captain Draft" : "Random Teams"}
                  {m.maps.length > 0 && (
                    <span className="font-normal ml-2" style={{ color: "var(--muted)" }}>
                      · {m.maps.join(", ")}
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  by {m.creator.name} · {m.players.length}/10 players
                </div>
              </div>

              {/* Player avatars */}
              <div className="flex -space-x-2 shrink-0">
                {m.players.slice(0, 6).map((p) =>
                  p.user.avatar ? (
                    <Image
                      key={p.id}
                      src={p.user.avatar}
                      alt={p.user.name}
                      width={24}
                      height={24}
                      className="rounded-full ring-2"
                      style={{ outline: "2px solid var(--surface)" }}
                    />
                  ) : (
                    <div
                      key={p.id}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ring-2"
                      style={{ background: "var(--surface2)", outline: "2px solid var(--surface)" }}
                    >
                      {p.user.name[0]?.toUpperCase()}
                    </div>
                  )
                )}
                {m.players.length > 6 && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs ring-2"
                    style={{ background: "var(--surface2)", color: "var(--muted)" }}
                  >
                    +{m.players.length - 6}
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
