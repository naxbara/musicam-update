"use client";

import { use } from "react";
import dynamic from "next/dynamic";

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
  return <PhoneCam roomId={decodeURIComponent(roomId)} />;
}
