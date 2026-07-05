# Bitácora de desarrollo — MusiCam

Registro de todo lo construido, decidido y configurado. Orden cronológico.

---

## Sesión 1 — 2026-06-11 · Construcción inicial

**v0.1 "MusiCall" → MusiCam** (Next.js 14, App Router, TypeScript, Tailwind, PeerJS)

- Videollamada 1:1 P2P (WebRTC vía PeerJS, broker público; el primero en entrar a la sala es anfitrión).
- **Audio crudo**: `noiseSuppression/echoCancellation/autoGainControl` desactivados; Opus forzado a estéreo 256 kbps 48 kHz sin DTX (SDP transform en `lib/audio.ts`).
- **Modo instrumento**: compresor suave + ganancia 1x–4x (cadena Web Audio).
- **PiP movible** (drag, posición persistida en localStorage).
- **Atajos**: ⌘⌥1 cámara principal · ⌘⌥2 segunda cámara · ⌘⌥3 pantalla · ⌘⌥R grabar · Pausa detener.
- **Grabación**: composición en canvas (remoto + PiP) + mezcla de audio sincronizada → `.webm`; guarda en Escritorio vía File System Access API.
- Toggle anti-eco para uso sin audífonos.

**Cambios de alcance**: renombrado a **MusiCam**; enlace único por sesión (`sol-x4k29p`); botón "Invitar estudiante" con mensaje listo para WhatsApp.

**📱 Celular Android como cámara 2 (WiFi)**: página `/cam/[roomId]` que el celular abre tras escanear un QR; transmite su cámara vía PeerJS (`musicam-<sala>-cam`); sin instalar apps; wake lock + girar cámara.

**Features diferenciadoras** (elegidas: metrónomo, vista dual, marcadores):
- **♩ Metrónomo compartido**: clic inyectado en el audio saliente — ambos escuchan el mismo pulso, alineado con el instrumento. Scheduler look-ahead.
- **👥 Vista dual (⌘⌥4)**: cara + manos lado a lado, compuestas en canvas y enviadas como un solo track.
- **🚩 Momentos clave (⌘⌥M)**: marcadores durante la grabación; exporta `.txt` con tiempos junto al video.

**Entregables**: `docs/Tutorial-MusiCam.pdf` (9 págs., para profesor no técnico) y `docs/prompt-infografia-nano-banana.md`.

## Sesión 1 — Infraestructura

- **GitHub**: primero quedó por error en `ssuarez-crosslines/musicam` (gh CLI con cuenta equivocada) → recreado como **`naxbara/musicam-update`** (público). El repo viejo quedó pendiente de borrar.
- **Vercel**: proyecto **musicam-update** importado desde GitHub (team `grinxs-projects-97e45b56`), auto-deploy en cada push a `master`. URL producción: **https://musicam-update.vercel.app**
- **Seguridad**: `npm audit` reveló CVEs de Next 14 (React2Shell + RSC DoS) → parche 14.2.35 → un `npm audit fix --force` del usuario forzó Next 16 → **migración completa a Next 16.2.9 + React 19** (`params` como Promise con `use()`). Advertencia registrada: NO correr `npm audit fix --force` (propone downgrade a next@9).
- **Botonera con tooltips**: botón por cada comando con atajo; tooltip hover con nombre + descripción + atajo según SO (⌘⌥ Mac / Ctrl+Alt Windows).

## Sesión 2 — 2026-06-11 · Actualización mayor

1. **Selector de entrada de audio** (`AudioSettingsPanel`): micrófono/interfaz (enumerateDevices + devicechange), **canal estéreo/izquierdo/derecho** (ChannelSplitter para interfaces con instrumento en un canal), modo instrumento, potencia y anti-eco. `rebuildAudio()` reconstruye la cadena en vivo.
2. **Afinador cromático** (`TunerPanel` + `lib/tuner.ts`): autocorrelación ACF2+ con interpolación parabólica; nota latina (Do–Si) + octava, cents (zona verde ±5), Hz; fuente conmutable **Tú / Estudiante**.
3. **Rediseño minimalista** (`components/icons.tsx`): set propio de iconos de línea 24px/1.8 stroke; badges numéricos con el atajo en cámaras/pantalla/dual; **grabar = punto rojo, detener = cuadrado rojo clásico**.
4. **Metrónomo con facha** (`MetronomePanel`): BPM grande + nombre italiano del tempo, 4 puntos pulsando sincronizados con el clic (acento dorado), slider 40–208, **TAP tempo**.
5. **Créditos en el lobby**: "Creado por Rodrigo Pérez de Castro y Sebastián Suárez".
6. **Login Google solo profesores** (NextAuth v5 beta 31): allowlist `ssuarez@gmail.com` + `rperezdecastro@gmail.com`; el lobby exige sesión para crear clase; estudiantes entran libres con el código. Si faltan las env vars, la app funciona sin login (deploy nunca se rompe).

