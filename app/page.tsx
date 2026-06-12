import { auth, authConfigured } from "@/auth";
import Lobby from "@/components/Lobby";

// Session depends on cookies — never prerender
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = authConfigured ? await auth() : null;

  return (
    <Lobby
      authConfigured={authConfigured}
      teacher={Boolean(session?.user)}
      userName={session?.user?.name ?? null}
    />
  );
}
