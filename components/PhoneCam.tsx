"use client";

/**
 * Phone camera page: opened on a phone (same WiFi recommended for low
 * latency). It registers under a fixed peer id and answers the teacher's call
 * with the phone camera stream. No app install needed — just the browser.
 *
 * Two modes share this component:
 *  - "room":   peer id `musicam-<room>-cam` — tied to a single class code.
 *  - "device": peer id `musicam-dev-<id>`   — a permanently paired phone that
 *              works across classes (see lib/pairing.ts).
 *
 * Resilience (fixes the "external camera fails" reports):
 *  - The peer auto-reconnects with backoff on disconnect / unavailable-id /
 *    network errors, so reloading the page or locking the phone recovers on
 *    its own within ~1 min (the broker frees the old id).
 *  - The camera is re-acquired when a track ends or the tab returns to the
 *    foreground (iOS/Android freeze the video in the background).
 */

import { useEffect, useRef, useState } from "react";
import { MediaConnection } from "peerjs";
import { createPeer } from "@/lib/peerConfig";
import type Peer from "peerjs";

type CamStatus =
  | "init"
  | "no-camera"
  | "retrying"
  | "ready"
  | "live"
  | "busy"
  | "error";

type Facing = "environment" | "user";
type Orientation = "landscape" | "portrait";

export type PhoneCamMode = "room" | "device";