## Sesión 2 — Configuración OAuth (Google Cloud + Vercel)

- Proyecto GCP: **MusiCam** (`molten-castle-499203-q0`, cuenta ssuarez@gmail.com, país Chile, TOS aceptados).
- Pantalla de consentimiento: External, **modo testing** (no requiere verificación de Google).
- Cliente OAuth: **MusiCam Web** (Web application).
  - Orígenes: `https://musicam-update.vercel.app`, `http://localhost:3000`
  - Redirects: `…/api/auth/callback/google` en ambos orígenes.
  - El JSON de credenciales lo descargó Sebastián (el secret no se puede volver a ver en GCP).
- **Test users**: ssuarez@gmail.com, rperezdecastro@gmail.com (doble candado con la allowlist del código).
- **Vercel env vars** (Production + Preview; Development no admite variables sensitive): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Redeploy manual para tomarlas. ⚠️ Los valores NO están en el repo (público); para desarrollo local usar `.env.local` (gitignoreado).
- Primera vez que un profesor entra: Google muestra "app no verificada" → **Continuar** (normal en modo testing).

## Sesión 3 — 2026-06-28 · Pulido de la sala (7 mejoras)

Pedidas por Rodrigo y Sebastián. Infra nueva clave: **canal de datos PeerJS** (`DataConnection`) entre profesor y estudiante — antes solo había `MediaConnection`. Lo comparten acordes y chat.

1. **PiP redimensionable** (`CallRoom`): handle en la esquina inferior-derecha; estira manteniendo 16:9 (mín 140px, máx 45% del ancho). Tamaño persistido en `localStorage` (`musicam-pip-size`), aparte de la posición.
2. **Acordes (⌘⌥5)** (`ChordOverlay`): caja de texto sobre el video que el profesor escribe, **mueve y estira con el mouse**, con mini-toolbar de fuente (color, tamaño, transparencia). Texto + posición + tamaño + estilo se **sincronizan al estudiante** por el canal de datos (él la ve en solo lectura). Estilo/posición recordados en `localStorage` (`musicam-chord-style`). Solo el host (profesor) edita.
3. **Afinador arreglado + notación americana** (`lib/tuner.ts`): `NOTE_NAMES` ahora C–B (clave americana). Bug de detección: el recorte usaba umbral fijo `0.2` que descartaba casi toda la señal → ahora **adaptativo** (`0.2 × pico`), gate RMS bajado a `0.005`, y selección de pico anti-octava (primer pico ≥90% de la energía).
4. **Comandos**: se mantienen ⌘⌥1–4; nuevos **⌘⌥5 acordes** y **⌘⌥C chat**.
5. **Pantalla previa** (`PreJoin` + `RoomGate`): antes de entrar, preview de cámara/mic con medidor de nivel + campo de nombre; login Google **opcional** (solo profesores; estudiantes entran con nombre, que se usa como autor en el chat). La ruta `/room/[roomId]` ahora monta `RoomGate`.
6. **Orientación de la cámara del celular** (`PhoneCam`): botón Vertical/Horizontal que re-pide la cámara con dimensiones intercambiadas (portrait 720×1280 para piano) y hace `replaceTrack` en vivo. El display usa `object-contain` (y el PiP local también cuando se usa el celular) para no recortar el retrato.
7. **Chat (⌘⌥C)** (`ChatPanel`): panel lateral con burbujas propio/ajeno y badge de no leídos; sobre el canal de datos.

**Nota dev**: `node_modules` estaba incompleto (faltaba `next-auth`) → `npm install` (sin `audit fix --force`). Next reconfiguró `tsconfig.json` automáticamente durante el build. Build + TypeScript OK; `/`, `/room/*`, `/cam/*` responden 200.

## Sesión 4 — 2026-06-29 · Entrada unificada + creación solo para profesores

Problema: el control de "quién crea una clase" era solo cosmético (el lobby ocultaba el botón, pero cualquiera que abriera `/room/<código>` y llegara primero se volvía host). Además la pre-sala tenía un botón Google opcional que duplicaba el login.

