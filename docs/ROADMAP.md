# MusiCam — Roadmap: de herramienta personal a producto comercializable

*Fecha: 2026-07-05 · Autores: diagnóstico técnico completo del proyecto (Claude Code) · Para revisión de Rodrigo y Sebastián.*

## Qué es este documento

MusiCam hoy funciona para 2 profesores (Sebastián y Rodrigo) con acceso hardcodeado. El objetivo es doble:

- **(A)** Que funcione de forma **robusta para un profesor con sus alumnos** en uso diario.
- **(B)** **Comercializarlo** después a otros profesores de música.

Este roadmap consolida el diagnóstico del estado actual y propone 3 fases para llegar ahí.

---

## Diagnóstico (2026-07-05)

### Fortalezas (conservar tal cual)

- **Capa de videollamada y resiliencia de conexión muy pulida**: backoff exponencial, `peer.reconnect()`, re-adquisición de cámara al volver a primer plano, dial paralelo device+legacy para la cámara del celular (`PhoneCam.tsx`, `CallRoom.tsx`).
- **Herramientas de músico completas**: afinador ACF2+ con A4 configurable, metrónomo con scheduler look-ahead, caja de acordes sincronizada, chat, grabación, audio crudo hi-fi (Opus SDP sin supresión de ruido) — este último es el diferencial del producto.
- **Ganchos de escala ya diseñados**: toda la app crea peers vía `createPeer()` con `ICE_SERVERS` / `NEXT_PUBLIC_PEER_HOST` por variables de entorno (`lib/peerConfig.ts`, `app/api/ice/route.ts`) — activar TURN o un broker propio es solo configuración, cero refactor.
- **Frontera de confianza en el servidor**: creación de clases vía server action gated + firma HMAC de salas (`app/actions.ts`, `lib/roomToken.ts`).
- **Modelo "el alumno nunca necesita cuenta"** — correcto; se conserva en el SaaS (reduce fricción y no infla la base OAuth).

### Debilidades críticas

| # | Problema | Dónde | Impacto |
|---|----------|-------|---------|
| 1 | Sin TURN: en redes con UDP bloqueado/CGNAT la llamada nunca conecta (ya reportado en terreno, errores QUIC) | `app/api/ice/route.ts` (solo STUN por defecto) | Clases que fallan en ~10-15% de redes |
| 2 | Broker público 0.peerjs.com sin SLA: si cae, se cae toda la app | `lib/peerConfig.ts:46-55` | Punto único de fallo diario |
| 3 | La firma HMAC solo gatea la página `/room`, no la señalización: cualquiera con el código puede reclamar el peer id de sala o de la cámara (`/cam/...` no tiene gate alguno) | `CallRoom.tsx:77`, `app/cam/[roomId]/page.tsx` | Hijack de sala/cámara posible |
| 4 | "Host = primero en llegar", no el profesor: si el alumno entra primero, él controla los acordes | `CallRoom.tsx:303-398` | Roles dependen del orden de llegada |
| 5 | El guest se rinde a los ~60s de reintentos sin avisar al usuario que recargue | `CallRoom.tsx:336-343` | Alumno "colgado" sin saber qué hacer |
| 6 | `generateRoomCode` usa `Math.random` (predecible) | `lib/roomToken.ts:16-17` | Sondeo de salas activas viable |
| 7 | Cache de `iceServers` a nivel de módulo, una sola vez: incompatible con credenciales TURN rotativas | `lib/peerConfig.ts:19` | Sesiones largas con credenciales caducadas |
| 8 | Non-null asserts en `call.answer(stream!)` | `PhoneCam.tsx:194`, `CallRoom.tsx:375` | Crash si la cámara no re-adquirió |
| 9 | Data channel sin validación de mensajes entrantes | `CallRoom.tsx:244-260` | Inyección de estado arbitrario |
| 10 | Grabación solo Chromium, sin aviso en Safari/Firefox | `lib/recorder.ts:24-36` | Falla silenciosa |
| 11 | Sin tests, sin ESLint configurado, sin observabilidad de errores | — | Fallos remotos indiagnosticables |

### Bloqueantes para comercializar (hoy no existe nada de esto)

- **Cero persistencia**: sin DB, sin modelo de datos (Profesor, Alumno, Clase). Las salas son firmas HMAC efímeras con un `AUTH_SECRET` global — no caducan, no se revocan, no tienen dueño.
- **Allowlist hardcodeada** (`auth.ts:17`): sumar un profesor = editar código + redeploy + agregarlo a mano en Google Cloud.
- **OAuth en modo testing**: techo duro de 100 test users manuales + warning "app no verificada". Publicar la app requiere verificación de Google (dominio propio + política de privacidad).
- **Sin producto comercial**: `app/page.tsx` monta el lobby funcional directo; no hay landing, pricing, onboarding, dashboard de profesor ni cobro.
- **Pairing de celular en localStorage**: no sigue al profesor entre máquinas/navegadores.

---

## Fase 1 — Robustez para el profesor actual (Rodrigo + alumnos)

**Objetivo**: que las clases no fallen y los problemas sean diagnosticables. ~1-2 sesiones de trabajo + 1 decisión de cuenta.

