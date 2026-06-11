"use client";

import dynamic from "next/dynamic";

const PhoneCam = dynamic(() => import("@/components/PhoneCam"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Activando cámara…
    </div>
  ),
});

export default function CamPage({ params }: { params: { roomId: string } }) {
  return <PhoneCam roomId={decodeURIComponent(params.roomId)} />;
}
