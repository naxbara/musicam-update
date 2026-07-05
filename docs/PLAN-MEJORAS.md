# MusiCam — Plan de mejoras: cámara externa confiable, selector de fuentes y URL fija instalable

> Plan diseñado el 2026-07-02 (sesión de diagnóstico, sin implementación). Retomar desde aquí.
> Decisiones ya tomadas: implementar **todo (P0 + P1a + P1b)**; TURN **solo dejar preparado** vía env var (sin contratar servicio por ahora).
>
> **Actualización 2026-07-04 — feedback "Versión 4" + capturas de consola:**
> 1. Confirmado en terreno: el botón 2 vuelve a mostrar el QR en vez de proyectar la cámara ya conectada → es exactamente el bug de dos pasos diagnosticado en P1a.1 + la falta de reintentos de P0.
> 2. Las capturas de consola del usuario NO muestran errores de MusiCam: son de pestañas de Google (Gmail/Meet/Chat) con `ERR_QUIC_PROTOCOL_ERROR` (QUIC_TOO_MANY_RTOS / QUIC_PUBLIC_RESET) masivos. Eso indica **UDP degradado o bloqueado en la red del usuario** — y WebRTC también viaja por UDP, lo que explica las fallas de cámara en esa red. **Refuerza activar TURN (con transporte TCP/TLS 443) apenas se pueda**; el ítem sube de prioridad en el roadmap (sigue pendiente de decisión de contratar Metered/Cloudflare).
> 3. Nuevos requerimientos incorporados: **P1c** (segunda fuente de video simultánea con selector, generalizando la vista dual) y **P1d** (precisión del afinador). Además, P1a debe dar paridad con el selector de micrófono: elegir la cámara por dispositivo desde la app (hoy solo se puede cambiar la cámara por defecto en la config de Chrome).

## Contexto

Los profesores reportan que **la cámara externa (celular) falla**. La revisión del código confirma las causas:

1. **`PhoneCam.tsx` no se recupera de nada**: si el celular recarga la página antes de que el broker PeerJS libere el ID viejo (~1 min), recibe `unavailable-id` y queda clavado en "Ya hay otro celular conectado" para siempre (`PhoneCam.tsx:86`). No hay `peer.on("disconnected") → reconnect()`, ni re-adquisición de cámara cuando iOS/Android suspenden el video al ir a segundo plano (frame congelado), ni manejo de `track.onended`.
2. **`connectPhoneCam` (`CallRoom.tsx:527-561`)** hace 1 solo intento con timeout de 8 s, sin reintentos.
3. **El botón "Cámara del celular" es de dos pasos confusos** (`CallRoom.tsx:1280-1290`): el primer clic solo abre el QR; conectar requiere ⌘⌥2 o un segundo clic.
4. **Sin TURN ni config de ICE**: en redes móviles/CGNAT el P2P no se establece.
5. **QR por sala**: el código de sala cambia por clase, así que hay que re-escanear el QR cada vez — se pide una URL fija para dejar el celular instalado como "app".
6. **Afinador poco preciso** (feedback Versión 4): `lib/tuner.ts` usa ACF2+ con interpolación parabólica (bien), pero con ventana corta (`fftSize=2048` ≈ 43 ms — apenas ~3.5 períodos para la 6ª cuerda de guitarra), sin métrica de confianza (lecturas de ruido pasan como notas) y sin suavizado temporal (jitter entre frames). Referencia A4=440 hardcodeada (`tuner.ts:112`).
7. **No hay selector de cámara por dispositivo** (feedback Versión 4): la cámara principal es la default del browser y solo se cambia en la config de Chrome; el micrófono sí tiene selector en `AudioSettingsPanel`. Se pide paridad (lo resuelve P1a) y además **una segunda fuente de video simultánea** elegible (lo resuelve P1c).

Convenciones: UI en español, código/comentarios en inglés, commits en inglés imperativo. Audio crudo intacto (no se toca `lib/audio.ts`).

---

## Fase P0 — Arreglar la cámara externa

### 0.1 Nuevo `lib/peerConfig.ts` (client-safe)

