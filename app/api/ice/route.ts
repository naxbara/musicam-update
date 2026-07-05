import { NextResponse } from "next/server";

/**
 * Returns the ICE servers for WebRTC. TURN credentials (if any) live in the
 * server-side `ICE_SERVERS` env var (a JSON array of RTCIceServer), so they
 * stay out of the client bundle and can be rotated without a redeploy.
 *
 * No env set → public STUN only (current behaviour). To enable TURN, set
 * ICE_SERVERS in Vercel, e.g.
 *   [{"urls":"stun:stun.l.google.com:19302"},
 *    {"urls":"turns:turn.example.com:443?transport=tcp","username":"u","credential":"c"}]
 */
export const dynamic = "force-dynamic";

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export function GET() {
  let iceServers = DEFAULT_ICE;
  const raw = process.env.ICE_SERVERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) iceServers = parsed;
    } catch {
      /* malformed env → fall back to STUN */
    }
  }
  return NextResponse.json({ iceServers });
}
