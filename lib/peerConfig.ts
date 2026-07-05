/**
 * Shared PeerJS setup (client-safe). Centralizes the peer-id sanitizer, the
 * ICE-server config (fetched once from /api/ice, with a STUN fallback), and a
 * `createPeer` factory so every peer in the app uses the same config — the
 * hook for a future self-hosted broker or a TURN service lives here.
 */

import Peer, { PeerOptions } from "peerjs";

/** Strip anything that PeerJS can't use in an id (keep [a-z0-9-]). */
export function sanitizePeerId(s: string): string {
  return s.replace(/[^a-z0-9-]/gi, "-");
}

const STUN_FALLBACK: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

let icePromise: Promise<RTCIceServer[]> | null = null;

/**
 * ICE servers for RTCPeerConnection, fetched once and cached at the module
 * level. Passing `config` to PeerJS *replaces* its default iceServers, so the
 * fallback must still include a public STUN server.
 */
export function getIceServers(): Promise<RTCIceServer[]> {
  if (!icePromise) {
    icePromise = fetch("/api/ice")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const servers = data?.iceServers;
        return Array.isArray(servers) && servers.length > 0
          ? (servers as RTCIceServer[])
          : STUN_FALLBACK;
      })
      .catch(() => STUN_FALLBACK);
  }
  return icePromise;
}

/**
 * Optional self-hosted broker. If `NEXT_PUBLIC_PEER_HOST` is set we point
 * PeerJS at it (host/port/path); otherwise the public 0.peerjs.com broker is
 * used. See BITACORA "Pendientes" for standing up peerjs-server.
 */
function brokerOptions(): PeerOptions {
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  if (!host) return {};
  const opts: PeerOptions = { host };
  const port = process.env.NEXT_PUBLIC_PEER_PORT;
  const path = process.env.NEXT_PUBLIC_PEER_PATH;
  if (port) opts.port = Number(port);
  if (path) opts.path = path;
  return opts;
}

/**
 * Create a Peer with the shared ICE config. Pass an `id` to claim a fixed peer
 * id (host / phone-cam), or omit it for an auto-assigned guest id.
 */
export async function createPeer(id?: string): Promise<Peer> {
  const iceServers = await getIceServers();
  const options: PeerOptions = {
    ...brokerOptions(),
    config: { iceServers },
  };
  return id ? new Peer(id, options) : new Peer(options);
}