- `sanitizePeerId(s)`: extrae el replace `/[^a-z0-9-]/gi` duplicado hoy en `CallRoom.tsx:67` y `PhoneCam.tsx:73`.
- `getIceServers(): Promise<RTCIceServer[]>`: fetch a `/api/ice` con promesa cacheada a nivel de módulo; ante fallo, fallback a `[{ urls: "stun:stun.l.google.com:19302" }]` (al pasar `config` a PeerJS se reemplaza su default, así que el fallback debe incluir STUN).
- `createPeer(id?): Promise<Peer>`: crea el Peer con esa config; lee opcionalmente `NEXT_PUBLIC_PEER_HOST/PORT/PATH` para un broker propio futuro.

### 0.2 Nuevo `app/api/ice/route.ts`

`GET` devuelve `{ iceServers }` parseado de la env server-side `ICE_SERVERS` (JSON string); sin env → default STUN. Así las credenciales TURN quedan fuera del bundle y se pueden rotar. **No se configura servicio TURN ahora** — solo queda el enganche listo.

### 0.3 Rework de `components/PhoneCam.tsx`

Nuevo status: `"init" | "no-camera" | "retrying" | "ready" | "live" | "busy" | "error"`, con textos en español para cada uno.

**Ciclo de vida del peer con reintentos** (función `startPeer()` re-invocable dentro del efecto):
- `disconnected` → status `retrying` + `peer.reconnect()` (conserva el ID); si falla, recrear completo.
- `unavailable-id` → **no dead-end**: destruir peer, status `retrying`, reintentar `startPeer()` con backoff exponencial (2s→4s→8s, tope 15s, indefinido). El registro viejo en el broker expira en ~1 min, así se auto-repara la recarga. Mensaje: "Reconectando… Si MusiCam está abierto en otra pestaña de este celular, ciérrala." El copy terminal "busy" solo tras ~90 s.
- `network`/`server-error`/`socket-*` → mismo backoff. `peer-unavailable` → ignorar.
- Guardar timers y respetar el flag `cancelled` en cleanup.

**Llamadas entrantes** (arregla el overwrite de `PhoneCam.tsx:78-84`):
- `callRef.current?.close()` **antes** de contestar la nueva (que redial del profesor gane).
- Tras `answer()`, escuchar `oniceconnectionstatechange`: `failed`/`disconnected` → status `retrying`; `connected` → `live`.

**Resiliencia de cámara:**
- Extraer `acquireCamera(facing, orientation)` reutilizada por setup, `restart` (líneas 106-130) y re-adquisición; espejar `facing`/`orientation` en refs (arregla el hard-code de `PhoneCam.tsx:63`).
- `track.onended → reacquire()` (reutiliza el `replaceTrack` de `restart`).
- Extender el handler de `visibilitychange` existente (líneas 47-49): al volver visible, si el track no está `live` → `reacquire()`. **Este es el fix del frame congelado en iOS Safari.**
- `getUserMedia` falla → status `no-camera` con botón "Reintentar" (peer sigue vivo).

### 0.4 Endurecimiento de conexión en `components/CallRoom.tsx`

- Usar `createPeer()` en los 3 sitios de construcción (host `:290`, guest `:263`, y PhoneCam).
- Refactor `connectPhoneCam` → helper `callCamPeer(targetId, timeoutMs)` + hasta **3 intentos × 6 s**, con `notify("Conectando con el celular…")` y estado `phoneConnecting` para la UI. Mantener el cleanup existente de `close`. Añadir `oniceconnectionstatechange`: en `failed` con `usingPhone` → notify + fallback a `switchCamera()` (que el estudiante no vea negro).
- Peer de sala: `peer.on("disconnected") → peer.reconnect()` en host y guest.
- **Retry del guest** (`:270-287`): reemplazar el único retry a los 4 s por loop (cada 4 s, ~15 intentos) que **también re-abre el data channel** (`wireData(guest.connect(hostId, {reliable:true}))` — hoy se omite y chat/acordes mueren si el estudiante llega primero).
- En `wireCall` (`:165-183`): `connectionstatechange` → `disconnected` = toast "Conexión inestable…"; `failed` = status `waiting` + (guest) re-llamar al host.

---

## Fase P1a — Selector de fuentes de cámara con un clic

### 1a.1 Arreglar el botón del celular (trivial, primero)

