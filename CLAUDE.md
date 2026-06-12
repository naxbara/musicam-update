# CLAUDE.md — MusiCam

Contexto para trabajar en este proyecto. Historial completo en `BITACORA.md`.

## Qué es

Videollamadas 1:1 para clases de música (profesor ↔ estudiante), creada por Rodrigo Pérez de Castro y Sebastián Suárez. Diferencial: el audio viaja **sin supresión de ruido** (las apps de reuniones destruyen el sonido de instrumentos) + herramientas de músico integradas.

- **Producción**: https://musicam-update.vercel.app (auto-deploy desde `master`)
- **Repo**: github.com/naxbara/musicam-update (público)
- **Vercel**: proyecto `musicam-update`, team `grinxs-projects-97e45b56`

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · PeerJS (WebRTC P2P, broker público) · Web Audio API · MediaRecorder · NextAuth v5 beta (Google) · qrcode

## Arquitectura

```
app/page.tsx                    # Server component: lee sesión → <Lobby>
app/room/[roomId]/page.tsx      # Sala (client-only, params vía use())
app/cam/[roomId]/page.tsx       # Página que abre el celular (cámara remota)
app/api/auth/[...nextauth]/     # Handlers NextAuth
auth.ts                         # Config Google + ALLOWED_TEACHERS (allowlist)
components/CallRoom.tsx         # Núcleo: peer, cámaras, atajos, grabación, paneles
components/PhoneCam.tsx         # Celular: transmite su cámara a la sala
components/Lobby.tsx            # Lobby: login profesor / entrada estudiante
components/TunerPanel.tsx       # Afinador (nota, cents, Hz, fuente tú/estudiante)
components/MetronomePanel.tsx   # Metrónomo (BPM, tap tempo, beat dots)
components/AudioSettingsPanel.tsx # Mic/interfaz, canal L/R/estéreo, boost, anti-eco
components/icons.tsx            # Set de iconos SVG de línea propios
lib/audio.ts                    # Captura cruda, cadena instrumento, canal, SDP Opus hi-fi
lib/tuner.ts                    # Detección de pitch (autocorrelación ACF2+)
lib/metronome.ts                # Scheduler look-ahead + onBeat callback
lib/recorder.ts                 # Grabación canvas + mezcla audio, guardado a Escritorio
```

## Identificadores de sala (PeerJS)

- Sala: `musicam-<código>` (el primero en llegar es host; el segundo lo llama).
- Celular-cámara: `musicam-<código>-cam` (el profesor lo llama con ⌘⌥2).

## Auth (solo profesores)

- Allowlist en `auth.ts`: `ssuarez@gmail.com`, `rperezdecastro@gmail.com`.
- Google Cloud: proyecto **MusiCam** (`molten-castle-499203-q0`), cliente "MusiCam Web", app en **modo testing** → los mismos 2 emails como test users. Para sumar profesores: agregar en ambos lados.
- Env vars en Vercel (Production+Preview): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Sin ellas `authConfigured=false` y la app funciona sin login (no romper deploys). Local: `.env.local`.
- Los estudiantes NUNCA necesitan cuenta (entran por enlace/código).

## Convenciones y advertencias

- UI en español; código/comentarios en inglés; commits en inglés imperativo.
- **NO correr `npm audit fix --force`** (propone downgrade destructivo de next).
- El audio del micrófono debe permanecer CRUDO por defecto (no agregar procesamiento que altere el instrumento); anti-eco es opt-in.
- Cambios de schema de audio: la cadena se reconstruye con `rebuildAudio()` — el metrónomo queda apuntando a la cadena vieja y se resetea a propósito.
- La grabación usa `.webm` (VP9/Opus); la tecla Pausa detiene; en Macs compactos no existe → botón.
- Si el broker público de PeerJS falla, montar peerjs-server propio y pasar host/port a `new Peer()`.

## Comandos

```bash
npm run dev      # http://localhost:3000
npm run build    # build producción
git push         # → auto-deploy en Vercel
```

## Pendientes

Ver sección "Pendientes / ideas futuras" en `BITACORA.md` (validación de salas con DB, borrar repo viejo, 2FA Vercel, actualizar tutorial PDF).