export default function PhoneCam({
  camPeerId,
  subtitle,
  mode = "room",
}: {
  camPeerId: string;
  /** Small caption under the banner (room code or "cámara fija"). */
  subtitle: string;
  mode?: PhoneCamMode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);

  // Live facing/orientation, mirrored in refs so re-acquire (which fires from
  // event handlers outside React's render) always uses the current values.
  const facingRef = useRef<Facing>("environment");
  const orientationRef = useRef<Orientation>("landscape");

  const [status, setStatus] = useState<CamStatus>("init");
  const [facing, setFacing] = useState<Facing>("environment");
  const [orientation, setOrientation] = useState<Orientation>("landscape");

  // Handlers wired inside the main effect (they close over its locals).
  const retryCameraRef = useRef<() => void>(() => {});
  const flipRef = useRef<() => void>(() => {});
  const orientRef = useRef<() => void>(() => {});

  // Camera constraints for a given facing + orientation. Portrait swaps the
  // ideal dimensions (useful for tall instruments like a piano keyboard or a
  // standing guitarist); landscape is the default (16:9).
  const videoConstraints = (f: Facing, o: Orientation): MediaTrackConstraints =>
    o === "portrait"
      ? { facingMode: f, width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9 / 16 } }
      : { facingMode: f, width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } };

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
    let retryTimer: number | null = null;
    let backoff = 2000; // 2s → 4s → 8s → 15s (cap)
    const retryStart = Date.now();

    // ------- camera acquisition (reused by setup, flip and re-acquire) -------

    async function acquireCamera(f: Facing, o: Orientation): Promise<boolean> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints(f, o),
          audio: false, // audio travels through the teacher's mic — avoids echo
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }
        const oldStream = streamRef.current;
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        facingRef.current = f;
        orientationRef.current = o;
        setFacing(f);
        setOrientation(o);

        const track = stream.getVideoTracks()[0];
        // If a call is live, swap the track so the teacher keeps the stream.
        const sender = callRef.current?.peerConnection
          ?.getSenders()
          .find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);

        // A track can end when the OS revokes the camera; re-acquire it.
        track.onended = () => {
          if (!cancelled) void reacquire();
        };

        oldStream?.getTracks().forEach((t) => t.stop());
        return true;
      } catch {
        return false;
      }
    }

    async function reacquire() {
      const ok = await acquireCamera(facingRef.current, orientationRef.current);
      if (!ok && !cancelled && !streamRef.current) setStatus("no-camera");
    }

    // ------------------------ peer lifecycle w/ retries ---------------------

    function scheduleRetry() {
      if (cancelled) return;
      // After ~90s of failing on a taken id, show the terminal "busy" copy.
      if (Date.now() - retryStart > 90_000) {
        setStatus("busy");
      } else {
        setStatus("retrying");
      }
      retryTimer = window.setTimeout(() => {
        void startPeer();
      }, backoff);
      backoff = Math.min(backoff * 2, 15_000);
    }

    async function startPeer() {
      if (cancelled) return;
      try {
        peerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      let peer: Peer;
      try {
        peer = await createPeer(camPeerId);
      } catch {
        scheduleRetry();
        return;
      }
      if (cancelled) {
        peer.destroy();
        return;
      }
      peerRef.current = peer;

      peer.on("open", () => {
        backoff = 2000; // reset backoff once we're registered
        if (!cancelled) setStatus(callRef.current ? "live" : "ready");
      });

      peer.on("call", (call) => {
        // Close any previous call first so the teacher's redial wins (fixes
        // the overwrite where a stale call kept the stream hostage).
        callRef.current?.close();
        callRef.current = call;
        call.answer(streamRef.current!);
        setStatus("live");

        const pc = call.peerConnection;
        pc.oniceconnectionstatechange = () => {
          const s = pc.iceConnectionState;
          if (s === "failed" || s === "disconnected") {
            if (!cancelled && callRef.current === call) setStatus("retrying");
          } else if (s === "connected" || s === "completed") {
            if (!cancelled && callRef.current === call) setStatus("live");
          }
        };
        call.on("close", () => {
          if (callRef.current === call) {
            callRef.current = null;
            if (!cancelled) setStatus("ready");
          }
        });
        call.on("error", () => {
          if (callRef.current === call) {
            callRef.current = null;
            if (!cancelled) setStatus("ready");
          }
        });
      });

      peer.on("disconnected", () => {
        if (cancelled) return;
        setStatus("retrying");
        try {
          peer.reconnect(); // keeps the same id
        } catch {
          scheduleRetry();
        }
      });

      peer.on("error", (err: any) => {
        if (cancelled) return;
        const type = err?.type;
        if (type === "peer-unavailable") return; // a call target vanished — ignore
        if (
          type === "unavailable-id" ||
          type === "network" ||
          type === "server-error" ||
          type === "socket-error" ||
          type === "socket-closed"
        ) {
          try {
            peer.destroy();
          } catch {
            /* ignore */
          }
          scheduleRetry();
        } else {
          setStatus("error");
        }
      });
    }

    // ------------------------------- boot -----------------------------------

    async function boot() {
      const gotCamera = await acquireCamera("environment", "landscape");
      if (cancelled) return;
      if (!gotCamera) {
        setStatus("no-camera");
        return; // peer stays down until the user retries the camera
      }
      void startPeer();
    }

    void boot();

    // Re-acquire on foreground: fixes the frozen frame after the phone was in
    // the background or locked (iOS Safari suspends the video track).
    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState !== "live") void reacquire();
      // Nudge the peer back if the socket dropped while backgrounded.
      const peer = peerRef.current;
      if (peer && peer.disconnected && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          /* the error handler will schedule a retry */
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    // Expose a manual camera retry for the "no-camera" button.
    retryCameraRef.current = async () => {
      setStatus("init");
      const ok = await acquireCamera("environment", "landscape");
      if (!ok) {
        setStatus("no-camera");
        return;
      }
      if (!peerRef.current || peerRef.current.destroyed) void startPeer();
      else setStatus(callRef.current ? "live" : "ready");
    };

    // Expose flip/orientation so the buttons reuse acquireCamera.
    flipRef.current = () =>
      void acquireCamera(
        facingRef.current === "environment" ? "user" : "environment",
        orientationRef.current
      );
    orientRef.current = () =>
      void acquireCamera(
        facingRef.current,
        orientationRef.current === "landscape" ? "portrait" : "landscape"
      );

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisible);
      callRef.current?.close();
      peerRef.current?.destroy();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [camPeerId]);

  const readyText =
    mode === "device"
      ? "✅ Cámara fija lista. Esperando a que el profesor la use en clase…"
      : "✅ Listo. En tu computador, presiona ⌘⌥2 (o Ctrl+Alt+2) para usar esta cámara.";

  const banner: Record<CamStatus, { text: string; cls: string }> = {
    init: { text: "Activando cámara…", cls: "bg-gray-700" },
    "no-camera": {
      text: "No se pudo activar la cámara. Revisa los permisos del navegador.",
      cls: "bg-red-800",
    },
    retrying: {
      text: "Reconectando… Si MusiCam está abierto en otra pestaña de este celular, ciérrala.",
      cls: "bg-amber-700",
    },
    ready: { text: readyText, cls: "bg-emerald-700" },
    live: { text: "🔴 Transmitiendo a tu clase", cls: "bg-red-600" },
    busy: {
      text: "Este enlace ya está en uso en otro celular. Cierra esa pestaña y recarga.",
      cls: "bg-amber-700",
    },
    error: {
      text: "No se pudo conectar. Revisa tu red y recarga la página.",
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
          {status === "no-camera" && (
            <button
              onClick={() => retryCameraRef.current()}
              className="ml-3 rounded-full bg-white/20 px-3 py-1 text-xs hover:bg-white/30"
            >
              Reintentar
            </button>
          )}
          {mode === "device" && status === "ready" && (
            <p className="mt-1 text-xs font-normal text-white/80">
              Deja el celular conectado a la corriente.
            </p>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-4">
        <span className="text-xs text-gray-300">
          MusiCam · <span className="font-mono">{subtitle}</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => orientRef.current()}
            className="rounded-full bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
            title="Cambia entre horizontal (guitarra) y vertical (piano)"
          >
            {orientation === "landscape" ? "📐 Vertical" : "📐 Horizontal"}
          </button>
          <button
            onClick={() => flipRef.current()}
            className="rounded-full bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
          >
            🔄 Girar cámara
          </button>
        </div>
      </div>
    </div>
  );
}
