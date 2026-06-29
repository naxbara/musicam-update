"use client";

/**
 * Pre-join screen shown before entering a room: a camera/mic preview and a
 * display-name field. Students never log in — teacher authentication lives in
 * the lobby. The name is prefilled from a previous session or, for a
 * signed-in teacher, from their Google account.
 */

import { useEffect, useRef, useState } from "react";
import { getSession } from "next-auth/react";
import { NoteIcon } from "@/components/icons";
import { buildAudioConstraints } from "@/lib/audio";

const NAME_KEY = "musicam-name";

export default function PreJoin({
  roomId,
  onJoin,
}: {
  roomId: string;
  onJoin: (name: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [level, setLevel] = useState(0);

  // Prefill the name from a previous session, or from the Google account.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) setName(saved);
    } catch {
      /* ignore */
    }
    void getSession().then((s) => {
      if (s?.user?.name) setName((prev) => prev || s.user!.name!);
    });
  }, []);

  // Camera + mic preview (with a simple input-level meter).
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let audioCtx: AudioContext | null = null;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: buildAudioConstraints({ echoCancel: false }),
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);

        // Lightweight mic-level meter (reassures musicians the mic is live).
        audioCtx = new AudioContext();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let rms = 0;
          for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
          setLevel(Math.min(1, Math.sqrt(rms / buf.length) * 4));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void audioCtx?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const join = () => {
    const finalName = name.trim() || "Invitado";
    try {
      localStorage.setItem(NAME_KEY, finalName);
    } catch {
      /* ignore */
    }
    // Release the preview stream so CallRoom can re-acquire it cleanly.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onJoin(finalName);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="mb-3 flex justify-center text-accent">
          <NoteIcon width={36} height={36} strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Musi<span className="text-accent">Cam</span>
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Estás por entrar a la sala <span className="font-mono text-gray-300">{roomId}</span>
        </p>
      </div>

      {/* Camera preview */}
      <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-2xl border border-gray-700 bg-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Activando cámara y micrófono…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-300">
            No se pudo acceder a cámara/micrófono. Revisa los permisos y recarga.
          </div>
        )}
        {/* Mic level meter */}
        {ready && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
            <span className="text-[10px] text-white/70">🎤</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-75"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Name + join */}
      <div className="flex w-full max-w-md flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          className="rounded-xl border border-gray-700 bg-panel px-4 py-3 text-sm outline-none focus:border-accent"
          onKeyDown={(e) => e.key === "Enter" && join()}
        />
        <button
          onClick={join}
          className="rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-black transition hover:brightness-110"
        >
          Unirse a la clase
        </button>
        <p className="text-center text-xs text-gray-500">
          Revisa tu cámara y micrófono antes de entrar.
        </p>
      </div>
    </main>
  );
}