`CallRoom.tsx:1280-1290`: el `onClick` pasa a ser siempre `void selectSecondCamera()` (ya hace la cascada correcta: celular → 2ª webcam → QR). Mostrar spinner/pulse con `phoneConnecting` mientras marca. ⌘⌥2 no cambia.

### 1a.2 Generalizar `switchCamera`

`switchCamera(index)` (`:563-597`) → `switchCamera(deviceId?: string)`: sin arg = cámara default; con arg = `deviceId: { exact }`. Trackear `currentCamId` desde `newTrack.getSettings().deviceId`. Actualizar `actionsRef` (`:869-890`) y el case `Digit1` (`:903-906`). Extender `refreshAudioDevices` (`:156-163`) a `refreshDevices` que también setea `videoDevices` (el listener `devicechange` de `:321` ya la re-dispara).

### 1a.3 Nuevo `components/CameraMenu.tsx`

Dropdown siguiendo el patrón de `MetronomePanel`/`AudioSettingsPanel` (posicionado sobre su botón del control bar, props `open`/`onClose`). Filas en español: cada webcam por nombre (fallback "Cámara 1/2…"), "Cámara del celular" con punto de estado (gris/ámbar/verde), "Compartir pantalla", "Vista dual (cara + manos)", divisor, "Vincular celular (código QR)…". Un clic = un cambio; check en la fuente activa. Se monta junto al botón "Cámara principal" con un chevron que togglea `showCameraMenu` (mismo patrón de wrapper `relative` del metrónomo, `:1331-1349`). Los botones 2/3/4 y todos los atajos se mantienen.

---

## Fase P1b — URL fija / vinculación permanente del celular

**Diseño stateless, sin DB**: namespace de peer `musicam-dev-<deviceId>` que coexiste con el legacy `musicam-<code>-cam`.

### 1b.1 Nuevo `lib/pairing.ts` (client-only)

`createDeviceId()` (crypto.randomUUID → 12 chars base36, no adivinable), `getPairedDevice()/setPairedDevice()/clearPairedDevice()` (localStorage, key `musicam-paired-cam`, un solo dispositivo reemplazable), `devCamPeerId(id)`.

### 1b.2 Refactor de props de `PhoneCam` + nueva ruta

- Props de `PhoneCam` pasan a `{ camPeerId, subtitle, mode: "room" | "device" }`.
- `app/cam/[roomId]/page.tsx` pasa el peer ID legacy — comportamiento idéntico.
- **Nueva** `app/cam/device/[deviceId]/page.tsx`: **server component** con `generateMetadata` (apunta al manifest, ver 1b.5) que renderiza un wrapper client de `PhoneCam` con `devCamPeerId(deviceId)`, subtitle "cámara fija", mode `device`. Banner ready: "✅ Cámara fija lista. Esperando a que el profesor la use en clase…" + "Deja el celular conectado a la corriente." El loop de reconexión de P0 la mantiene registrada en standby.
- Sin gate, igual que `/cam/<code>` (el UUID es el secreto; solo emite video cuando la llaman — mismo modelo de amenaza que hoy).

### 1b.3 CallRoom: marcar primero al dispositivo vinculado

- Al montar, leer `getPairedDevice()`.
- `connectPhoneCam` marca **ambos objetivos en paralelo** con `callCamPeer`: `musicam-dev-<id>` (si hay vinculado) y el legacy `musicam-<code>-cam`; gana el primer stream, se cierra el perdedor. El QR por sala sigue funcionando para celulares no vinculados.
- Actualizar el filtro de ruido `peer-unavailable` (host `:306-309`, guest `:272-275`): debe matchear también `musicam-dev-` y solo notificar cuando fallen **ambos** objetivos.

### 1b.4 Overlay QR: sección de vinculación

En el overlay existente (`CallRoom.tsx:1195-1251`), sección colapsable "Vincular este celular de forma permanente": botón "Generar enlace fijo" → `setPairedDevice(...)` + segundo QR (reusar patrón `import("qrcode")` de `:785-792`) para `${origin}/cam/device/<id>` + "Copiar enlace" (patrón clipboard de `:1230-1238`). Instrucciones A2HS en español (Android: ⋮ → "Agregar a pantalla de inicio"; iPhone: compartir → "Agregar a pantalla de inicio"). Estado "Celular vinculado ✓ · <fecha>" con botón "Desvincular".

