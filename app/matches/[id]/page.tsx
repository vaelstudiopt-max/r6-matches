"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { getMapById } from "@/lib/maps";

type User = { id: string; name: string; avatar: string | null; points: number; discordId: string };
type Player = { id: string; userId: string; team: "A" | "B" | null; isCaptain: boolean; pointsDelta: number | null; user: User };
type MVPVote = { voterId: string; nomineeId: string; voter: { name: string }; nominee: { name: string } };
type Match = {
  id: string;
  status: "LOBBY" | "DRAFT" | "IN_PROGRESS" | "VOTING" | "COMPLETED";
  mode: "CAPTAIN_DRAFT" | "RANDOM_TEAMS";
  maps: string[];
  winner: "A" | "B" | null;
  draftTurn: "A" | "B" | null;
  creatorId: string;
  creator: { id: string; name: string; avatar: string | null };
  players: Player[];
  mvpVotes: MVPVote[];
};

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const me = session?.user as { discordId?: string } | undefined;

  const [match, setMatch] = useState<Match | null>(null);
  const [myUser, setMyUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchMatch = useCallback(async () => {
    const res = await fetch(`/api/matches/${id}`);
    if (res.ok) setMatch(await res.json());
  }, [id]);

  const fetchMe = useCallback(async () => {
    if (!session) return;
    const res = await fetch("/api/me");
    if (res.ok) setMyUser(await res.json());
  }, [session]);

  useEffect(() => {
    Promise.all([fetchMatch(), fetchMe()]).finally(() => setLoading(false));
    const interval = setInterval(fetchMatch, 4000);
    return () => clearInterval(interval);
  }, [fetchMatch, fetchMe]);

  async function doAction(path: string, body: Record<string, unknown>) {
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/matches/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setMatch(data);
    } catch {
      setError("Network error");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" style={{ color: "var(--muted)" }}>
        Loading match…
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p style={{ color: "var(--muted)" }}>Match not found.</p>
        <Link href="/matches" style={{ color: "var(--orange)" }}>← Back to matches</Link>
      </div>
    );
  }

  const mySlot = myUser ? match.players.find((p) => p.userId === myUser.id) : null;
  const isCreator = myUser?.id === match.creatorId;
  const inMatch = !!mySlot;
  const teamA = match.players.filter((p) => p.team === "A");
  const teamB = match.players.filter((p) => p.team === "B");
  const unpicked = match.players.filter((p) => !p.team);
  const myVote = match.mvpVotes.find((v) => v.voterId === myUser?.id);
  const winnerTeam = match.winner === "A" ? teamA : match.winner === "B" ? teamB : [];
  const isMyCaptainTurn = mySlot?.isCaptain && mySlot.team === match.draftTurn;

  const voteCounts: Record<string, number> = {};
  for (const v of match.mvpVotes) {
    voteCounts[v.nomineeId] = (voteCounts[v.nomineeId] ?? 0) + 1;
  }
  const mvpId = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/matches" className="text-sm hover:opacity-80" style={{ color: "var(--muted)" }}>
            ← Matches
          </Link>
          <h1 className="text-2xl font-bold mt-2">
            {match.mode === "CAPTAIN_DRAFT" ? "Captain Draft" : "Random Teams"}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm" style={{ color: "var(--muted)" }}>
            <StatusBadge status={match.status} />
            <span>by {match.creator.name}</span>
            <span>·</span>
            <span>Maps: {match.maps.map((m) => getMapById(m)?.name ?? m).join(", ")}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: "#7f1d1d22", color: "#f87171", border: "1px solid #7f1d1d" }}>
          {error}
        </div>
      )}

      {/* LOBBY */}
      {match.status === "LOBBY" && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--muted)" }}>
              Players ({match.players.length}/10)
            </h2>
            <div className="space-y-2">
              {match.players.map((p) => (
                <PlayerRow key={p.id} player={p} />
              ))}
            </div>

            <div className="mt-4 flex gap-3 flex-wrap">
              {!inMatch && myUser && match.players.length < 10 && (
                <button
                  onClick={() => doAction("join", {})}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-80"
                  style={{ background: "var(--orange)", color: "#fff" }}
                >
                  Join Match
                </button>
              )}
              {isCreator && match.players.length >= 2 && (
                <button
                  onClick={() => doAction("start", {})}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-80"
                  style={{ background: "#22c55e", color: "#fff" }}
                >
                  Start Match
                </button>
              )}
              {isCreator && match.players.length < 2 && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Need at least 2 players to start
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DRAFT */}
      {match.status === "DRAFT" && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Draft
              </h2>
              <div
                className="text-xs px-2 py-0.5 rounded font-semibold"
                style={{ background: "var(--orange)22", color: "var(--orange)" }}
              >
                Team {match.draftTurn}&apos;s pick
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <TeamColumn title="Team A" players={teamA} highlight={match.draftTurn === "A"} />
              <TeamColumn title="Team B" players={teamB} highlight={match.draftTurn === "B"} />
            </div>

            {unpicked.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                  Available Players
                </h3>
                <div className="flex flex-wrap gap-2">
                  {unpicked.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => isMyCaptainTurn && doAction("draft", { pickUserId: p.userId })}
                      disabled={!isMyCaptainTurn || actionLoading}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all disabled:opacity-50"
                      style={{
                        background: "var(--surface2)",
                        border: `1px solid ${isMyCaptainTurn ? "var(--orange)" : "var(--border)"}`,
                        cursor: isMyCaptainTurn ? "pointer" : "default",
                      }}
                    >
                      <Avatar user={p.user} size={20} />
                      <span>{p.user.name}</span>
                    </button>
                  ))}
                </div>
                {isMyCaptainTurn && (
                  <p className="text-xs mt-2" style={{ color: "var(--orange)" }}>
                    Your turn to pick!
                  </p>
                )}
                {mySlot?.isCaptain && !isMyCaptainTurn && (
                  <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                    Waiting for Team {match.draftTurn} captain to pick…
                  </p>
                )}
                {!mySlot?.isCaptain && (
                  <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                    Waiting for captains to draft…
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* IN_PROGRESS */}
      {match.status === "IN_PROGRESS" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TeamCard title="Team A" players={teamA} color="#3b82f6" />
            <TeamCard title="Team B" players={teamB} color="#ef4444" />
          </div>

          {isCreator && (
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--muted)" }}>
                Submit Result (creator only)
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={() => doAction("result", { winner: "A" })}
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40 transition-opacity hover:opacity-80"
                  style={{ background: "#3b82f622", border: "1px solid #3b82f6", color: "#3b82f6" }}
                >
                  Team A Won
                </button>
                <button
                  onClick={() => doAction("result", { winner: "B" })}
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40 transition-opacity hover:opacity-80"
                  style={{ background: "#ef444422", border: "1px solid #ef4444", color: "#ef4444" }}
                >
                  Team B Won
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VOTING */}
      {match.status === "VOTING" && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-lg">Team {match.winner} Won! 🏆</h2>
            </div>
            <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
              Vote for the MVP from the winning team ({match.mvpVotes.length}/{match.players.length} votes)
            </p>

            <div className="grid grid-cols-2 gap-3">
              {winnerTeam.map((p) => {
                const voteCount = voteCounts[p.userId] ?? 0;
                const alreadyVotedThis = myVote?.nomineeId === p.userId;
                const canVote = !myVote && inMatch && p.userId !== myUser?.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => canVote && doAction("vote", { nomineeId: p.userId })}
                    disabled={!canVote || actionLoading}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                    style={{
                      background: alreadyVotedThis ? "var(--orange)22" : "var(--surface2)",
                      border: `1px solid ${alreadyVotedThis ? "var(--orange)" : "var(--border)"}`,
                      cursor: canVote ? "pointer" : "default",
                    }}
                  >
                    <Avatar user={p.user} size={32} />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{p.user.name}</div>
                      {voteCount > 0 && (
                        <div className="text-xs" style={{ color: "var(--orange)" }}>
                          {voteCount} vote{voteCount !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED */}
      {match.status === "COMPLETED" && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-xl font-bold mb-1">Team {match.winner} Won! 🏆</h2>
            {mvpId && (
              <p className="text-sm mb-6" style={{ color: "var(--orange)" }}>
                MVP: {match.players.find((p) => p.userId === mvpId)?.user.name} ⭐
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              {(["A", "B"] as const).map((team) => {
                const players = match.players.filter((p) => p.team === team);
                const won = match.winner === team;
                return (
                  <div
                    key={team}
                    className="rounded-xl p-4"
                    style={{
                      background: won ? "#22c55e11" : "var(--surface2)",
                      border: `1px solid ${won ? "#22c55e44" : "var(--border)"}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="font-bold">Team {team}</h3>
                      {won && <span className="text-xs text-green-400">✓ Winner</span>}
                    </div>
                    <div className="space-y-2">
                      {players.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 text-sm">
                          <Avatar user={p.user} size={24} />
                          <span className="flex-1">{p.user.name}</span>
                          {p.userId === mvpId && <span style={{ color: "var(--orange)" }}>⭐ MVP</span>}
                          {p.pointsDelta !== null && (
                            <span
                              className="font-bold text-xs"
                              style={{ color: p.pointsDelta >= 0 ? "#4ade80" : "#f87171" }}
                            >
                              {p.pointsDelta >= 0 ? "+" : ""}{p.pointsDelta}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    LOBBY: { bg: "#6b728022", text: "#9ca3af" },
    DRAFT: { bg: "#8b5cf622", text: "#a78bfa" },
    IN_PROGRESS: { bg: "#22c55e22", text: "#4ade80" },
    VOTING: { bg: "#f59e0b22", text: "#fbbf24" },
    COMPLETED: { bg: "#37415122", text: "#6b7280" },
  };
  const labels: Record<string, string> = {
    LOBBY: "Lobby", DRAFT: "Drafting", IN_PROGRESS: "Live", VOTING: "Voting", COMPLETED: "Completed",
  };
  const c = colors[status] ?? colors.LOBBY;
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: c.bg, color: c.text }}>
      {labels[status] ?? status}
    </span>
  );
}

function Avatar({ user, size }: { user: { name: string; avatar: string | null }; size: number }) {
  return user.avatar ? (
    <Image src={user.avatar} alt={user.name} width={size} height={size} className="rounded-full shrink-0" />
  ) : (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: "var(--surface2)", fontSize: size * 0.4 }}
    >
      {user.name[0]?.toUpperCase()}
    </div>
  );
}

function PlayerRow({ player }: { player: Player }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Avatar user={player.user} size={28} />
      <span className="font-medium">{player.user.name}</span>
      <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
        {player.user.points} pts
      </span>
    </div>
  );
}

function TeamColumn({ title, players, highlight }: { title: string; players: Player[]; highlight: boolean }) {
  return (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: highlight ? "var(--orange)" : "var(--muted)" }}
      >
        {title} {highlight && "← picking"}
      </div>
      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <Avatar user={p.user} size={24} />
            <span>{p.user.name}</span>
            {p.isCaptain && <span className="text-xs" style={{ color: "var(--orange)" }}>C</span>}
          </div>
        ))}
        {players.length === 0 && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>No players yet</div>
        )}
      </div>
    </div>
  );
}

function TeamCard({ title, players, color }: { title: string; players: Player[]; color: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--surface)", border: `1px solid ${color}44` }}
    >
      <h3 className="font-bold mb-3" style={{ color }}>
        {title}
      </h3>
      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <Avatar user={p.user} size={24} />
            <span>{p.user.name}</span>
            <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
              {p.user.points} pts
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
