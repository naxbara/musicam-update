import { NextResponse } from "next/server";

/**
 * Per-device web manifest. The Android WebAPK launches `start_url`, so it must
 * point back at this exact paired-device page — hence one manifest per id.
 * No service worker: nothing works offline and caching stale JS in a WebRTC
 * app is a hazard; Chrome no longer requires an SW to be installable.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const start = `/cam/device/${encodeURIComponent(deviceId)}`;
  return NextResponse.json(
    {
      name: "MusiCam Cámara",
      short_name: "MusiCam Cam",
      start_url: start,
      scope: start,
      display: "standalone",
      orientation: "any",
      background_color: "#000000",
      theme_color: "#000000",
      icons: [
        { src: "/icons/cam-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icons/cam-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
