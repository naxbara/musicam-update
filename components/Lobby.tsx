"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { GoogleIcon, LogoutIcon, NoteIcon } from "@/components/icons";

/**
 * Unique link per session: musical note + random suffix, e.g. "sol-x4k29p".
 */
function generateSessionCode(): string {
  const notes = ["do", "re", "mi", "fa", "sol", "la", "si"];
  const note = notes[Math.floor(Math.random() * notes.length)];
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${note}-${suffix}`;
}

export default function Lobby({
  authConfigured,
  teacher,
  userName,
}: {
  authConfigured: boolean;
  teacher: boolean;
  userName: string | null;
}) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const canCreate = !authConfigured || teacher;
  const createClass = () => router.push(`/room/${generateSessionCode()}`);

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (code) router.push(`/room/${encodeURIComponent(code)}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-9 p-6">
      {/* Teacher session badge */}
      {authConfigured && teacher && (
        <div className="absolute right-4 top-4 flex items-center gap-3 rounded-full bg-white/5 py-1.5 pl-4 pr-2 text-xs text-gray-300">
          <span>
            Profesor: <b className="text-white">{userName ?? "—"}</b>
          </span>
          <button
            onClick={() => void signOut()}
            title="Cerrar sesión"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white"
          >
            <LogoutIcon width={14} height={14} />
          </button>
        </div>
      )}

      <div className="text-center">
        <div className="mb-4 flex justify-center text-accent">
          <NoteIcon width={44} height={44} strokeWidth={1.5} />
        </div>
        <h1 className="text-5xl font-bold tracking-tight">
          Musi<span className="text-accent">Cam</span>
        </h1>
        <p className="mt-3 max-w-md text-sm text-gray-400">
          Tu sala de clases de música en línea. Sonido real del instrumento,
          cámara extra desde tu celular y grabación de la clase.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Creado por <span className="text-gray-300">Rodrigo Pérez de Castro</span> y{" "}
          <span className="text-gray-300">Sebastián Suárez</span>
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        {canCreate ? (
          <>
            <button
              onClick={createClass}
              className="rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-black transition hover:brightness-110"
            >
              Iniciar nueva clase
            </button>
            <p className="text-center text-xs text-gray-500">
              Se crea un enlace único para esta sesión. Dentro de la sala, usa{" "}
              <span className="text-gray-300">“Invitar estudiante”</span> para
              enviárselo.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={() => void signIn("google")}
              className="flex items-center justify-center gap-3 rounded-xl border border-gray-600 bg-white px-6 py-4 text-base font-semibold text-gray-800 transition hover:brightness-95"
            >
              <GoogleIcon />
              Iniciar sesión como profesor
            </button>
            <p className="text-center text-xs text-gray-500">
              Crear clases requiere una cuenta de profesor autorizada.
              <br />
              ¿Eres estudiante? Entra abajo con el código que te enviaron.
            </p>
          </>
        )}

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
          <p className="font-semibold text-gray-300">Sonido fiel</p>
          <p className="mt-1">
            Sin supresión de ruido: tu instrumento se escucha tal cual es.
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-panel p-4">
          <p className="font-semibold text-gray-300">Cámara de manos</p>
          <p className="mt-1">
            Tu celular como segunda cámara: escanea un código QR y cambia con
            un atajo.
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-panel p-4">
          <p className="font-semibold text-gray-300">Afinador y metrónomo</p>
          <p className="mt-1">
            Herramientas de músico integradas, y grabación de la clase con
            momentos clave.
          </p>
        </div>
      </div>
    </main>
  );
}