### 1b.5 PWA instalable (manifest, sin service worker)

- **Nueva** `app/cam/device/[deviceId]/manifest.webmanifest/route.ts`: JSON por dispositivo — `name: "MusiCam Cámara"`, `start_url: "/cam/device/<id>"`, `display: "standalone"`, colores negros, iconos 192/512. Debe ser por dispositivo porque el WebAPK de Android lanza el `start_url`.
- **Nuevos assets**: `public/icons/cam-192.png`, `cam-512.png`, `apple-touch-icon.png` (derivar del logo PNG existente en la raíz del repo).
- **Sin service worker** (nada funciona offline y cachear JS viejo en una app WebRTC es riesgo; Chrome ya no lo exige para instalar).
- **iOS**: NO agregar `apple-mobile-web-app-capable` (getUserMedia es poco confiable en standalone iOS); solo `apple-touch-icon` para que el atajo se vea como app y abra Safari.

### Casos borde

- Dos celulares con la misma URL fija → el segundo entra al loop `retrying` de P0; tras 90 s: "Este enlace ya está en uso en otro celular."
- Dispositivo vinculado apagado + celular con QR de sala presente → el dial paralelo lo hace transparente.
- Profesor borra localStorage → re-generar enlace desde el overlay (el copy de "Desvincular/regenerar" menciona re-escanear en el celular).
- Celular bloqueado toda la noche → al desbloquear, `visibilitychange` + loop de reconexión lo restauran solos.

---

## Fase P1c — Segunda fuente de video simultánea (vista dual generalizada)

Hoy la vista dual (`toggleDualView`, `CallRoom.tsx:644`) compone en canvas **solo** cara + celular. El requerimiento es un botón para tener **otra cámara o fuente de video externa conectada en simultáneo**, con la fuente B elegible (otra webcam USB, el celular, o pantalla) — independiente del celular por QR.

- **Generalizar el compositor dual**: extraer la fuente B del composite a un estado `dualSourceB: { kind: "phone" } | { kind: "device"; deviceId: string } | { kind: "screen" }`. El loop de canvas existente (RAF 30fps + `captureStream`) no cambia; solo cambia de dónde sale el segundo track:
  - `phone` → `connectPhoneCam()` (flujo actual, sin cambios).
  - `device` → `getUserMedia({ video: { deviceId: { exact } } })` con un track **adicional** al principal (dos tracks locales vivos a la vez; detener el de la fuente B al salir de dual).
  - `screen` → `getDisplayMedia` (reusar la adquisición de `toggleScreenShare` sin el replace directo).
- **UI**: en `CameraMenu.tsx` (P1a.3), la fila "Vista dual" pasa a tener submenú/selector "junto a: [Cámara del celular | <webcam 2> | <webcam N> | Pantalla]". El botón 4 del control bar y ⌘⌥4 repiten la última combinación usada (persistir en localStorage `musicam-dual-source`).
- **Preview local**: el PiP local ya muestra el track compuesto (sin cambios).
- Caso borde: si la fuente B es la misma cámara que la principal → deshabilitar esa opción en el menú (comparar `deviceId` con `currentCamId` de P1a.2).

---

## Fase P1d — Precisión del afinador (`lib/tuner.ts` + `TunerPanel.tsx`)

1. **Ventana más larga**: `fftSize` de 2048 → **4096** (≈85 ms a 48 kHz; ~7 períodos en E2 82 Hz). Mejora directa de resolución en graves con costo despreciable.
2. **Métrica de confianza (clarity)**: en `autoCorrelate`, devolver también `clarity = maxVal / c[0]`; descartar lecturas con clarity < ~0.5 (hoy el ruido de fondo produce notas fantasma → percepción de imprecisión).
3. **Suavizado temporal en `PitchDetector`** (o en `TunerPanel`): mediana móvil de las últimas 5 frecuencias válidas + histéresis de nota (no cambiar la nota mostrada hasta 2-3 frames consecutivos coincidentes; EMA sobre los cents para que la aguja no tiemble).
4. **Referencia A4 configurable** (absorbe el pendiente de BITACORA): constructor/setter `referenceHz` (440/441/442) en `PitchDetector` reemplazando el 440 fijo de `tuner.ts:112`; selector en `TunerPanel` persistido en localStorage `musicam-tuner-a4`.
5. Mantener el rango A0..C8 y el gate RMS adaptativo existente (fix de la sesión 3).

