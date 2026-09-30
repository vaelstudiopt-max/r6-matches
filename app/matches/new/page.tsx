"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { R6_MAPS } from "@/lib/maps";
import { useSession } from "next-auth/react";

export default function NewMatchPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [mode, setMode] = useState<"CAPTAIN_DRAFT" | "RANDOM_TEAMS">("RANDOM_TEAMS");
  const [selectedMaps, setSelectedMaps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleMap(id: string) {
    setSelectedMaps((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  async function handleCreate() {
    if (selectedMaps.length === 0) {
      setError("Pick at least one map.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, maps: selectedMaps }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to create match");
        return;
      }
      const match = await res.json();
      router.push(`/matches/${match.id}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" style={{ color: "var(--muted)" }}>
        Loading…
      </div>
    );
  }

  if (!session) {
    router.push("/auth/signin");
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8">New Match</h1>

      {/* Mode */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
          Mode
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {(["RANDOM_TEAMS", "CAPTAIN_DRAFT"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="p-4 rounded-xl text-left transition-all"
              style={{
                background: mode === m ? "var(--orange)" : "var(--surface)",
                border: `1px solid ${mode === m ? "var(--orange)" : "var(--border)"}`,
                color: mode === m ? "#fff" : "var(--text)",
              }}
            >
              <div className="font-semibold text-sm">
                {m === "RANDOM_TEAMS" ? "🎲 Random Teams" : "👑 Captain Draft"}
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: mode === m ? "rgba(255,255,255,0.7)" : "var(--muted)" }}
              >
                {m === "RANDOM_TEAMS"
                  ? "Teams are randomly assigned when match starts"
                  : "Captains are picked, then take turns selecting players"}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Maps */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>
          Maps
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          Select the maps that can be played ({selectedMaps.length} selected)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {R6_MAPS.map((map) => {
            const selected = selectedMaps.includes(map.id);
            return (
              <button
                key={map.id}
                onClick={() => toggleMap(map.id)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all"
                style={{
                  background: selected ? "var(--orange)" : "var(--surface)",
                  border: `1px solid ${selected ? "var(--orange)" : "var(--border)"}`,
                  color: selected ? "#fff" : "var(--text)",
                }}
              >
                <span>{map.image}</span>
                <span className="font-medium truncate">{map.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="text-sm mb-4" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      <button
        onClick={handleCreate}
        disabled={loading || selectedMaps.length === 0}
        className="w-full py-3 rounded-xl font-semibold transition-opacity disabled:opacity-40"
        style={{ background: "var(--orange)", color: "#fff" }}
      >
        {loading ? "Creating…" : "Create Match"}
      </button>
    </div>
  );
}
