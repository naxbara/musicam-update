"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { createClassLink } from "@/app/actions";
import { GoogleIcon, LogoutIcon, NoteIcon } from "@/components/icons";

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
  const [creating, setCreating] = useState(false);

  const canCreate = !authConfigured || teacher;

  const createClass = async () => {
    setCreating(true);
    try {
      const url = await createClassLink();
      router.push(url);
    } catch {
      setCreating(false);
    }
  };

  // Accept either a full invite link (keeps the ?t= signature) or a bare code.
  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinCode.trim();
    if (!raw) return;
    if (raw.includes("/room/")) {
      try {
        const u = new URL(raw, window.location.origin);
        router.push(u.pathname + u.search);
        return;
      } catch {
        /* fall through to bare-code handling */
      }
    }
    router.push(`/room/${encodeURIComponent(raw.toLowerCase())}`);
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

      {/* Two clear paths: teacher (create) and student (join) */}
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {/* Teacher */}
        <section className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-panel p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Profesor
          </h2>
          {canCreate ? (
            <>
              <button
                onClick={() => void createClass()}
                disabled={creating}
                className="rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
              >
                {creating ? "Creando…" : "Crear clase"}
              </button>
              <p className="text-xs text-gray-500">
                Se genera un enlace único y firmado para esta sesión. Dentro de
                la sala, usa <span className="text-gray-300">“Invitar
                estudiante”</span> para enviárselo.
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => void signIn("google")}
                className="flex items-center justify-center gap-3 rounded-xl border border-gray-600 bg-white px-6 py-4 text-base font-semibold text-gray-800 transition hover:brightness-95"
              >
                <GoogleIcon />
                Iniciar sesión con Google
              </button>
              <p className="text-xs text-gray-500">
                Crear clases requiere una cuenta de profesor autorizada.
              </p>
            </>
          )}
        </section>

        {/* Student */}
        <section className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-panel p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Estudiante
          </h2>
          <form onSubmit={joinRoom} className="flex flex-col gap-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Pega el enlace que te envió tu profesor"
              className="rounded-xl border border-gray-700 bg-stage px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-xl border border-gray-600 px-5 py-3 text-sm font-medium transition hover:border-accent hover:text-accent"
            >
              Entrar a la clase
            </button>
          </form>
          <p className="text-xs text-gray-500">
            No necesitas cuenta: entra con el enlace de invitación.
          </p>
        </section>
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