---

## Fase P2 — Roadmap (posterior)

1. **Activar TURN en prod** (⬆ prioridad tras las capturas del 2026-07-04: la red de al menos un usuario tiene UDP degradado — errores QUIC masivos en servicios Google — y sin TURN sobre TCP/TLS 443 WebRTC no tiene salida ahí): crear cuenta Metered (20 GB/mes gratis) o Cloudflare Calls y setear `ICE_SERVERS` en Vercel — el código de P0 ya queda listo, es solo config. Pendiente decisión de Sebastián de crear la cuenta.
2. **Descomponer `CallRoom.tsx` (1518 líneas)** en hooks: `usePeerConnection`, `useVideoSource`, `usePhoneCam`, `useRecording`.
3. **Tests** (vitest) para funciones puras: `lib/roomToken.ts`, `lib/tuner.ts` (clarity/suavizado de P1d), `lib/pairing.ts`.
4. **Allowlist de profesores vía env var** (hoy hardcodeada en `auth.ts:17`).
5. **Fallback de grabación no-Chromium** (descarga por anchor cuando falta `showSaveFilePicker`).
6. **Salas con DB (Supabase)**: expiración/revocación de links firmados.
7. **Broker peerjs-server propio** solo si 0.peerjs.com sigue fallando tras P0 (env hooks ya en `peerConfig.ts`).

---

## Orden de implementación

0.1/0.2 (peerConfig + API ICE) → 0.3 (PhoneCam) → 0.4 (CallRoom) → 1a.1 (fix botón) → 1a.2/1a.3 (selector) → 1b (pairing + PWA) → 1c (dual generalizada) → 1d (afinador) → actualizar CLAUDE.md y BITACORA.md → commits separados por fase → push (auto-deploy Vercel).

## Verificación

`npm run build` tras cada fase. Prueba manual (laptop Chrome + celular Android, casos críticos también con el celular en datos móviles):

1. *Baseline*: crear sala, escanear QR de sala, ⌘⌥2 → aparece video del celular; ⌘⌥1 vuelve; ⌘⌥4 dual.
2. *P0-recarga*: recargar la página del celular en plena clase → banner cicla "Reconectando…" → "ready" en <60 s sin acción manual; botón del celular reconecta.
3. *P0-background*: mandar el navegador del celular a segundo plano 30 s, volver → preview vivo (no congelado); re-marcar trae video fresco.
4. *P0-doble llamada*: apretar el botón del celular 2 veces rápido → exactamente una llamada viva.
5. *P0-guest primero*: estudiante entra antes que el profesor → conecta al llegar el profesor y **el chat funciona** (data channel reintentado).
6. *P1a*: un clic en el botón del celular con celular listo → cambia sin desvío por el QR; sin celular → QR tras el intento. El menú lista todas las webcams por nombre y cada clic cambia; atajos 1-4 intactos.
7. *P1b*: vincular celular con enlace fijo, agregar a pantalla de inicio (Android: verificar lanzamiento standalone en la URL del dispositivo), cerrar todo, crear una sala **nueva** → el botón del celular conecta con **cero interacción en el celular**. Desvincular → flujo QR de sala sigue OK. Segunda pestaña/celular con la URL fija → mensaje de "en uso".
8. *P1c*: con 2 webcams conectadas, "Vista dual junto a: Cámara 2" → el estudiante ve el composite cara + webcam 2; cambiar a "junto a: celular" → composite cara + celular; salir de dual detiene el track extra (verificar que la luz de la cámara B se apaga). La opción de la cámara activa como fuente B aparece deshabilitada.
9. *P1d*: con guitarra, la 6ª cuerda (E2 82 Hz) se detecta estable y sin saltos de octava; en silencio/ruido ambiente el afinador no muestra notas fantasma; la aguja de cents no tiembla con nota sostenida; cambiar A4 a 442 desplaza la lectura ~-8 cents para una nota afinada a 440.
