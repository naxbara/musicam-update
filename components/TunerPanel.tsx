"use client";

/**
 * Chromatic tuner panel: big note display, cents needle and frequency.
 * Source can be your own (raw) mic or the student's incoming audio.
 */

import { useEffect, useRef, useState } from "react";
import { PitchDetector, type PitchReading } from "@/lib/tuner";

export default function TunerPanel({
  open,
  localStream,
  remoteStream,
  onClose,
}: {
  open: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onClose: () => void;
}) {
  const [source, setSource] = useState<"local" | "remote">("local");
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [a4, setA4] = useState(440);
  const detectorRef = useRef<PitchDetector | null>(null);
  const lastGoodRef = useRef<{ r: PitchReading; t: number } | null>(null);

  // Restore the A4 reference (persisted across sessions)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("musicam-tuner-a4");
      if (saved) setA4(Number(saved));
    } catch {
      /* ignore */
    }
  }, []);

  // Apply A4 changes live without rebuilding the detector
  useEffect(() => {
    detectorRef.current?.setReferenceHz(a4);
    try {
      localStorage.setItem("musicam-tuner-a4", String(a4));
    } catch {
      /* ignore */
    }
  }, [a4]);

  useEffect(() => {
    if (!open) return;
    const stream = source === "local" ? localStream : remoteStream;
    if (!stream || stream.getAudioTracks().length === 0) {
      setReading(null);
      return;
    }
    const detector = new PitchDetector(stream, a4);
    detectorRef.current = detector;
    let raf = 0;
    const loop = () => {
      const r = detector.read();
      const now = performance.now();
      if (r) {
        lastGoodRef.current = { r, t: now };
        setReading(r);
      } else if (!lastGoodRef.current || now - lastGoodRef.current.t > 700) {
        setReading(null);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      detector.close();
      detectorRef.current = null;
    };
    // a4 is applied live via setReferenceHz — don't rebuild the detector on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source, localStream, remoteStream]);

  if (!open) return null;

  const cents = reading?.cents ?? 0;
  const inTune = reading !== null && Math.abs(cents) <= 5;
  const needleX = 50 + (Math.max(-50, Math.min(50, cents)) / 50) * 46; // percent

  return (
    <div className="absolute left-1/2 top-16 z-30 w-72 -translate-x-1/2 rounded-2xl border border-gray-700 bg-panel/95 p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Afinador
        </p>
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-0.5 text-[10px]">
          <button
            onClick={() => setSource("local")}
            className={`rounded-full px-2.5 py-1 transition ${
              source === "local" ? "bg-accent font-semibold text-black" : "text-gray-300"
            }`}
          >
            Tú
          </button>
          <button
            onClick={() => setSource("remote")}
            disabled={!remoteStream}
            className={`rounded-full px-2.5 py-1 transition disabled:opacity-40 ${
              source === "remote" ? "bg-accent font-semibold text-black" : "text-gray-300"
            }`}
          >
            Estudiante
          </button>
        </div>
      </div>

      {/* Note display */}
      <div className="flex items-end justify-center gap-1 py-1">
        <span
          className={`text-6xl font-bold leading-none tracking-tight ${
            reading ? (inTune ? "text-emerald-400" : "text-white") : "text-gray-600"
          }`}
        >
          {reading ? reading.note : "—"}
        </span>
        {reading && (
          <span className="pb-1 text-xl font-medium text-gray-400">
            {reading.octave}
          </span>
        )}
      </div>

      {/* Cents gauge */}
      <div className="relative mt-3 h-9">
        <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-white/10" />
        {/* center mark + green zone */}
        <div className="absolute left-1/2 top-1.5 h-4.5 w-px -translate-x-1/2 bg-gray-500"
             style={{ height: 18 }} />
        <div
          className="absolute top-3 h-1.5 rounded-full bg-emerald-500/30"
          style={{ left: "45.4%", width: "9.2%" }}
        />
        {/* needle */}
        <div
          className={`absolute top-0 h-9 w-1 -translate-x-1/2 rounded-full transition-[left] duration-75 ${
            reading ? (inTune ? "bg-emerald-400" : "bg-accent") : "bg-gray-700"
          }`}
          style={{ left: `${needleX}%` }}
        />
        <span className="absolute -bottom-1 left-0 text-[9px] text-gray-500">-50</span>
        <span className="absolute -bottom-1 right-0 text-[9px] text-gray-500">+50</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
        <span>
          {reading
            ? `${reading.freq.toFixed(1)} Hz · ${cents > 0 ? "+" : ""}${cents} cents`
            : source === "remote" && !remoteStream
              ? "Esperando audio del estudiante…"
              : "Toca una nota…"}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          Cerrar
        </button>
      </div>

      {/* A4 reference */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-700 pt-2.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          Referencia A4
        </span>
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-0.5 text-[10px]">
          {[440, 441, 442].map((hz) => (
            <button
              key={hz}
              onClick={() => setA4(hz)}
              className={`rounded-full px-2.5 py-1 transition ${
                a4 === hz ? "bg-accent font-semibold text-black" : "text-gray-300"
              }`}
            >
              {hz}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
