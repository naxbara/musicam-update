import type { Metadata } from "next";
import DeviceCam from "./DeviceCam";

/**
 * Permanently paired phone camera. The device id (a non-guessable UUID-derived
 * token) is the secret — the page only emits video when the teacher calls it,
 * same threat model as the per-room `/cam/<code>` page. No auth gate.
 *
 * A per-device web manifest (generated below) makes the "Add to home screen"
 * shortcut launch straight back to this URL, so the teacher installs the phone
 * once and reuses it across every class.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}): Promise<Metadata> {
  const { deviceId } = await params;
  const id = encodeURIComponent(deviceId);
  return {
    title: "MusiCam Cámara",
    manifest: `/cam/device/${id}/manifest.webmanifest`,
    appleWebApp: { title: "MusiCam Cámara" },
    icons: { apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function DeviceCamPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  return <DeviceCam deviceId={decodeURIComponent(deviceId)} />;
}
