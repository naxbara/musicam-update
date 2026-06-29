/**
 * Stateless room signing: a class link is `/room/<code>?t=<hmac>`, where the
 * HMAC proves the room was created by an authenticated teacher. No database —
 * the signature is verified server-side with AUTH_SECRET.
 *
 * Server-only: imports Node `crypto`. Never import from a client component.
 */

import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.AUTH_SECRET ?? "musicam-unconfigured-placeholder";

/** Human-friendly room code: musical note + random suffix, e.g. "sol-x4k29p". */
export function generateRoomCode(): string {
  const notes = ["do", "re", "mi", "fa", "sol", "la", "si"];
  const note = notes[Math.floor(Math.random() * notes.length)];
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${note}-${suffix}`;
}

/** HMAC-SHA256 of the code, hex-encoded. */
export function signRoom(code: string): string {
  return createHmac("sha256", SECRET).update(code).digest("hex");
}

/** Constant-time verification of a room signature. */
export function verifyRoom(code: string, token: string): boolean {
  if (!token) return false;
  const expected = signRoom(code);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
