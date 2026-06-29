"use server";

/**
 * Server actions for MusiCam. Class creation is gated to authenticated
 * teachers and produces a signed room link (see lib/roomToken).
 */

import { auth, authConfigured } from "@/auth";
import { generateRoomCode, signRoom } from "@/lib/roomToken";

/**
 * Create a new class and return its signed link `/room/<code>?t=<sig>`.
 * Only authenticated teachers may create when auth is configured.
 */
export async function createClassLink(): Promise<string> {
  if (authConfigured) {
    const session = await auth();
    if (!session?.user) {
      throw new Error("Solo profesores autenticados pueden crear una clase.");
    }
  }
  const code = generateRoomCode();
  return `/room/${code}?t=${signRoom(code)}`;
}
