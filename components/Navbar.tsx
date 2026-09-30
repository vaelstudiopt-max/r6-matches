"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";

export default function Navbar() {
  const { data: session, status } = useSession();
  const user = session?.user as { name?: string; image?: string; discordId?: string } | undefined;

  return (
    <nav
      className="sticky top-0 z-50 border-b px-4 py-3 flex items-center justify-between"
      style={{
        background: "rgba(10, 12, 15, 0.92)",
        backdropFilter: "blur(12px)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span style={{ color: "var(--orange)" }}>R6</span>
          <span>Matches</span>
        </Link>
        <div className="hidden sm:flex items-center gap-4 text-sm" style={{ color: "var(--muted)" }}>
          <Link href="/" className="hover:text-white transition-colors">
            Leaderboard
          </Link>
          <Link href="/matches" className="hover:text-white transition-colors">
            Matches
          </Link>
          {session && (
            <Link
              href="/matches/new"
              className="px-3 py-1 rounded text-xs font-semibold transition-colors"
              style={{ background: "var(--orange)", color: "#fff" }}
            >
              + New Match
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {status === "loading" ? (
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            …
          </span>
        ) : session ? (
          <div className="flex items-center gap-3">
            {user?.image && (
              <Image
                src={user.image}
                alt={user.name ?? "avatar"}
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            <span className="hidden sm:block text-sm">{user?.name}</span>
            <button
              onClick={() => signOut()}
              className="text-xs px-3 py-1 rounded transition-colors"
              style={{ background: "var(--surface2)", color: "var(--muted)" }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("discord")}
            className="flex items-center gap-2 px-4 py-2 rounded font-semibold text-sm transition-opacity hover:opacity-80"
            style={{ background: "#5865F2", color: "#fff" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.028.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
            Login with Discord
          </button>
        )}
      </div>
    </nav>
  );
}
