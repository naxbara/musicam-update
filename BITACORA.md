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

## Pendientes / ideas futuras

- [ ] Validar salas contra una base de datos (Supabase) para que solo existan salas creadas por profesores.
- [ ] Borrar el repo antiguo `ssuarez-crosslines/musicam`.
- [ ] Activar 2FA/passkey en la cuenta de Vercel (se omitió durante el setup).
- [ ] Afinador: ¿modo de referencia configurable (A=440/442)?
- [ ] Si se suman más profesores: agregarlos a la allowlist (código) y como test users (GCP), o publicar la app OAuth.
- [ ] Tutorial PDF: actualizarlo con afinador, selector de audio y login.

---

*Mantenido por Claude (Cowork). Última actualización: 2026-06-11.*
