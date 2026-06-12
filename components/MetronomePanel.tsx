"use client";

/**
 * Metronome panel: big BPM readout with Italian tempo name, slider,
 * tap-tempo, and a 4-beat visual indicator synced to the audible click.
 */

import { useRef } from "react";
import { BEATS_PER_MEASURE } from "@/lib/metronome";

function tempoName(bpm: number): string {
  if (bpm <= 60) return "Largo";
  if (bpm <= 76) return "Adagio";
  if (bpm <= 108) return "Andante";
  if (bpm <= 120) return "Moderato";
  if (bpm <= 156) return "Allegro";
  if (bpm <= 176) return "Vivace";
  return "Presto";
}

export default function MetronomePanel({
  open,
  on,
  bpm,
  beat,
  onToggle,
  onBpm,
  onClose,
}: {
  open: boolean;
  on: boolean;
  bpm: number;
  /** Current beat index (0 = accent), -1 when stopped. */
  beat: number;
  onToggle: () => void;
  onBpm: (v: number) => void;
  onClose: () => void;
}) {
  const tapsRef = useRef<number[]>([]);

  const tap = () => {
    const now = performance.now();
    const taps = tapsRef.current.filter((t) => now - t < 2500);
    taps.push(now);
    tapsRef.current = taps;
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = Math.round(Math.min(208, Math.max(40, 60000 / avg)));
      onBpm(newBpm);
    }
  };

  if (!open) return null;

  return (
    <div className="absolute bottom-full left-1/2 z-40 mb-3 w-64 -translate-x-1/2 rounded-2xl border border-gray-700 bg-panel/95 p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Metrónomo
        </p>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white">
          Cerrar
        </button>
      </div>

      {/* BPM readout */}
      <div className="flex items-end justify-center gap-2">
        <span className="text-5xl font-bold leading-none text-white tabular-nums">
          {bpm}
        </span>
        <span className="pb-0.5 text-xs text-gray-400">
          BPM · <span className="italic text-accent">{tempoName(bpm)}</span>
        </span>
      </div>

      {/* Beat dots */}
      <div className="mt-4 flex items-center justify-center gap-3">
        {Array.from({ length: BEATS_PER_MEASURE }).map((_, i) => {
          const active = on && beat === i;
          return (
            <span
              key={i}
              className={`rounded-full transition-all duration-100 ${
                active
                  ? i === 0
                    ? "h-4 w-4 bg-accent shadow-[0_0_12px_rgba(232,179,57,0.8)]"
                    : "h-3.5 w-3.5 bg-white"
                  : "h-2.5 w-2.5 bg-white/20"
              }`}
            />
          );
        })}
      </div>

      <input
        type="range"
        min={40}
        max={208}
        step={1}
        value={bpm}
        onChange={(e) => onBpm(Number(e.target.value))}
        className="mt-4 w-full accent-[#e8b339]"
        aria-label="Tempo"
      />

      <div className="mt-3 flex gap-2">
        <button
          onClick={onToggle}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
            on
              ? "bg-white/15 text-white hover:bg-white/25"
              : "bg-accent text-black hover:brightness-110"
          }`}
        >
          {on ? "Detener" : "Iniciar"}
        </button>
        <button
          onClick={tap}
          className="rounded-xl border border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-accent hover:text-accent active:scale-95"
          title="Marca el pulso tocando este botón"
        >
          TAP
        </button>
      </div>

      <p className="mt-2.5 text-center text-[10px] leading-snug text-gray-500">
        El pulso lo escuchan ambos, sincronizado con tu instrumento.
      </p>
    </div>
  );
}
