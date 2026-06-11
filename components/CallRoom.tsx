"use client";

// MusiCam call room
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Peer, { MediaConnection } from "peerjs";
import {
  RAW_AUDIO_CONSTRAINTS,
  createInstrumentChain,
  hifiOpusSdp,
  type InstrumentChain,
} from "@/lib/audio";
import { CallRecorder, drawCover, saveRecording } from "@/lib/recorder";
import { Metronome } from "@/lib/metronome";

type Status = "init" | "waiting" | "connecting" | "connected" | "ended" | "error";

const PIP_KEY = "musicam-pip-pos";
const PIP_W = 224;
const PIP_H = 126;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CallRoom({ roomId }: { roomId: string }) {
  const router = useRouter();

  // Stable peer IDs for this session
  const baseId = `musicam-${roomId.replace(/[^a-z0-9-]/gi, "-")}`;
  const camPeerId = `${baseId}-cam`;

  // --- refs (mutable call machinery) ---
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const chainRef = useRef<InstrumentChain | null>(null);
  const rawAudioRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const outStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const phoneStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<CallRecorder>(new CallRecorder());
  const metroRef = useRef<Metronome | null>(null);
  const dualRef = useRef<{
    raf: number;
    faceEl: HTMLVideoElement;
    phoneEl: HTMLVideoElement;
  } | null>(null);
  const recStartRef = useRef(0);
  const markersRef = useRef<number[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);

  // --- state ---
  const [status, setStatus] = useState<Status>("init");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [boost, setBoost] = useState(1.4);
  const [enhance, setEnhance] = useState(true);
  const [echoCancel, setEchoCancel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [usingPhone, setUsingPhone] = useState(false);
  const [showPhoneQR, setShowPhoneQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [metroOn, setMetroOn] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [dualActive, setDualActive] = useState(false);
  const [markerCount, setMarkerCount] = useState(0);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // ---------------------------------------------------------------- helpers

  const replaceSenderTrack = useCallback(
    (kind: "audio" | "video", track: MediaStreamTrack) => {
      const pc = callRef.current?.peerConnection;
      const sender = pc?.getSenders().find((s) => s.track?.kind === kind);
      void sender?.replaceTrack(track);
    },
    []
  );

  const setLocalPreview = useCallback((track: MediaStreamTrack) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = new MediaStream([track]);
    }
  }, []);

  const wireCall = useCallback(
    (call: MediaConnection) => {
      callRef.current = call;
      setStatus("connecting");
      call.on("stream", (stream) => {
        remoteStreamRef.current = stream;
        setRemoteStream(stream);
        setStatus("connected");
      });
      call.on("close", () => {
        remoteStreamRef.current = null;
        setRemoteStream(null);
        setStatus("waiting");
        notify("El otro participante salió de la sala");
      });
      call.on("error", () => setStatus("error"));
    },
    [notify]
  );

  // ---------------------------------------------------------- media + peer

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: RAW_AUDIO_CONSTRAINTS,
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }

        rawAudioRef.current = new MediaStream(media.getAudioTracks());
        cameraTrackRef.current = media.getVideoTracks()[0] ?? null;

        const chain = createInstrumentChain(rawAudioRef.current);
        chainRef.current = chain;

        const outTracks: MediaStreamTrack[] = [];
        if (cameraTrackRef.current) outTracks.push(cameraTrackRef.current);
        outTracks.push(...chain.outputStream.getAudioTracks());
        outStreamRef.current = new MediaStream(outTracks);

        if (cameraTrackRef.current) setLocalPreview(cameraTrackRef.current);

        // --- PeerJS: first to claim the room id is host; otherwise guest ---
        const hostId = baseId;
        const sdpOpts = { sdpTransform: hifiOpusSdp };

        const startAsGuest = () => {
          const guest = new Peer();
          peerRef.current = guest;
          guest.on("open", () => {
            const call = guest.call(hostId, outStreamRef.current!, sdpOpts);
            wireCall(call);
          });
          guest.on("error", (err: any) => {
            if (err.type === "peer-unavailable") {
              if (String(err.message).includes("-cam")) {
                notify("El celular aún no está conectado. Escanea el QR del botón 📱.");
                return;
              }
              setStatus("waiting");
              notify("La sala aún no tiene anfitrión. Reintentando…");
              window.setTimeout(() => {
                if (!cancelled && !remoteStreamRef.current) {
                  const call = guest.call(hostId, outStreamRef.current!, sdpOpts);
                  wireCall(call);
                }
              }, 4000);
            } else {
              setStatus("error");
            }
          });
        };

        const host = new Peer(hostId);
        peerRef.current = host;
        host.on("open", () => setStatus("waiting"));
        host.on("call", (call) => {
          call.answer(outStreamRef.current!, sdpOpts);
          wireCall(call);
        });
        host.on("error", (err: any) => {
          if (err.type === "unavailable-id") {
            // Room already has a host — join as guest
            host.destroy();
            startAsGuest();
          } else if (err.type === "peer-unavailable") {
            if (String(err.message).includes("-cam")) {
              notify("El celular aún no está conectado. Escanea el QR del botón 📱.");
            }
          } else {
            setStatus("error");
          }
        });
      } catch {
        setStatus("error");
        notify("No se pudo acceder a cámara/micrófono. Revisa permisos.");
      }
    }

    void setup();

    return () => {
      cancelled = true;
      callRef.current?.close();
      peerRef.current?.destroy();
      chainRef.current?.close();
      rawAudioRef.current?.getTracks().forEach((t) => t.stop());
      cameraTrackRef.current?.stop();
      screenTrackRef.current?.stop();
      metroRef.current?.stop();
      if (dualRef.current) cancelAnimationFrame(dualRef.current.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Attach remote stream to its <video>
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Restore PiP position
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PIP_KEY);
      if (saved) setPipPos(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  // ------------------------------------------------------------- controls

  const toggleMic = useCallback(() => {
    const track = chainRef.current?.outputStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const track = cameraTrackRef.current;
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  const changeBoost = useCallback((v: number) => {
    setBoost(v);
    chainRef.current?.setBoost(v);
  }, []);

  const toggleEnhance = useCallback(() => {
    setEnhance((prev) => {
      chainRef.current?.setEnhanceEnabled(!prev);
      return !prev;
    });
  }, []);

  /** Re-acquire mic with/without echo cancellation and rebuild the chain. */
  const toggleEchoCancel = useCallback(async () => {
    const next = !echoCancel;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...RAW_AUDIO_CONSTRAINTS, echoCancellation: next },
      });
      rawAudioRef.current?.getTracks().forEach((t) => t.stop());
      rawAudioRef.current = stream;

      const oldChain = chainRef.current;
      const chain = createInstrumentChain(stream);
      chain.setBoost(boost);
      chain.setEnhanceEnabled(enhance);
      chainRef.current = chain;
      oldChain?.close();

      const newTrack = chain.outputStream.getAudioTracks()[0];
      newTrack.enabled = micOn;
      replaceSenderTrack("audio", newTrack);
      setEchoCancel(next);

      // The metronome was wired to the old chain — reset it
      if (metroRef.current) {
        metroRef.current.stop();
        metroRef.current = null;
        setMetroOn(false);
      }
      notify(
        next
          ? "Cancelación de eco activada (para hablar sin audífonos)"
          : "Cancelación de eco desactivada (máxima fidelidad)"
      );
    } catch {
      notify("No se pudo cambiar el modo de micrófono");
    }
  }, [echoCancel, boost, enhance, micOn, replaceSenderTrack, notify]);

  /** Tears down the dual-view canvas compositor (face + hands). */
  const stopDualComposite = useCallback(() => {
    const d = dualRef.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    d.faceEl.srcObject = null;
    d.phoneEl.srcObject = null;
    dualRef.current = null;
    setDualActive(false);
  }, []);

  const stopScreenShare = useCallback(() => {
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    setSharing(false);
    const cam = cameraTrackRef.current;
    if (cam) {
      replaceSenderTrack("video", cam);
      setLocalPreview(cam);
    }
  }, [replaceSenderTrack, setLocalPreview]);

  const toggleScreenShare = useCallback(async () => {
    if (screenTrackRef.current) {
      stopScreenShare();
      return;
    }
    stopDualComposite();
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = display.getVideoTracks()[0];
      screenTrackRef.current = track;
      track.onended = () => stopScreenShare();
      replaceSenderTrack("video", track);
      setLocalPreview(track);
      setSharing(true);
      notify("Compartiendo pantalla (⌘⌥3 para detener)");
    } catch {
      /* user cancelled the picker */
    }
  }, [replaceSenderTrack, setLocalPreview, stopScreenShare, stopDualComposite, notify]);

  /** Calls the phone (registered as `<room>-cam`) and waits for its stream. */
  const connectPhoneCam = useCallback((): Promise<MediaStream | null> => {
    if (phoneStreamRef.current) return Promise.resolve(phoneStreamRef.current);
    const peer = peerRef.current;
    if (!peer || !outStreamRef.current) return Promise.resolve(null);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (s: MediaStream | null) => {
        if (!settled) {
          settled = true;
          resolve(s);
        }
      };
      const call = peer.call(camPeerId, outStreamRef.current!);
      if (!call) {
        finish(null);
        return;
      }
      const timer = window.setTimeout(() => finish(null), 8000);
      call.on("stream", (stream) => {
        window.clearTimeout(timer);
        phoneStreamRef.current = stream;
        finish(stream);
      });
      call.on("close", () => {
        phoneStreamRef.current = null;
        setUsingPhone(false);
        notify("El celular se desconectó");
      });
      call.on("error", () => {
        window.clearTimeout(timer);
        finish(null);
      });
    });
  }, [camPeerId, notify]);

  const switchCamera = useCallback(
    async (index: number) => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        if (!cams[index]) {
          notify(
            index === 0 ? "No se encontró cámara" : "No hay segunda cámara conectada"
          );
          return;
        }
        if (screenTrackRef.current) stopScreenShare();
        stopDualComposite();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: cams[index].deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        const newTrack = stream.getVideoTracks()[0];
        cameraTrackRef.current?.stop();
        cameraTrackRef.current = newTrack;
        newTrack.enabled = camOn;
        replaceSenderTrack("video", newTrack);
        setLocalPreview(newTrack);
        setUsingPhone(false);
        notify(index === 0 ? "Cámara principal activada" : "Segunda cámara activada");
      } catch {
        notify("No se pudo cambiar de cámara");
      }
    },
    [camOn, replaceSenderTrack, setLocalPreview, stopScreenShare, stopDualComposite, notify]
  );

  /**
   * ⌘⌥2 — second camera: prefers the Android phone (WiFi); falls back to a
   * second local webcam; otherwise opens the QR overlay to connect the phone.
   */
  const selectSecondCamera = useCallback(async () => {
    if (screenTrackRef.current) stopScreenShare();
    stopDualComposite();

    const phone = await connectPhoneCam();
    if (phone) {
      const track = phone.getVideoTracks()[0];
      if (track) {
        replaceSenderTrack("video", track);
        setLocalPreview(track);
        setUsingPhone(true);
        setShowPhoneQR(false);
        notify("📱 Cámara del celular activada (⌘⌥1 para volver)");
        return;
      }
    }

    // No phone — try a second local webcam
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    if (cams.length > 1) {
      await switchCamera(1);
      return;
    }

    setShowPhoneQR(true);
    notify("Conecta tu celular escaneando el código QR");
  }, [
    connectPhoneCam,
    replaceSenderTrack,
    setLocalPreview,
    stopScreenShare,
    stopDualComposite,
    switchCamera,
    notify,
  ]);

  /**
   * ⌘⌥4 — dual view: face cam + phone cam composited side by side on a
   * canvas, sent as a single video track. The student sees your face AND
   * your hands on the instrument at the same time.
   */
  const toggleDualView = useCallback(async () => {
    if (dualRef.current) {
      stopDualComposite();
      const cam = cameraTrackRef.current;
      if (cam) {
        replaceSenderTrack("video", cam);
        setLocalPreview(cam);
      }
      notify("Vista dual desactivada");
      return;
    }
    if (screenTrackRef.current) stopScreenShare();

    const phone = await connectPhoneCam();
    if (!phone || phone.getVideoTracks().length === 0) {
      setShowPhoneQR(true);
      notify("Para la vista dual, conecta primero tu celular (código QR)");
      return;
    }
    const cam = cameraTrackRef.current;
    if (!cam) {
      notify("No hay cámara principal disponible");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const c2d = canvas.getContext("2d")!;

    const makeVideo = (stream: MediaStream) => {
      const el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.srcObject = stream;
      return el;
    };
    const faceEl = makeVideo(new MediaStream([cam]));
    const phoneEl = makeVideo(phone);
    await Promise.all([faceEl.play(), phoneEl.play()]).catch(() => undefined);

    const draw = () => {
      c2d.fillStyle = "#000";
      c2d.fillRect(0, 0, 1280, 720);
      if (faceEl.readyState >= 2) drawCover(c2d, faceEl, 0, 0, 638, 720);
      if (phoneEl.readyState >= 2) drawCover(c2d, phoneEl, 642, 0, 638, 720);
      if (dualRef.current) dualRef.current.raf = requestAnimationFrame(draw);
    };
    dualRef.current = { raf: 0, faceEl, phoneEl };
    draw();

    const track = canvas.captureStream(30).getVideoTracks()[0];
    replaceSenderTrack("video", track);
    setLocalPreview(track);
    setDualActive(true);
    setUsingPhone(false);
    notify("👥 Vista dual: cara + manos (⌘⌥4 para volver)");
  }, [
    connectPhoneCam,
    replaceSenderTrack,
    setLocalPreview,
    stopScreenShare,
    stopDualComposite,
    notify,
  ]);

  // ----------------------------------------------------------- metronome

  const toggleMetronome = useCallback(() => {
    const chain = chainRef.current;
    if (!chain) return;
    if (!metroRef.current) {
      // Heard locally AND injected into the outgoing audio: both sides
      // share the same beat, traveling with the instrument's own latency.
      metroRef.current = new Metronome(chain.ctx, [
        chain.ctx.destination,
        chain.destinationNode,
      ]);
    }
    if (metroRef.current.running) {
      metroRef.current.stop();
      setMetroOn(false);
    } else {
      void chain.ctx.resume();
      metroRef.current.start(bpm);
      setMetroOn(true);
      notify(`♩ Metrónomo compartido a ${bpm} BPM — ambos lo escuchan`);
    }
  }, [bpm, notify]);

  const changeTempo = useCallback((v: number) => {
    setBpm(v);
    metroRef.current?.setBpm(v);
  }, []);

  // Generate the QR for the phone-camera link when the overlay opens
  useEffect(() => {
    if (!showPhoneQR) return;
    const link = `${window.location.origin}/cam/${encodeURIComponent(roomId)}`;
    import("qrcode")
      .then((QR) => QR.toDataURL(link, { width: 220, margin: 1 }))
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [showPhoneQR, roomId]);

  // ------------------------------------------------------------ recording

  const pipCorner = useCallback((): "tl" | "tr" | "bl" | "br" => {
    const c = containerRef.current;
    if (!c || !pipPos) return "br";
    const midX = (c.clientWidth - PIP_W) / 2;
    const midY = (c.clientHeight - PIP_H) / 2;
    return `${pipPos.y < midY ? "t" : "b"}${pipPos.x < midX ? "l" : "r"}` as
      | "tl"
      | "tr"
      | "bl"
      | "br";
  }, [pipPos]);

  const startRecording = useCallback(() => {
    if (recorderRef.current.isRecording) return;
    recorderRef.current.start({
      localVideo: localVideoRef.current,
      remoteVideo: remoteVideoRef.current,
      localAudioStream: chainRef.current?.outputStream ?? null,
      remoteAudioStream: remoteStreamRef.current,
      getPipCorner: pipCorner,
    });
    recStartRef.current = Date.now();
    markersRef.current = [];
    setMarkerCount(0);
    setRecording(true);
    notify("Grabando… (⌘⌥M marca un momento clave · Pausa detiene y guarda)");
  }, [pipCorner, notify]);

  /** ⌘⌥M — flag a key moment (difficult passage, correction, etc.). */
  const addMarker = useCallback(() => {
    if (!recorderRef.current.isRecording) {
      notify("Los marcadores funcionan durante la grabación (⌘⌥R)");
      return;
    }
    const t = Math.round((Date.now() - recStartRef.current) / 1000);
    markersRef.current.push(t);
    setMarkerCount(markersRef.current.length);
    notify(`🚩 Momento ${markersRef.current.length} marcado en ${formatTime(t)}`);
  }, [notify]);

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current.isRecording) return;
    setRecording(false);
    try {
      const blob = await recorderRef.current.stop();
      const name = await saveRecording(blob);

      // Export the key-moments list alongside the video
      const markers = markersRef.current;
      if (markers.length > 0) {
        const lines = markers.map((t, i) => `${formatTime(t)} — Momento ${i + 1}`);
        const txt = new Blob(
          [`Momentos clave de la clase (${name})\n\n${lines.join("\n")}\n`],
          { type: "text/plain;charset=utf-8" }
        );
        const url = URL.createObjectURL(txt);
        const a = document.createElement("a");
        a.href = url;
        a.download = name.replace(/\.webm$/i, "") + "_momentos.txt";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        notify(`Grabación guardada con ${markers.length} momento(s) clave 🚩`);
      } else {
        notify(`Grabación guardada: ${name}`);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") notify("Guardado cancelado");
      else notify("La grabación no pudo guardarse");
    }
  }, [notify]);

  // ------------------------------------------------------------ shortcuts

  const actionsRef = useRef({
    switchCamera,
    selectSecondCamera,
    toggleScreenShare,
    toggleDualView,
    startRecording,
    stopRecording,
    addMarker,
  });
  actionsRef.current = {
    switchCamera,
    selectSecondCamera,
    toggleScreenShare,
    toggleDualView,
    startRecording,
    stopRecording,
    addMarker,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actionsRef.current;
      if (e.code === "Pause") {
        e.preventDefault();
        void a.stopRecording();
        return;
      }
      const combo = (e.metaKey || e.ctrlKey) && e.altKey;
      if (!combo) return;
      switch (e.code) {
        case "Digit1":
          e.preventDefault();
          void a.switchCamera(0);
          break;
        case "Digit2":
          e.preventDefault();
          void a.selectSecondCamera();
          break;
        case "Digit3":
          e.preventDefault();
          void a.toggleScreenShare();
          break;
        case "Digit4":
          e.preventDefault();
          void a.toggleDualView();
          break;
        case "KeyR":
          e.preventDefault();
          a.startRecording();
          break;
        case "KeyM":
          e.preventDefault();
          a.addMarker();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------------------------- PiP drag

  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPipPointerDown = (e: React.PointerEvent) => {
    const pip = pipRef.current;
    if (!pip) return;
    pip.setPointerCapture(e.pointerId);
    const rect = pip.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  };

  const onPipPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const c = containerRef.current;
    if (!drag || !c) return;
    const bounds = c.getBoundingClientRect();
    const x = Math.min(
      Math.max(e.clientX - bounds.left - drag.dx, 8),
      bounds.width - PIP_W - 8
    );
    const y = Math.min(
      Math.max(e.clientY - bounds.top - drag.dy, 8),
      bounds.height - PIP_H - 8
    );
    setPipPos({ x, y });
  };

  const onPipPointerUp = () => {
    if (dragRef.current && pipPos) {
      try {
        localStorage.setItem(PIP_KEY, JSON.stringify(pipPos));
      } catch {
        /* ignore */
      }
    }
    dragRef.current = null;
  };

  // --------------------------------------------------------------- leave

  const hangUp = () => {
    void (recorderRef.current.isRecording && stopRecording());
    callRef.current?.close();
    peerRef.current?.destroy();
    router.push("/");
  };

  const copyLink = async () => {
    const message = `🎵 ¡Hola! Te invito a tu clase de música. Entra aquí: ${window.location.href}`;
    try {
      await navigator.clipboard.writeText(message);
      notify("Invitación copiada — pégala en WhatsApp o correo");
    } catch {
      notify(`Código de sala: ${roomId}`);
    }
  };

  const statusLabel: Record<Status, string> = {
    init: "Preparando cámara y micrófono…",
    waiting: "Esperando al otro participante…",
    connecting: "Conectando…",
    connected: "En clase",
    ended: "Llamada finalizada",
    error: "Error de conexión",
  };

  const pipStyle: React.CSSProperties = pipPos
    ? { left: pipPos.x, top: pipPos.y }
    : { right: 16, bottom: 96 };

  // ------------------------------------------------------------------ UI

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-stage">
      {/* Remote (main) video */}
      {remoteStream ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-gray-500">
          <div className="text-6xl">🎵</div>
          <p>{statusLabel[status]}</p>
          {status === "waiting" && (
            <button
              onClick={copyLink}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110"
            >
              ✉️ Invitar estudiante (copiar enlace)
            </button>
          )}
        </div>
      )}

      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="font-semibold">
            Musi<span className="text-accent">Cam</span>
          </span>
          <button
            onClick={copyLink}
            title="Copiar enlace de invitación"
            className="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
          >
            ✉️ Invitar · <span className="font-mono">{roomId}</span>
          </button>
          <span className="text-xs text-gray-400">{statusLabel[status]}</span>
        </div>
        <div className="flex items-center gap-3">
          {recording && (
            <span className="rec-pulse flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold">
              ● REC{markerCount > 0 ? ` · 🚩${markerCount}` : ""}
            </span>
          )}
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
            title="Atajos de teclado"
          >
            ?
          </button>
        </div>
      </div>

      {/* Draggable self-view (PiP) */}
      <div
        ref={pipRef}
        onPointerDown={onPipPointerDown}
        onPointerMove={onPipPointerMove}
        onPointerUp={onPipPointerUp}
        style={{ ...pipStyle, width: PIP_W, height: PIP_H }}
        className="absolute z-20 cursor-grab touch-none select-none overflow-hidden rounded-xl border-2 border-accent/70 shadow-xl active:cursor-grabbing"
        title="Arrástrame para moverme"
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {!camOn && !sharing && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel text-xs text-gray-400">
            Cámara apagada
          </div>
        )}
        <span className="absolute bottom-1 left-2 text-[10px] text-white/80 drop-shadow">
          Tú
          {sharing
            ? " · pantalla"
            : dualActive
              ? " · vista dual"
              : usingPhone
                ? " · celular"
                : ""}
        </span>
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div className="absolute right-4 top-12 z-30 w-80 rounded-xl border border-gray-700 bg-panel/95 p-4 text-xs leading-relaxed shadow-2xl">
          <p className="mb-2 font-semibold text-gray-200">Atajos de teclado</p>
          <ul className="space-y-1 text-gray-300">
            <li>⌘/Ctrl + ⌥/Alt + 1 — Cámara principal</li>
            <li>⌘/Ctrl + ⌥/Alt + 2 — Cámara del celular 📱</li>
            <li>⌘/Ctrl + ⌥/Alt + 3 — Compartir pantalla</li>
            <li>⌘/Ctrl + ⌥/Alt + 4 — Vista dual: cara + manos 👥</li>
            <li>⌘/Ctrl + ⌥/Alt + R — Iniciar grabación</li>
            <li>⌘/Ctrl + ⌥/Alt + M — Marcar momento clave 🚩</li>
            <li>Pausa — Detener grabación y guardar</li>
          </ul>
          <p className="mt-3 text-gray-400">
            ♩ El metrónomo lo escuchan ambos, sincronizado con tu instrumento.
          </p>
          <p className="mt-3 text-gray-500">
            El audio se transmite sin supresión de ruido (Opus estéreo 256
            kbps). Usa audífonos para evitar eco.
          </p>
        </div>
      )}

      {/* Phone-camera QR overlay */}
      {showPhoneQR && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70"
          onClick={() => setShowPhoneQR(false)}
        >
          <div
            className="w-[22rem] max-w-[90vw] rounded-2xl border border-gray-700 bg-panel p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-semibold">📱 Tu celular como cámara</p>
            <ol className="mt-3 space-y-1.5 text-left text-xs leading-relaxed text-gray-300">
              <li>1. Conecta el celular a la misma red WiFi.</li>
              <li>2. Escanea este código con la cámara del celular y abre el enlace.</li>
              <li>3. Apunta el celular a tus manos / instrumento.</li>
              <li>
                4. Presiona <b>⌘⌥2</b> (Ctrl+Alt+2) para cambiar a esa cámara, y{" "}
                <b>⌘⌥1</b> para volver.
              </li>
            </ol>
            <div className="mt-4 flex justify-center">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="Código QR para conectar el celular"
                  className="rounded-lg bg-white p-2"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-lg bg-white/10 text-xs text-gray-400">
                  Generando código…
                </div>
              )}
            </div>
            <button
              onClick={async () => {
                const link = `${window.location.origin}/cam/${encodeURIComponent(roomId)}`;
                try {
                  await navigator.clipboard.writeText(link);
                  notify("Enlace copiado — ábrelo en el navegador del celular");
                } catch {
                  /* clipboard blocked */
                }
              }}
              className="mt-4 w-full rounded-lg border border-gray-600 px-4 py-2 text-xs hover:border-accent hover:text-accent"
            >
              Copiar enlace para el celular
            </button>
            <button
              onClick={() => setShowPhoneQR(false)}
              className="mt-2 w-full rounded-lg bg-white/10 px-4 py-2 text-xs hover:bg-white/20"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Bottom control bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
        <ControlButton onClick={toggleMic} active={micOn} label={micOn ? "🎙️" : "🔇"} title="Micrófono" />
        <ControlButton onClick={toggleCam} active={camOn} label={camOn ? "📷" : "🚫"} title="Cámara" />
        <ControlButton
          onClick={() => void toggleScreenShare()}
          active={!sharing}
          highlight={sharing}
          label="🖥️"
          title="Compartir pantalla (⌘⌥3)"
        />
        <ControlButton
          onClick={() =>
            usingPhone ? void switchCamera(0) : setShowPhoneQR((v) => !v)
          }
          active={!usingPhone}
          highlight={usingPhone}
          label="📱"
          title={
            usingPhone
              ? "Volver a la cámara principal (⌘⌥1)"
              : "Conectar celular como cámara (⌘⌥2)"
          }
        />
        <ControlButton
          onClick={() => void toggleDualView()}
          active={!dualActive}
          highlight={dualActive}
          label="👥"
          title="Vista dual: cara + manos (⌘⌥4)"
        />
        <ControlButton
          onClick={() => (recording ? void stopRecording() : startRecording())}
          active={!recording}
          highlight={recording}
          label={recording ? "⏹" : "⏺"}
          title="Grabar (⌘⌥R) / Detener (Pausa)"
        />
        {recording && (
          <ControlButton
            onClick={addMarker}
            active={true}
            label="🚩"
            title="Marcar momento clave (⌘⌥M)"
          />
        )}

        {/* Shared metronome */}
        <div
          className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs"
          title="Metrónomo compartido: lo escuchan ambos, sincronizado con tu audio"
        >
          <button
            onClick={toggleMetronome}
            className={`font-semibold ${metroOn ? "text-accent" : ""}`}
          >
            {metroOn ? "⏸" : "▶"} ♩
          </button>
          <input
            type="range"
            min={40}
            max={208}
            step={1}
            value={bpm}
            onChange={(e) => changeTempo(Number(e.target.value))}
            className="w-20 accent-[#e8b339]"
          />
          <span className="w-7 text-right tabular-nums">{bpm}</span>
        </div>

        {/* Instrument audio panel */}
        <div className="flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={enhance} onChange={toggleEnhance} className="accent-[#e8b339]" />
            Modo instrumento
          </label>
          <label className="flex items-center gap-1.5" title="Potencia del instrumento">
            🎚
            <input
              type="range"
              min={1}
              max={4}
              step={0.1}
              value={boost}
              onChange={(e) => changeBoost(Number(e.target.value))}
              className="w-24 accent-[#e8b339]"
            />
            {boost.toFixed(1)}x
          </label>
          <label
            className="flex cursor-pointer items-center gap-1.5 border-l border-white/20 pl-3"
            title="Actívalo solo si no usas audífonos"
          >
            <input type="checkbox" checked={echoCancel} onChange={() => void toggleEchoCancel()} className="accent-[#e8b339]" />
            Anti-eco
          </label>
        </div>

        <button
          onClick={hangUp}
          title="Salir de la clase"
          className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold hover:bg-red-500"
        >
          Salir
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ControlButton({
  onClick,
  active,
  highlight,
  label,
  title,
}: {
  onClick: () => void;
  active: boolean;
  highlight?: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition ${
        highlight
          ? "bg-red-600 hover:bg-red-500"
          : active
            ? "bg-white/15 hover:bg-white/25"
            : "bg-red-600/80 hover:bg-red-500"
      }`}
    >
      {label}
    </button>
  );
}
