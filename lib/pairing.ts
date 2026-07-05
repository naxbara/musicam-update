/**
 * Permanent phone-camera pairing (client-only, no DB). A paired phone gets a
 * stable, non-guessable device id stored in localStorage on the teacher's
 * machine; the phone opens `/cam/device/<id>` and registers as
 * `musicam-dev-<id>`, which the room dials in parallel with the legacy
 * `musicam-<code>-cam`. This lets the teacher install the phone once and reuse
 * it across every class without re-scanning a QR.
 */

const PAIR_KEY = "musicam-paired-cam";

export interface PairedDevice {
  id: string;
  /** ISO date the pairing was created (for the "vinculado ✓ · fecha" copy). */
  pairedAt: string;
}

/** 12-char base36 id derived from a UUID — not guessable, url-safe. */
export function createDeviceId(): string {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  // Fold the hex into base36 in two chunks to keep it short but high-entropy.
  const a = parseInt(uuid.slice(0, 16), 16).toString(36);
  const b = parseInt(uuid.slice(16, 32), 16).toString(36);
  return (a + b).slice(0, 12).padEnd(12, "0");
}

/** PeerJS id for a paired device camera. */
export function devCamPeerId(id: string): string {
  return `musicam-dev-${id.replace(/[^a-z0-9-]/gi, "-")}`;
}

export function getPairedDevice(): PairedDevice | null {
  try {
    const raw = localStorage.getItem(PAIR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string") return parsed as PairedDevice;
  } catch {
    /* ignore */
  }
  return null;
}

export function setPairedDevice(id: string): PairedDevice {
  const device: PairedDevice = { id, pairedAt: new Date().toISOString() };
  try {
    localStorage.setItem(PAIR_KEY, JSON.stringify(device));
  } catch {
    /* storage full / blocked — the id still works this session */
  }
  return device;
}

export function clearPairedDevice(): void {
  try {
    localStorage.removeItem(PAIR_KEY);
  } catch {
    /* ignore */
  }
}
