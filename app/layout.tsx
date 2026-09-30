import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "R6 Matches",
  description: "5v5 Rainbow Six Siege match organizer with rankings",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
        </Providers>
        <footer className="text-center text-sm py-6" style={{ color: "var(--muted)" }}>
          R6 Matches — made for the squad
        </footer>
      </body>
    </html>
  );
}