1. **Activar TURN con Metered.ca (plan gratuito, 50 GB/mes)** — Sebastián crea la cuenta; se setea `ICE_SERVERS` en Vercel (el código ya está listo). Incluye fix del cache de `getIceServers()` (`lib/peerConfig.ts:19`): refrescar con TTL (~1h) para credenciales rotativas.
2. **Rol de host determinístico**: el profesor autenticado es siempre host (control de acordes), independiente del orden de llegada. Propagar el rol por la firma/URL o por el data channel al conectar.
3. **UX de reconexión del guest**: al agotar los reintentos (~60s), mostrar banner "No pudimos conectar — reintentar" con botón que reinicia el loop de redial (en vez de rendirse en silencio).
4. **Endurecer códigos e IDs**: `generateRoomCode` con `crypto.getRandomValues` y más entropía; gate mínimo en `/cam/[roomId]` (arrastrar la firma `?t=` al QR de la cámara por sala).
5. **Fixes de robustez**: guards en `call.answer()` (`PhoneCam.tsx:194`, `CallRoom.tsx:375`); validar shape de los mensajes del data channel; aviso de navegador no soportado para grabación.
6. **Calidad y diagnóstico**: configurar ESLint; tests vitest de `roomToken`, `tuner`, `pairing`; logging básico de errores de conexión (ej. endpoint `/api/log` + Vercel logs, o Sentry free tier) para diagnosticar fallas de alumnos a distancia.
7. **(Opcional, mantenibilidad)** Descomponer `CallRoom.tsx` (1.865 líneas) en hooks: `usePeerConnection`, `useVideoSource`, `usePhoneCam`, `useRecording`. Recomendado hacerlo **antes** de la Fase 2 para no construir sobre el monolito.
8. **Plan B del broker**: documentar (y dejar probado) el despliegue de un peerjs-server propio (Fly.io/Railway, ~$0-5/mes) activable vía `NEXT_PUBLIC_PEER_HOST` si 0.peerjs.com falla. Activarlo de inmediato si hay una segunda caída en clases reales.

**Criterio de salida**: Rodrigo da 2+ semanas de clases sin fallas de conexión no explicadas; toda falla queda logueada.

## Fase 2 — Fundaciones multi-profesor

**Objetivo**: que sumar un profesor no requiera tocar código. Es la base del SaaS. ~3-5 sesiones.

1. **DB Supabase + Prisma** (stack ya dominado en kyon-finance): tablas `Teacher`, `Room` (código, teacherId, expiración, revocada), `PairedDevice`, opcional `Student` (nombre + link permanente).
2. **Allowlist → tabla `Teacher`**: `auth.ts` consulta la DB (cambio de ~3 líneas en el callback `signIn`, ya aislado). Registro con aprobación manual al inicio (waitlist), registro abierto después.
3. **Salas persistidas**: `createClassLink` registra la sala con dueño y expiración; la verificación consulta DB → links revocables, historial "mis clases", link permanente por alumno.
4. **Publicar la app OAuth de Google**: dominio propio, política de privacidad, verificación de Google. Sin esto, techo de 100 profesores.
5. **Pairing de celular en DB**: el `deviceId` se asocia a la cuenta del profesor y lo sigue entre máquinas.
6. **Dashboard de profesor** (ruta nueva `/dashboard`): mis alumnos con sus links, historial de clases, gestión del celular vinculado.
7. **Seguridad de señalización**: peer ids derivados del token de sala (no adivinables) y/o broker propio con API key — cierra el hijack del punto 3 del diagnóstico.

## Fase 3 — Comercialización

**Objetivo**: que un profesor desconocido pueda descubrir, probar y pagar. ~3-4 sesiones + decisiones de negocio.

1. **Landing page** en `/` (el lobby funcional se mueve a `/app` o post-login): propuesta de valor ("audio sin supresión de ruido + herramientas de músico"), demo, testimonios de los primeros profesores.
2. **Onboarding self-service**: registro → tour de 2 min → primer link de clase.
3. **Pricing y cobro**: sugerencia inicial — free trial (ej. 5 clases o 30 días) → plan mensual por profesor. Para cobrar desde una SpA chilena a mercado hispano: **Paddle o Lemon Squeezy** (merchant of record, sin trámites por país) o **MercadoPago/Flow** si el foco es Chile. Decisión de negocio pendiente.
4. **Monitoreo de costos TURN**: es el único costo variable real (~$0.4/GB sobre el free tier de Metered; una clase relayada ≈ 0.5-1 GB/hora). Alertas de consumo + presupuestarlo en el pricing.
5. **Materiales**: tutorial PDF v4 (ya pendiente en BITACORA), video demo, FAQ de configuración de audio por instrumento.
6. **Operación**: 2FA en Vercel, borrar el repo viejo `ssuarez-crosslines/musicam` (pendientes ya anotados en BITACORA).

---

## Costos estimados de operación

| Ítem | Fase 1 | Escala (20-50 profesores) |
|------|--------|---------------------------|
| Vercel | $0 (hobby) | $20/mes (Pro) |
| TURN Metered | $0 (50 GB free) | ~$20-100/mes según % relay |
| Supabase | — | $0-25/mes |
| Broker PeerJS propio | $0 (documentado) | ~$5/mes (Fly.io) |
| Dominio | — | ~$15/año |

## Decisiones pendientes (para conversar entre Rodrigo y Sebastián)

- Nombre/dominio definitivo del producto.
- Modelo de precio (mensual por profesor vs. por alumno activo) y mercado inicial (Chile vs. hispano).
- Quién aprueba a los primeros profesores (waitlist manual).
- Cuándo gatillar la Fase 2 (sugerencia: cuando haya 2-3 profesores reales esperando entrar).