- **Enlaces firmados (HMAC, stateless)** (`lib/roomToken.ts`): el código de sala sigue legible (peer id limpio) y la prueba viaja en `?t=<firma>`, donde firma = `HMAC-SHA256(AUTH_SECRET, code)`. `verifyRoom` usa comparación en tiempo constante. Sin base de datos.
- **Creación gated** (`app/actions.ts`, server action `createClassLink`): verifica la sesión del profesor (`auth()`) y devuelve `/room/<code>?t=<firma>`. El lobby llama al action y navega.
- **Verificación en el servidor** (`app/room/[roomId]/page.tsx`): ahora es **server component async**; lee `?t`, valida la firma y solo entonces monta `RoomGate`. Firma ausente/alterada → pantalla "Esta sala no es válida". El `?t=` queda en la barra de direcciones, así la invitación de la sala (`window.location.href`) ya lo arrastra para el estudiante.
- **Lobby con dos caminos claros** (`Lobby.tsx`): tarjeta **Profesor** (login Google → Crear clase) y tarjeta **Estudiante** (pegar enlace → entrar; acepta link completo o código). Generación de código movida al servidor.
- **Pre-sala limpia** (`PreJoin.tsx`): se quitó el botón "Entrar con Google (opcional)"; queda solo el chequeo de cámara/mic + nombre (prefill desde `localStorage`/sesión).
- **Modo abierto preservado**: si faltan las env vars (`authConfigured=false`, local/preview), se omite la verificación y la creación es libre — no se rompe nada.

Verificado en dev (env dummy): link firmado entra, sin token/alterado → "sala no válida"; logueado-fuera muestra login y oculta "Crear clase". Build + TypeScript OK.

## Sesión 5 — 2026-07-04 · Cámara externa confiable, selector de fuentes, URL fija y afinador preciso

Ejecución del plan `docs/PLAN-MEJORAS.md` (diagnóstico del 2026-07-02 + feedback "Versión 4"). Motivo: los profesores reportaban que la cámara del celular fallaba; el diagnóstico halló que `PhoneCam` no se recuperaba de nada (recarga → `unavailable-id` clavado; segundo plano → frame congelado) y que la conexión hacía un solo intento sin reintentos ni ICE/TURN.

**P0 — Resiliencia de la cámara externa**
- **`lib/peerConfig.ts`** (nuevo): `sanitizePeerId`, `getIceServers()` (fetch cacheado a `/api/ice`, fallback STUN), `createPeer(id?)` con config ICE compartida y hooks opcionales de broker propio (`NEXT_PUBLIC_PEER_HOST/PORT/PATH`). Todos los peers pasan por acá.
- **`app/api/ice/route.ts`** (nuevo): sirve `{ iceServers }` desde la env server-side `ICE_SERVERS` (JSON); sin env → STUN público. **TURN queda listo por env, sin contratar servicio aún** (ver P2).
- **`PhoneCam.tsx`** (reescrito): nuevos estados (`init/no-camera/retrying/ready/live/busy/error`); ciclo de peer con **reintentos + backoff** (2→4→8→15s, `busy` recién a los ~90s), `peer.reconnect()` en `disconnected`; `acquireCamera()` reutilizable con `track.onended → reacquire` y **re-adquisición al volver a primer plano** (fix del frame congelado iOS); en llamada entrante cierra la anterior antes de contestar (el redial del profesor gana) + `oniceconnectionstatechange`. Props ahora `{ camPeerId, subtitle, mode }`.
- **`CallRoom.tsx`**: `createPeer()` en host y guest; `peer.reconnect()` en `disconnected` de ambos; **loop de redial del guest cada 4s (~15 intentos) que reabre el data channel** (chat/acordes ya no mueren si el estudiante llega primero); `wireCall` avisa en conexión inestable y el guest re-llama en `failed`. `connectPhoneCam` → helper `callCamPeer(targetId, timeoutMs)` + **3 intentos × 6s**, con `phoneConnecting` para la UI y fallback a la cámara del PC si el ICE del celular cae en vivo.

**P1a — Selector de cámaras con un clic**
- El botón del celular ahora **siempre** hace `selectSecondCamera()` (celular → 2ª webcam → QR), con pulso "conectando".
- `switchCamera(index)` → `switchCamera(deviceId?)`; se trackea `currentCamId`. `refreshAudioDevices` → `refreshDevices` (también lista `videoDevices`).
- **`CameraMenu.tsx`** (nuevo): dropdown sobre "Cámara principal" (chevron) — cada webcam por nombre, "Cámara del celular" con punto de estado, pantalla, vista dual + selector "junto a:", y "Vincular celular (QR)…". Un clic = un cambio. Atajos 1–4 intactos.

