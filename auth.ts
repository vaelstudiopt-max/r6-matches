import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      authorization: { params: { scope: "identify" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false;
      const avatarUrl = profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null;
      await prisma.user.upsert({
        where: { discordId: String(profile.id) },
        update: {
          name: String(profile.global_name ?? profile.username),
          avatar: avatarUrl,
        },
        create: {
          discordId: String(profile.id),
          name: String(profile.global_name ?? profile.username),
          avatar: avatarUrl,
        },
      });
      return true;
    },
    async jwt({ token, profile }) {
      if (profile?.id) {
        token.discordId = String(profile.id);
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as { discordId?: string }).discordId = token.discordId as string;
      return session;
    },
  },
});
