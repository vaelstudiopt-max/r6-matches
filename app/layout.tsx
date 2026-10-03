import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "R6 Matches | Community Scrims",
  description: "Queue up, draft your squad, veto maps, and climb the community leaderboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
