import Link from "next/link";
import { authConfigured } from "@/auth";
import { verifyRoom } from "@/lib/roomToken";
import RoomGate from "@/components/RoomGate";

// Reads env + per-request query — never prerender
export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { roomId } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const code = decodeURIComponent(roomId);

  // When auth isn't configured (local/preview) the app stays open. Otherwise
  // the room must carry a valid teacher-issued signature.
  const ok = !authConfigured || verifyRoom(code, token);
  if (!ok) return <InvalidRoom />;

  return <RoomGate roomId={code} />;
}

function InvalidRoom() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="text-5xl">🔒</div>
      <h1 className="text-2xl font-bold">Esta sala no es válida</h1>
      <p className="max-w-md text-sm text-gray-400">
        El enlace está incompleto o no fue creado por un profesor. Pídele a tu
        profesor el enlace de la clase y ábrelo directamente.
      </p>
      <Link
        href="/"
        className="rounded-xl border border-gray-600 px-5 py-3 text-sm font-medium transition hover:border-accent hover:text-accent"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
