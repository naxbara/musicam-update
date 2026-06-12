/**
 * Google sign-in for teachers/admins only. Students never need an account —
 * they join lessons via the invite link.
 *
 * Required env vars (Vercel → Settings → Environment Variables):
 *   AUTH_SECRET        — random string (e.g. `openssl rand -base64 33`)
 *   AUTH_GOOGLE_ID     — Google OAuth client ID
 *   AUTH_GOOGLE_SECRET — Google OAuth client secret
 *
 * Until those are set, `authConfigured` is false and the app behaves as
 * before (open class creation), so deploys never break.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_TEACHERS = ["ssuarez@gmail.com", "rperezdecastro@gmail.com"];

export const authConfigured = Boolean(
  process.env.AUTH_SECRET &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? "musicam-unconfigured-placeholder",
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
  callbacks: {
    signIn({ user }) {
      return ALLOWED_TEACHERS.includes((user.email ?? "").toLowerCase());
    },
  },
});
