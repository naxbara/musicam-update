# MusiCam 🎵

Videollamadas 1:1 para clases de música, pensada para profesores sin perfil técnico. El sonido del instrumento llega intacto: sin supresión de ruido, sin cancelación de eco y sin control automático de ganancia.

## Cómo dar una clase (3 pasos)

1. Abre MusiCam y pulsa **🎵 Iniciar nueva clase** → se genera un **enlace único para esa sesión**.
2. Pulsa **✉️ Invitar estudiante**: se copia un mensaje listo para pegar en WhatsApp o correo.
3. El estudiante abre el enlace y la clase conecta sola. Usa audífonos para evitar eco.

## Características

1. **Audio crudo**: `noiseSuppression`, `echoCancellation` y `autoGainControl` desactivados. Opus forzado a estéreo 256 kbps, 48 kHz, sin DTX (las notas sostenidas no se cortan como "silencio").
2. **PiP movible**: arrastra tu propia imagen a cualquier posición; se recuerda entre sesiones.
3. **Modo instrumento**: compresor suave + ganancia de realce (1x–4x) que potencia el instrumento como Teams/Zoom hacen con la voz.
4. **📱 Celular Android como segunda cámara (vía WiFi)**: pulsa el botón 📱, escanea el QR con el celular y este transmite su cámara por el navegador (sin instalar nada). Ideal como "cámara de manos" sobre el teclado, el mástil o el arco. Mejor en la misma red WiFi (menor latencia).
5. **👥 Vista dual cara + manos** (`⌘⌥4`): tu cara y la cámara del celular sobre el instrumento, lado a lado en una sola imagen. El estudiante ve postura y digitación a la vez.
6. **♩ Metrónomo compartido**: clics Web Audio inyectados en el audio saliente — profesor y estudiante escuchan el mismo pulso, sincronizado con el instrumento (viaja con la misma latencia). 40–208 BPM, acento cada 4 tiempos.
7. **Atajos** (⌘+⌥ en Mac / Ctrl+Alt en Windows):
   - `⌘⌥1` — cámara principal
   - `⌘⌥2` — cámara del celular (o segunda webcam si no hay celular)
   - `⌘⌥3` — compartir pantalla (toggle)
   - `⌘⌥4` — vista dual cara + manos (toggle)
   - `⌘⌥R` — iniciar grabación
   - `⌘⌥M` — 🚩 marcar momento clave durante la grabación
   - `Pausa` — detener grabación y guardar el video
8. **Grabación sincronizada con momentos clave**: video compuesto (estudiante + tu PiP) con el audio de ambos mezclado en un `.webm`. Al detener, sugiere guardar en el **Escritorio** (Chrome/Edge). Si marcaste momentos (`⌘⌥M`), se genera además un `.txt` con los tiempos (`02:13 — Momento 1`) para que el estudiante repase directo esos pasajes.

## Cómo funciona la conexión

P2P con WebRTC vía [PeerJS](https://peerjs.com). Cada sesión usa IDs derivados del código único: `musicam-<código>` (sala) y `musicam-<código>-cam` (celular). La señalización usa el broker público de PeerJS (sin cuenta ni configuración); para señalización propia, montar [peerjs-server](https://github.com/peers/peerjs-server) y pasar `host/port` a `new Peer()`.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de producción (deployable en Vercel)
```

Nota: para probar la cámara del celular en desarrollo local se necesita HTTPS o que el celular acceda vía la URL desplegada (Vercel); `getUserMedia` no funciona sobre HTTP en red local. Lo más simple: deployar en Vercel y usar esa URL siempre.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · PeerJS (WebRTC) · Web Audio API · MediaRecorder · qrcode

## Estructura

```
app/page.tsx              # Lobby: iniciar clase / entrar con código
app/room/[roomId]/        # Sala de clase (client-only)
app/cam/[roomId]/         # Página que abre el celular (cámara remota)
components/CallRoom.tsx   # Llamada: peer, cámaras, atajos, PiP, grabación, QR
components/PhoneCam.tsx   # Celular: transmite su cámara a la sala
lib/audio.ts              # Captura cruda, cadena de instrumento, SDP Opus hi-fi
lib/recorder.ts           # Composición canvas + mezcla de audio, guardado
```

## Notas

- Requiere HTTPS (o localhost) para cámara/micrófono/pantalla.
- Grabación en `.webm`; convertible a `.mp4`: `ffmpeg -i clase.webm -c:v libx264 -c:a aac clase.mp4`.
- En teclados sin tecla `Pausa` (Mac compactos), detén la grabación con el botón ⏹.
- Entra tú primero a la sala antes de compartir el enlace (así quedas como anfitrión y el celular conecta directo contigo).
