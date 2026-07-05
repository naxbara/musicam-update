"use client";

import dynamic from "next/dynamic";
import { devCamPeerId } from "@/lib/pairing";

const PhoneCam = dynamic(() => import("@/components/PhoneCam"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Activando cámara…
    </div>
  ),
});

/** Client wrapper: turns a paired device id into its fixed peer id. */
export default function DeviceCam({ deviceId }: { deviceId: string }) {
  return (
    <PhoneCam
      camPeerId={devCamPeerId(deviceId)}
      subtitle="cámara fija"
      mode="device"
    />
  );
}