**P1b — URL fija / celular vinculado (sin DB)**
- **`lib/pairing.ts`** (nuevo): `createDeviceId()` (UUID→12 chars base36), `getPairedDevice/setPairedDevice/clearPairedDevice` (localStorage `musicam-paired-cam`), `devCamPeerId(id)` = `musicam-dev-<id>`.
- **`app/cam/device/[deviceId]/`** (nuevo): server component con `generateMetadata` (manifest), wrapper client `DeviceCam`, y **`manifest.webmanifest/route.ts`** por dispositivo (WebAPK Android lanza el `start_url`). Banner "cámara fija" + copy "deja el celular conectado a la corriente". Sin gate (el UUID es el secreto) y **sin service worker**.
- `connectPhoneCam` marca **en paralelo** el dispositivo vinculado (`musicam-dev-<id>`) y el legacy (`musicam-<code>-cam`); gana el primer stream. Overlay QR con sección colapsable "Vincular este celular de forma permanente": generar enlace fijo + 2º QR + copiar + instrucciones A2HS (Android/iPhone) + estado "vinculado ✓ · fecha" + desvincular.
- **Iconos PWA** derivados del logo: `public/icons/cam-192.png`, `cam-512.png`, `apple-touch-icon.png`.

**P1c — Segunda fuente de video simultánea (vista dual generalizada)**
- `toggleDualView(source?)` compone cara + **fuente B elegible**: `phone` (call P2P existente), `device` (2ª webcam por `deviceId`, track local adicional) o `screen` (`getDisplayMedia`). Al salir de dual se detiene el track extra (la del celular sigue en su call). Combinación persistida en `musicam-dual-source`; el submenú de `CameraMenu` la elige; la cámara activa se excluye como fuente B.

**P1d — Precisión del afinador**
- `lib/tuner.ts`: `fftSize` 2048 → **4096** (~7 períodos en E2); `autoCorrelate` devuelve **clarity** (`maxVal/c[0]`) y descarta lecturas < 0.5 (no más notas fantasma en silencio); **suavizado temporal** en `PitchDetector` (mediana de 5 frecuencias + histéresis de nota 2 frames + EMA de cents); **A4 configurable** (440/441/442, `setReferenceHz`, selector en `TunerPanel` persistido en `musicam-tuner-a4`).

Build + TypeScript OK con todas las rutas nuevas.

## Pendientes / ideas futuras

- [ ] **Activar TURN en producción** (⬆ prioridad): las capturas del usuario mostraban errores QUIC masivos en servicios Google → UDP degradado en su red; sin TURN sobre TCP/TLS 443, WebRTC no tiene salida ahí. El código (P0) ya está listo: crear cuenta Metered (20 GB/mes gratis) o Cloudflare Calls y setear `ICE_SERVERS` en Vercel. Falta decisión de Sebastián de crear la cuenta.
- [ ] Validar salas contra una base de datos (Supabase) para que solo existan salas creadas por profesores.
- [ ] Borrar el repo antiguo `ssuarez-crosslines/musicam`.
- [ ] Activar 2FA/passkey en la cuenta de Vercel (se omitió durante el setup).
- [ ] Si se suman más profesores: agregarlos a la allowlist (código) y como test users (GCP), o publicar la app OAuth.
- [ ] Descomponer `CallRoom.tsx` en hooks (`usePeerConnection`, `useVideoSource`, `usePhoneCam`, `useRecording`) y añadir tests (vitest) de `roomToken`, `tuner`, `pairing`.
- [ ] Actualizar tutorial PDF (v4) con: selector de cámaras, URL fija / celular instalable, vista dual con segunda webcam/pantalla, afinador con A4.
- [x] Afinador: modo de referencia A4 configurable (440/441/442) — hecho en sesión 5.
- [x] Tutorial PDF: actualizado a **v3** (2026-06-29) con caja de acordes, chat, pantalla previa, orientación de cámara del celular, afinador en notación americana y el nuevo flujo de entrada (login Google → crear clase, enlaces firmados). Fuente editable en `docs/Tutorial-MusiCam.html` (se regenera con Chrome headless `--print-to-pdf`).

---

*Mantenido por Claude (Cowork). Última actualización: 2026-07-04.*
