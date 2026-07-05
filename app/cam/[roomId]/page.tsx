"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { sanitizePeerId } from "@/lib/peerConfig";

const PhoneCam = dynamic(() => import("@/components/PhoneCam"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Activando cámara…
    </div>
  ),
});

export default function CamPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const code = decodeURIComponent(roomId);
  return (
    <PhoneCam
      camPeerId={`musicam-${sanitizePeerId(code)}-cam`}
      subtitle={`sala ${code}`}
      mode="room"
    />
  );
}
