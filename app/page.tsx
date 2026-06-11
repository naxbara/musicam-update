"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Unique link per session: musical note + random suffix + day, e.g.
 * "sol-x4k29p". Collision odds are negligible for 1:1 lessons.
 */
function generateSessionCode(): string {
  const notes = ["do", "re", "mi", "fa", "sol", "la", "si"];
  const note = notes[Math.floor(Math.random() * notes.length)];
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${note}-${suffix}`;
}

export default function Lobby() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const createClass = () => router.push(`/room/${generateSessionCode()}`);

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (code) router.push(`/room/${encodeURIComponent(code)}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-6">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Musi<span className="text-accent">Cam</span>
        </h1>
        <p className="mt-3 max-w-md text-sm text-gray-400">
          Tu sala de clases de música en línea. Sonido real del instrumento,
          cámara extra desde tu celular y grabación de la clase.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <button
          onClick={createClass}
          className="rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-black transition hover:brightness-110"
        >
          🎵 Iniciar nueva clase
        </button>
        <p className="text-center text-xs text-gray-500">
          Se crea un enlace único para esta sesión. Dentro de la sala, usa{" "}
          <span className="text-gray-300">“Invitar estudiante”</span> para
          enviárselo.
        </p>

        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
          <div className="h-px flex-1 bg-gray-700" /> ¿te invitaron? entra con
          el código <div className="h-px flex-1 bg-gray-700" />
        </div>

        <form onSubmit={joinRoom} className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ej: sol-x4k29p"
            className="flex-1 rounded-xl border border-gray-700 bg-panel px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-xl border border-gray-600 px-5 py-3 text-sm font-medium transition hover:border-accent hover:text-accent"
          >
            Entrar
          </button>
        </form>
      </div>

      <div className="grid max-w-2xl gap-3 text-xs text-gray-400 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-800 bg-panel p-4">
          <p className="mb-1 text-base">🎻</p>
          <p className="font-semibold text-gray-300">Sonido fiel</p>
          <p>Sin supresión de ruido: tu instrumento se escucha tal cual es.</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-panel p-4">
          <p className="mb-1 text-base">📱</p>
          <p className="font-semibold text-gray-300">Cámara de manos</p>
          <p>
            Tu celular Android como segunda cámara: escanea un código QR y
            cambia con un atajo.
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-panel p-4">
          <p className="mb-1 text-base">⏺</p>
          <p className="font-semibold text-gray-300">Graba la clase</p>
          <p>
            Video con audio sincronizado para que tu estudiante repase en casa.
          </p>
        </div>
      </div>
    </main>
  );
}
