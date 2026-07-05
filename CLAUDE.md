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
app/actions.ts                  # Server action createClassLink (gated a profesor) → link firmado
app/room/[roomId]/page.tsx      # Server component: verifica firma ?t= → <RoomGate> o "sala no válida"
app/cam/[roomId]/page.tsx       # Cámara por sala: pasa camPeerId musicam-<code>-cam a <PhoneCam>
app/cam/device/[deviceId]/      # Cámara fija (URL permanente): page (metadata+manifest) + DeviceCam + manifest.webmanifest/route
app/api/ice/route.ts            # GET { iceServers } desde env ICE_SERVERS (JSON) o STUN por defecto
app/api/auth/[...nextauth]/     # Handlers NextAuth
auth.ts                         # Config Google + ALLOWED_TEACHERS (allowlist) + authConfigured
lib/roomToken.ts                # Firma/verificación HMAC de salas (server-only, AUTH_SECRET)
lib/peerConfig.ts               # sanitizePeerId, getIceServers (fetch /api/ice cacheado + fallback STUN), createPeer(id?)
lib/pairing.ts                  # Celular vinculado (localStorage): createDeviceId, get/set/clearPairedDevice, devCamPeerId
components/RoomGate.tsx         # Muestra <PreJoin> hasta unirse, luego monta <CallRoom>
components/PreJoin.tsx          # Pre-sala: preview cámara/mic + nombre + Google opcional
components/CallRoom.tsx         # Núcleo: peer, data channel, cámaras, atajos, grabación, paneles
components/PhoneCam.tsx         # Celular: transmite su cámara, con reconexión/backoff; props {camPeerId, subtitle, mode}
components/CameraMenu.tsx       # Dropdown de fuentes de video (webcams, celular, pantalla, vista dual + fuente B)
components/Lobby.tsx            # Lobby: login profesor / entrada estudiante
components/TunerPanel.tsx       # Afinador (nota americana C–B, cents, Hz, fuente tú/estudiante, A4 440/441/442)
components/MetronomePanel.tsx   # Metrónomo (BPM, tap tempo, beat dots)
components/ChordOverlay.tsx     # Caja de acordes movible/redimensionable (sync vía data channel)
components/ChatPanel.tsx        # Chat de la sala (sync vía data channel)
components/AudioSettingsPanel.tsx # Mic/interfaz, canal L/R/estéreo, boost, anti-eco
components/icons.tsx            # Set de iconos SVG de línea propios
lib/audio.ts                    # Captura cruda, cadena instrumento, canal, SDP Opus hi-fi
lib/tuner.ts                    # Pitch (ACF2+, fftSize 4096, clarity gate, suavizado, A4 configurable)
lib/metronome.ts                # Scheduler look-ahead + onBeat callback
lib/recorder.ts                 # Grabación canvas + mezcla audio, guardado a Escritorio
```

## Atajos de teclado (⌘⌥ en Mac / Ctrl+Alt en Windows)

`1` cámara principal · `2` cámara celular · `3` compartir pantalla · `4` vista dual ·
`5` acordes (caja de texto, solo profesor) · `C` chat · `R` grabar · `M` marcar momento · `Pausa` detener.

## Canal de datos (PeerJS DataConnection)

Además de la llamada de media, profesor y estudiante abren un `DataConnection` (host escucha
`connection`, guest hace `connect`). Lo usan el **chat** (`{type:"chat"}`) y la **caja de acordes**
(`{type:"chord", box}`). El "host" (primero en la sala = normalmente el profesor) edita los acordes;
el estudiante los ve en solo lectura.

## Identificadores de sala (PeerJS)

- Sala: `musicam-<código>` (el primero en llegar es host; el segundo lo llama).
- Celular-cámara por sala: `musicam-<código>-cam` (el profesor lo llama con ⌘⌥2 / botón).
- Celular-cámara fija (vinculado): `musicam-dev-<deviceId>` — coexiste con el legacy; `connectPhoneCam` marca **ambos en paralelo** y gana el primer stream. El `deviceId` vive en localStorage (`musicam-paired-cam`) en la máquina del profesor; el celular abre `/cam/device/<id>` (URL permanente, instalable como PWA).

## Conexión resiliente (ICE / reconexión)

- Todos los `Peer` se crean con `createPeer()` (`lib/peerConfig.ts`), que inyecta `iceServers` desde `/api/ice`. Sin `ICE_SERVERS` en el entorno → solo STUN público (comportamiento actual). Para activar **TURN** (necesario en redes con UDP bloqueado): setear `ICE_SERVERS` en Vercel con un JSON de `RTCIceServer[]` incluyendo un `turns:…:443?transport=tcp`. No hay servicio TURN contratado aún.
- `PhoneCam` y `CallRoom` reintentan con backoff, hacen `peer.reconnect()` en `disconnected`, y re-adquieren la cámara/re-llaman al volver a primer plano. El guest reabre el data channel en su loop de redial.

## Auth (solo profesores) y creación de clase

- **Entrada unificada** (`Lobby.tsx`): dos caminos — Profesor (login Google → "Crear clase") y Estudiante (pegar enlace → entrar).
- **Solo un profesor autenticado crea clases**, con enforcement real vía **enlaces firmados** (no solo UI):
  - Crear pasa por el server action `createClassLink` (`app/actions.ts`), que valida `auth()` y devuelve `/room/<code>?t=<firma>`.
  - `firma = HMAC-SHA256(AUTH_SECRET, code)` (`lib/roomToken.ts`, server-only).
  - La ruta `/room/[roomId]` (server component) valida la firma; sin firma válida → "Esta sala no es válida". El `?t=` viaja en la URL, así la invitación de la sala lo arrastra al estudiante.
- Allowlist en `auth.ts`: `ssuarez@gmail.com`, `rperezdecastro@gmail.com`.
- Google Cloud: proyecto **MusiCam** (`molten-castle-499203-q0`), cliente "MusiCam Web", app en **modo testing** → los mismos 2 emails como test users. Para sumar profesores: agregar en ambos lados.
- Env vars en Vercel (Production+Preview): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Sin ellas `authConfigured=false` → **modo abierto**: creación libre y verificación de firma omitida (no romper deploys/local). Local: `.env.local`.
- Env vars opcionales de conexión: `ICE_SERVERS` (server-side, JSON de `RTCIceServer[]` — para TURN); `NEXT_PUBLIC_PEER_HOST/PORT/PATH` (broker peerjs propio). Sin ellas: STUN público + broker 0.peerjs.com.
- Los estudiantes NUNCA necesitan cuenta (entran por el enlace firmado).

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

**Roadmap de producto en `docs/ROADMAP.md`** (2026-07-05): diagnóstico + 3 fases — robustez para el profesor actual (TURN con Metered, host determinístico, UX de reconexión, tests/observabilidad) → fundaciones multi-profesor (Supabase, registro, dashboard, publicar OAuth) → comercialización (landing, pricing, cobro). Ver también "Pendientes / ideas futuras" en `BITACORA.md`. Prioritario: **activar TURN** (setear `ICE_SERVERS` con Metered/Cloudflare — código ya listo, solo falta contratar cuenta) para las redes con UDP bloqueado. Otros: validación de salas con DB, borrar repo viejo, 2FA Vercel, actualizar tutorial PDF a v4 (selector de cámaras, URL fija, vista dual generalizada, A4).
