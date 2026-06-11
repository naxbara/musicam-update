"use client";

/**
 * Phone camera page: opened on an Android phone (same WiFi recommended for
 * low latency). It registers as `musicam-<room>-cam` and answers the
 * teacher's call with the phone camera stream. No app install needed —
 * just the browser.
 */

import { useEffect, useRef, useState } from "react";
import Peer, { MediaConnection } from "peerjs";

type CamStatus = "init" | "ready" | "live" | "busy" | "error";

export default function PhoneCam({ roomId }: { roomId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);

  const [status, setStatus] = useState<CamStatus>("init");
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  // Keep the screen awake while streaming
  useEffect(() => {
    let lock: any = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* unsupported */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false, // audio travels through the teacher's mic — avoids echo
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        const camId = `musicam-${roomId.replace(/[^a-z0-9-]/gi, "-")}-cam`;
        const peer = new Peer(camId);
        peerRef.current = peer;

        peer.on("open", () => setStatus("ready"));
        peer.on("call", (call) => {
          callRef.current = call;
          call.answer(streamRef.current!);
          setStatus("live");
          call.on("close", () => setStatus("ready"));
          call.on("error", () => setStatus("ready"));
        });
        peer.on("error", (err: any) => {
          if (err.type === "unavailable-id") setStatus("busy");
          else if (err.type !== "peer-unavailable") setStatus("error");
        });
      } catch {
        setStatus("error");
      }
    }

    void setup();

    return () => {
      cancelled = true;
      callRef.current?.close();
      peerRef.current?.destroy();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId]);

  const flipCamera = async () => {
    const next = facing === "environment" ? "user" : "environment";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: next,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      const newTrack = stream.getVideoTracks()[0];

      // Live-swap the track on the active call, if any
      const sender = callRef.current?.peerConnection
        ?.getSenders()
        .find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(newTrack);

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setFacing(next);
    } catch {
      /* keep current camera */
    }
  };

  const banner: Record<CamStatus, { text: string; cls: string }> = {
    init: { text: "Activando cámara…", cls: "bg-gray-700" },
    ready: {
      text: "✅ Listo. En tu computador, presiona ⌘⌥2 (o Ctrl+Alt+2) para usar esta cámara.",
      cls: "bg-emerald-700",
    },
    live: { text: "🔴 Transmitiendo a tu clase", cls: "bg-red-600" },
    busy: {
      text: "Ya hay otro celular conectado a esta sala. Cierra esa pestaña y recarga.",
      cls: "bg-amber-700",
    },
    error: {
      text: "No se pudo activar la cámara. Revisa los permisos del navegador y recarga.",
      cls: "bg-red-800",
    },
  };

  return (
    <div className="relative flex h-screen w-screen flex-col bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain"
      />

      <div className="absolute left-0 right-0 top-0 p-3">
        <div
          className={`rounded-xl px-4 py-3 text-center text-sm font-medium text-white shadow-lg ${banner[status].cls}`}
        >
          {banner[status].text}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-4">
        <span className="text-xs text-gray-300">
          MusiCam · sala <span className="font-mono">{roomId}</span>
        </span>
        <button
          onClick={() => void flipCamera()}
          className="rounded-full bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
        >
          🔄 Girar cámara
        </button>
      </div>
    </div>
  );
}
