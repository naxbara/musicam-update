"use client";

/**
 * Gate in front of a room: shows the pre-join screen (device preview + name)
 * until the user joins, then mounts the actual call.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import PreJoin from "@/components/PreJoin";

// PeerJS and Web Audio require window — render the call client-side only.
const CallRoom = dynamic(() => import("@/components/CallRoom"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Cargando sala…
    </div>
  ),
});

export default function RoomGate({ roomId }: { roomId: string }) {
  const [name, setName] = useState<string | null>(null);

  if (name === null) {
    return <PreJoin roomId={roomId} onJoin={setName} />;
  }
  return <CallRoom roomId={roomId} displayName={name} />;
}
