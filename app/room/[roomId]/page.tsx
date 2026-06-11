"use client";

import dynamic from "next/dynamic";

// PeerJS and Web Audio require window — render client-side only
const CallRoom = dynamic(() => import("@/components/CallRoom"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Cargando sala…
    </div>
  ),
});

export default function RoomPage({ params }: { params: { roomId: string } }) {
  return <CallRoom roomId={decodeURIComponent(params.roomId)} />;
}
