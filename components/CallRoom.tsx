"use client";

// MusiCam call room
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Peer, { MediaConnection, DataConnection } from "peerjs";
import { createPeer, sanitizePeerId } from "@/lib/peerConfig";
import {
  clearPairedDevice,
  createDeviceId,
  devCamPeerId,
  getPairedDevice,
  setPairedDevice,
  type PairedDevice,
} from "@/lib/pairing";
import {
  buildAudioConstraints,
  createInstrumentChain,
  hifiOpusSdp,
  type ChannelMode,
  type InstrumentChain,
} from "@/lib/audio";
import CameraMenu, { type DualSourceKind } from "@/components/CameraMenu";
import { CallRecorder, drawCover, saveRecording } from "@/lib/recorder";
import { Metronome } from "@/lib/metronome";
import TunerPanel from "@/components/TunerPanel";
import MetronomePanel from "@/components/MetronomePanel";
import AudioSettingsPanel from "@/components/AudioSettingsPanel";
import ChordOverlay, { DEFAULT_CHORD_BOX, type ChordBox } from "@/components/ChordOverlay";
import ChatPanel, { type ChatMessage } from "@/components/ChatPanel";
import {
  ChatIcon,
  ChordIcon,
  DualIcon,
  FlagIcon,
  ForkIcon,
  HelpIcon,
  MetronomeIcon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  RecordIcon,
  ScreenIcon,
  SendIcon,
  SlidersIcon,
  StopIcon,
  VideoIcon,
  VideoOffIcon,
} from "@/components/icons";

type Status = "init" | "waiting" | "connecting" | "connected" | "ended" | "error";

const PIP_KEY = "musicam-pip-pos";
const PIP_SIZE_KEY = "musicam-pip-size";
const CHORD_KEY = "musicam-chord-style";
const PIP_W = 224;
const PIP_H = 126;
const PIP_MIN_W = 140;
const PIP_ASPECT = PIP_W / PIP_H; // keep 16:9-ish on resize

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CallRoom({
  roomId,
  displayName = "Invitado",
}: {
  roomId: string;
  displayName?: string;
}) {
  const router = useRouter();

  // Stable peer IDs for this session
  const baseId = `musicam-${sanitizePeerId(roomId)}`;
  const camPeerId = `${baseId}-cam`;
  // A permanently paired phone (if any) is dialed alongside the per-room cam.
  const pairedRef = useRef<string | null>(null);

  // --- refs (mutable call machinery) ---
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const chainRef = useRef<InstrumentChain | null>(null);
  const rawAudioRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const outStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const phoneStreamRef = useRef<MediaStream | null>(null);
  const phoneCallRef = useRef<MediaConnection | null>(null);
  const recorderRef = useRef<CallRecorder>(new CallRecorder());
  const metroRef = useRef<Metronome | null>(null);
  const dualRef = useRef<{
    raf: number;
    faceEl: HTMLVideoElement;
    srcBEl: HTMLVideoElement;
    /** Extra local track (device webcam / screen) to stop when leaving dual. */
    stopTrack: MediaStreamTrack | null;
  } | null>(null);
  const recStartRef = useRef(0);
  const markersRef = useRef<number[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const showChatRef = useRef(false);
  const usingPhoneRef = useRef(false);

  // --- state ---
  const [status, setStatus] = useState<Status>("init");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localRawStream, setLocalRawStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [boost, setBoost] = useState(1.4);
  const [enhance, setEnhance] = useState(true);
  const [echoCancel, setEchoCancel] = useState(false);
  const [channel, setChannel] = useState<ChannelMode>("stereo");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string | null>(null);
  const [currentCamId, setCurrentCamId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const [pipSize, setPipSize] = useState<{ w: number; h: number }>({ w: PIP_W, h: PIP_H });
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTuner, setShowTuner] = useState(false);
  const [showMetro, setShowMetro] = useState(false);
  const [usingPhone, setUsingPhone] = useState(false);
  const [phoneConnecting, setPhoneConnecting] = useState(false);
  const [showPhoneQR, setShowPhoneQR] = useState(false);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Permanent phone pairing (URL fija).
  const [paired, setPaired] = useState<PairedDevice | null>(null);
  const [deviceQrDataUrl, setDeviceQrDataUrl] = useState<string | null>(null);
  const [showPairing, setShowPairing] = useState(false);
  // Second source for the generalized dual view (persisted across classes).
  const [dualSourceB, setDualSourceB] = useState<DualSourceKind>("phone");
  const [metroOn, setMetroOn] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [beat, setBeat] = useState(-1);
  const [dualActive, setDualActive] = useState(false);
  const [markerCount, setMarkerCount] = useState(0);
  const [isMac, setIsMac] = useState(false);
  // Data-channel features (shared between teacher and student)
  const [isHost, setIsHost] = useState(false);
  const [dataConnected, setDataConnected] = useState(false);
  const [chordBox, setChordBox] = useState<ChordBox>(DEFAULT_CHORD_BOX);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);

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

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(list.filter((d) => d.kind === "audioinput"));
      setVideoDevices(list.filter((d) => d.kind === "videoinput"));
    } catch {
      /* ignore */
    }
  }, []);

  // Guest re-dials the host on a dropped connection; set by setup().
  const redialHostRef = useRef<(() => void) | null>(null);

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

      // Recover from a flaky network: warn on a blip, and if it fully fails the
      // guest re-dials the host (the host just waits for the redial).
      const pc = call.peerConnection;
      if (pc) {
        pc.addEventListener("connectionstatechange", () => {
          if (pc.connectionState === "disconnected") {
            notify("Conexión inestable… reintentando");
          } else if (pc.connectionState === "failed") {
            if (remoteStreamRef.current) return;
            setStatus("waiting");
            redialHostRef.current?.();
          }
        });
      }
    },
    [notify]
  );

  // --------------------------------------------------------- data channel

  /** Send a JSON message to the other participant (chords / chat). */
  const sendData = useCallback((obj: unknown) => {
    const conn = dataConnRef.current;
    if (conn && conn.open) conn.send(obj);
  }, []);

  /** Wire a data connection: dispatch chord-box and chat messages. */
  const wireData = useCallback((conn: DataConnection) => {
    dataConnRef.current = conn;
    const markOpen = () => setDataConnected(true);
    if (conn.open) markOpen();
    conn.on("open", markOpen);
    conn.on("data", (raw) => {
      const msg = raw as {
        type?: string;
        box?: ChordBox;
        from?: string;
        text?: string;
      };
      if (msg?.type === "chord" && msg.box) {
        setChordBox(msg.box);
      } else if (msg?.type === "chat" && typeof msg.text === "string") {
        setChatMessages((prev) => [
          ...prev,
          { from: msg.from || "Estudiante", text: msg.text!, ts: Date.now(), mine: false },
        ]);
        if (!showChatRef.current) setUnread((n) => n + 1);
      }
    });
    conn.on("close", () => {
      dataConnRef.current = null;
      setDataConnected(false);
    });
    conn.on("error", () => {
      /* ignore — media call stays up */
    });
  }, []);

  // ---------------------------------------------------------- media + peer

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: buildAudioConstraints({ echoCancel: false }),
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }

        rawAudioRef.current = new MediaStream(media.getAudioTracks());
        setLocalRawStream(rawAudioRef.current);
        cameraTrackRef.current = media.getVideoTracks()[0] ?? null;
        setMicId(media.getAudioTracks()[0]?.getSettings().deviceId ?? null);
        setCurrentCamId(media.getVideoTracks()[0]?.getSettings().deviceId ?? null);
        void refreshDevices();

        const chain = createInstrumentChain(rawAudioRef.current, "stereo");
        chainRef.current = chain;

        const outTracks: MediaStreamTrack[] = [];
        if (cameraTrackRef.current) outTracks.push(cameraTrackRef.current);
        outTracks.push(...chain.outputStream.getAudioTracks());
        outStreamRef.current = new MediaStream(outTracks);

        if (cameraTrackRef.current) setLocalPreview(cameraTrackRef.current);

        // --- PeerJS: first to claim the room id is host; otherwise guest ---
        const hostId = baseId;
        const sdpOpts = { sdpTransform: hifiOpusSdp };

        // A phone-cam target that vanished is background noise; only surface it
        // when *every* phone target fails (matches both legacy and paired ids).
        const isCamId = (msg: string) =>
          msg.includes("-cam") || msg.includes("musicam-dev-");

        const startAsGuest = async () => {
          setIsHost(false);
          const guest = await createPeer();
          if (cancelled) {
            guest.destroy();
            return;
          }
          peerRef.current = guest;

          // Redial + re-open the data channel (chat/chords die otherwise if the
          // student arrives first). Retried on a loop until the host answers.
          const dialHost = () => {
            if (cancelled || remoteStreamRef.current) return;
            const call = guest.call(hostId, outStreamRef.current!, sdpOpts);
            wireCall(call);
            if (!dataConnRef.current?.open) {
              wireData(guest.connect(hostId, { reliable: true }));
            }
          };
          redialHostRef.current = dialHost;

          guest.on("open", () => {
            dialHost();
            // Keep retrying every 4s (~15 tries) until the host is present.
            let tries = 0;
            const loop = window.setInterval(() => {
              if (cancelled || remoteStreamRef.current || tries++ > 15) {
                window.clearInterval(loop);
                return;
              }
              dialHost();
            }, 4000);
          });
          guest.on("disconnected", () => {
            if (!cancelled) {
              try {
                guest.reconnect();
              } catch {
                /* ignore */
              }
            }
          });
          guest.on("error", (err: any) => {
            if (err.type === "peer-unavailable") {
              if (isCamId(String(err.message))) return; // phone dial handles its own copy
              setStatus("waiting");
            } else if (err.type !== "network" && err.type !== "disconnected") {
              setStatus("error");
            }
          });
        };

        const host = await createPeer(hostId);
        if (cancelled) {
          host.destroy();
          return;
        }
        peerRef.current = host;
        host.on("open", () => {
          setIsHost(true);
          setStatus("waiting");
        });
        host.on("call", (call) => {
          call.answer(outStreamRef.current!, sdpOpts);
          wireCall(call);
        });
        host.on("connection", (conn) => wireData(conn));
        host.on("disconnected", () => {
          if (!cancelled) {
            try {
              host.reconnect();
            } catch {
              /* ignore */
            }
          }
        });
        host.on("error", (err: any) => {
          if (err.type === "unavailable-id") {
            // Room already has a host — join as guest
            host.destroy();
            void startAsGuest();
          } else if (err.type === "peer-unavailable") {
            if (isCamId(String(err.message))) return;
          } else if (err.type !== "network" && err.type !== "disconnected") {
            setStatus("error");
          }
        });
      } catch {
        setStatus("error");
        notify("No se pudo acceder a cámara/micrófono. Revisa permisos.");
      }
    }

    pairedRef.current = getPairedDevice()?.id ?? null;
    void setup();
    navigator.mediaDevices.addEventListener?.("devicechange", refreshDevices);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", refreshDevices);
      dataConnRef.current?.close();
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

  // Restore PiP position + size
  useEffect(() => {
    try {
      const savedPos = localStorage.getItem(PIP_KEY);
      if (savedPos) setPipPos(JSON.parse(savedPos));
      const savedSize = localStorage.getItem(PIP_SIZE_KEY);
      if (savedSize) setPipSize(JSON.parse(savedSize));
      const savedChord = localStorage.getItem(CHORD_KEY);
      if (savedChord) setChordBox((b) => ({ ...b, ...JSON.parse(savedChord) }));
      const savedDual = localStorage.getItem("musicam-dual-source");
      if (savedDual) {
        const parsed = JSON.parse(savedDual);
        if (parsed === "phone" || parsed === "screen" || parsed?.deviceId) {
          setDualSourceB(parsed);
        }
      }
      setPaired(getPairedDevice());
    } catch {
      /* ignore */
    }
  }, []);

  // Keep a ref of the chat-panel state for the (stable) data handler
  useEffect(() => {
    showChatRef.current = showChat;
  }, [showChat]);

  // Mirror `usingPhone` into a ref for event handlers (ICE fallback, etc.)
  useEffect(() => {
    usingPhoneRef.current = usingPhone;
  }, [usingPhone]);

  // Platform detection for shortcut labels (⌘⌥ on Mac, Ctrl+Alt elsewhere)
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
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

  /**
   * Re-acquires the mic and rebuilds the processing chain. Used when the
   * input device, the channel mode or echo cancellation changes.
   */
  const rebuildAudio = useCallback(
    async (opts: {
      deviceId?: string | null;
      echo?: boolean;
      channel?: ChannelMode;
    }) => {
      const nextDevice = opts.deviceId !== undefined ? opts.deviceId : micId;
      const nextEcho = opts.echo ?? echoCancel;
      const nextChannel = opts.channel ?? channel;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints({ deviceId: nextDevice, echoCancel: nextEcho }),
        });
        rawAudioRef.current?.getTracks().forEach((t) => t.stop());
        rawAudioRef.current = stream;
        setLocalRawStream(stream);

        const oldChain = chainRef.current;
        const chain = createInstrumentChain(stream, nextChannel);
        chain.setBoost(boost);
        chain.setEnhanceEnabled(enhance);
        chainRef.current = chain;
        oldChain?.close();

        const newTrack = chain.outputStream.getAudioTracks()[0];
        newTrack.enabled = micOn;
        replaceSenderTrack("audio", newTrack);

        // The metronome was wired to the old chain — reset it
        if (metroRef.current) {
          metroRef.current.stop();
          metroRef.current = null;
          setMetroOn(false);
          setBeat(-1);
        }

        setMicId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? nextDevice ?? null);
        setEchoCancel(nextEcho);
        setChannel(nextChannel);
        return true;
      } catch {
        notify("No se pudo cambiar la entrada de audio");
        return false;
      }
    },
    [micId, echoCancel, channel, boost, enhance, micOn, replaceSenderTrack, notify]
  );

  const selectMicDevice = useCallback(
    async (id: string) => {
      if (await rebuildAudio({ deviceId: id })) notify("Entrada de audio cambiada");
    },
    [rebuildAudio, notify]
  );

  const selectChannel = useCallback(
    async (c: ChannelMode) => {
      if (await rebuildAudio({ channel: c })) {
        notify(
          c === "stereo"
            ? "Canal: estéreo"
            : `Canal: solo ${c === "left" ? "izquierdo" : "derecho"}`
        );
      }
    },
    [rebuildAudio, notify]
  );

  const toggleEchoCancel = useCallback(async () => {
    const next = !echoCancel;
    if (await rebuildAudio({ echo: next })) {
      notify(
        next
          ? "Anti-eco activado (para hablar sin audífonos)"
          : "Anti-eco desactivado (máxima fidelidad)"
      );
    }
  }, [echoCancel, rebuildAudio, notify]);

  /** Tears down the dual-view canvas compositor (face + hands). */
  const stopDualComposite = useCallback(() => {
    const d = dualRef.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    d.faceEl.srcObject = null;
    d.srcBEl.srcObject = null;
    // Release the extra local source (device webcam / screen); the phone track
    // belongs to its own peer call and keeps running.
    d.stopTrack?.stop();
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
      notify("Compartiendo pantalla");
    } catch {
      /* user cancelled the picker */
    }
  }, [replaceSenderTrack, setLocalPreview, stopScreenShare, stopDualComposite, notify]);

  /** One dial attempt to a specific cam peer id; resolves the call+stream. */
  const callCamPeer = useCallback(
    (targetId: string, timeoutMs: number): Promise<{ call: MediaConnection; stream: MediaStream } | null> => {
      const peer = peerRef.current;
      if (!peer || !outStreamRef.current) return Promise.resolve(null);
      return new Promise((resolve) => {
        let settled = false;
        const finish = (v: { call: MediaConnection; stream: MediaStream } | null) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };
        const call = peer.call(targetId, outStreamRef.current!);
        if (!call) {
          finish(null);
          return;
        }
        const timer = window.setTimeout(() => {
          call.close();
          finish(null);
        }, timeoutMs);
        call.on("stream", (stream) => {
          window.clearTimeout(timer);
          finish({ call, stream });
        });
        call.on("error", () => {
          window.clearTimeout(timer);
          finish(null);
        });
      });
    },
    []
  );

  /**
   * Connects the phone camera. Dials the paired device (if any) and the
   * per-room cam in parallel — first stream wins, the loser is closed — with
   * up to 3 attempts of 6s each. On a mid-call ICE failure while the phone is
   * the active source, falls back to the local camera so the student never
   * sees a black frame.
   */
  const connectPhoneCam = useCallback(async (): Promise<MediaStream | null> => {
    if (phoneStreamRef.current) return phoneStreamRef.current;
    const peer = peerRef.current;
    if (!peer || !outStreamRef.current) return null;

    const targets = pairedRef.current
      ? [devCamPeerId(pairedRef.current), camPeerId]
      : [camPeerId];

    setPhoneConnecting(true);
    notify("Conectando con el celular…");
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const results = await Promise.all(targets.map((t) => callCamPeer(t, 6000)));
        const winnerIdx = results.findIndex((r) => r !== null);
        if (winnerIdx === -1) continue;

        const winner = results[winnerIdx]!;
        // Close the losing dials so we don't leave a second call half-open.
        results.forEach((r, i) => {
          if (r && i !== winnerIdx) r.call.close();
        });

        phoneCallRef.current = winner.call;
        phoneStreamRef.current = winner.stream;

        winner.call.on("close", () => {
          phoneStreamRef.current = null;
          phoneCallRef.current = null;
          setUsingPhone(false);
          notify("El celular se desconectó");
        });
        const pc = winner.call.peerConnection;
        if (pc) {
          pc.addEventListener("iceconnectionstatechange", () => {
            if (
              (pc.iceConnectionState === "failed" ||
                pc.iceConnectionState === "disconnected") &&
              usingPhoneRef.current
            ) {
              notify("Se perdió la cámara del celular — volviendo a la cámara del computador");
              void switchCamera();
            }
          });
        }
        return winner.stream;
      }
      return null;
    } finally {
      setPhoneConnecting(false);
    }
    // switchCamera is referenced before definition; it's stable via ref below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camPeerId, callCamPeer, notify]);

  /**
   * Switch the local camera. No argument = the browser's default camera; a
   * `deviceId` = that exact webcam. Tracks the active camera id so the menu can
   * mark it and the dual view can avoid picking the same device twice.
   */
  const switchCamera = useCallback(
    async (deviceId?: string) => {
      try {
        if (screenTrackRef.current) stopScreenShare();
        stopDualComposite();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
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
        setCurrentCamId(newTrack.getSettings().deviceId ?? deviceId ?? null);
        setUsingPhone(false);
        void refreshDevices();
        notify(deviceId ? "Cámara cambiada" : "Cámara principal activada");
      } catch {
        notify("No se pudo cambiar de cámara");
      }
    },
    [camOn, replaceSenderTrack, setLocalPreview, stopScreenShare, stopDualComposite, refreshDevices, notify]
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
        notify("Cámara del celular activada");
        return;
      }
    }

    // No phone — try a second local webcam (the one that isn't active now)
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const other = cams.find((c) => c.deviceId && c.deviceId !== currentCamId);
    if (cams.length > 1 && other) {
      await switchCamera(other.deviceId);
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
    currentCamId,
    notify,
  ]);

  /**
   * ⌘⌥4 — dual view: main cam + a second video source (phone, another webcam,
   * or the screen) composited side by side on a canvas, sent as one track.
   */
  const toggleDualView = useCallback(
    async (source?: DualSourceKind) => {
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

      const kind = source ?? dualSourceB;
      setDualSourceB(kind);
      try {
        localStorage.setItem("musicam-dual-source", JSON.stringify(kind));
      } catch {
        /* ignore */
      }

      const cam = cameraTrackRef.current;
      if (!cam) {
        notify("No hay cámara principal disponible");
        return;
      }

      // Acquire source B. `stopTrack` is the extra local track we must stop
      // when leaving dual (device webcam / screen); the phone track lives in
      // its own peer call and is left running.
      let sourceBStream: MediaStream | null = null;
      let stopTrack: MediaStreamTrack | null = null;
      if (kind === "phone") {
        sourceBStream = await connectPhoneCam();
        if (!sourceBStream || sourceBStream.getVideoTracks().length === 0) {
          setShowPhoneQR(true);
          notify("Para la vista dual, conecta primero tu celular (código QR)");
          return;
        }
      } else if (kind === "screen") {
        try {
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          sourceBStream = display;
          stopTrack = display.getVideoTracks()[0] ?? null;
        } catch {
          return; // user cancelled the picker
        }
      } else {
        // kind === "device": a second webcam by deviceId
        try {
          sourceBStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: kind.deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
          stopTrack = sourceBStream.getVideoTracks()[0] ?? null;
        } catch {
          notify("No se pudo abrir la segunda cámara");
          return;
        }
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
      const srcBEl = makeVideo(sourceBStream);
      await Promise.all([faceEl.play(), srcBEl.play()]).catch(() => undefined);

      const draw = () => {
        c2d.fillStyle = "#000";
        c2d.fillRect(0, 0, 1280, 720);
        if (faceEl.readyState >= 2) drawCover(c2d, faceEl, 0, 0, 638, 720);
        if (srcBEl.readyState >= 2) drawCover(c2d, srcBEl, 642, 0, 638, 720);
        if (dualRef.current) dualRef.current.raf = requestAnimationFrame(draw);
      };
      dualRef.current = { raf: 0, faceEl, srcBEl, stopTrack };
      draw();

      const track = canvas.captureStream(30).getVideoTracks()[0];
      replaceSenderTrack("video", track);
      setLocalPreview(track);
      setDualActive(true);
      setUsingPhone(false);
      notify("Vista dual: cara + segunda fuente");
    },
    [
      connectPhoneCam,
      dualSourceB,
      replaceSenderTrack,
      setLocalPreview,
      stopScreenShare,
      stopDualComposite,
      notify,
    ]
  );

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
      metroRef.current.onBeat = (b) => setBeat(b);
    }
    if (metroRef.current.running) {
      metroRef.current.stop();
      setMetroOn(false);
      setBeat(-1);
    } else {
      void chain.ctx.resume();
      metroRef.current.start(bpm);
      setMetroOn(true);
    }
  }, [bpm]);

  const changeTempo = useCallback((v: number) => {
    setBpm(v);
    metroRef.current?.setBpm(v);
  }, []);

  // ------------------------------------------------------ chords & chat

  /** Update the chord box and mirror it to the student. */
  const updateChordBox = useCallback(
    (box: ChordBox) => {
      setChordBox(box);
      sendData({ type: "chord", box });
      try {
        // Remember style/position (not the text) for the next class.
        const { color, fontSize, opacity, x, y, w, h } = box;
        localStorage.setItem(
          CHORD_KEY,
          JSON.stringify({ color, fontSize, opacity, x, y, w, h })
        );
      } catch {
        /* ignore */
      }
    },
    [sendData]
  );

  const toggleChords = useCallback(() => {
    if (!isHost) return; // only the teacher edits the chord box
    updateChordBox({ ...chordBox, visible: !chordBox.visible });
  }, [isHost, chordBox, updateChordBox]);

  const sendChat = useCallback(
    (text: string) => {
      setChatMessages((prev) => [
        ...prev,
        { from: displayName, text, ts: Date.now(), mine: true },
      ]);
      sendData({ type: "chat", from: displayName, text });
    },
    [displayName, sendData]
  );

  const toggleChat = useCallback(() => {
    setShowChat((v) => {
      if (!v) setUnread(0);
      return !v;
    });
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

  // Generate the QR for the permanent device link when there's a paired device
  const deviceLink = paired ? `${typeof window !== "undefined" ? window.location.origin : ""}/cam/device/${paired.id}` : null;
  useEffect(() => {
    if (!showPhoneQR || !deviceLink) {
      setDeviceQrDataUrl(null);
      return;
    }
    import("qrcode")
      .then((QR) => QR.toDataURL(deviceLink, { width: 220, margin: 1 }))
      .then(setDeviceQrDataUrl)
      .catch(() => setDeviceQrDataUrl(null));
  }, [showPhoneQR, deviceLink]);

  /** Create (or replace) the permanent pairing for this teacher's phone. */
  const generatePairing = useCallback(() => {
    const device = setPairedDevice(createDeviceId());
    setPaired(device);
    pairedRef.current = device.id;
    setShowPairing(true);
    notify("Enlace fijo generado — escanéalo en el celular una sola vez");
  }, [notify]);

  const unpair = useCallback(() => {
    clearPairedDevice();
    setPaired(null);
    pairedRef.current = null;
    notify("Celular desvinculado. Deberás re-escanear el enlace en el celular.");
  }, [notify]);

  // ------------------------------------------------------------ recording

  const pipCorner = useCallback((): "tl" | "tr" | "bl" | "br" => {
    const c = containerRef.current;
    if (!c || !pipPos) return "br";
    const midX = (c.clientWidth - pipSize.w) / 2;
    const midY = (c.clientHeight - pipSize.h) / 2;
    return `${pipPos.y < midY ? "t" : "b"}${pipPos.x < midX ? "l" : "r"}` as
      | "tl"
      | "tr"
      | "bl"
      | "br";
  }, [pipPos, pipSize]);

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
    notify(`Momento ${markersRef.current.length} marcado en ${formatTime(t)}`);
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
        notify(`Grabación guardada con ${markers.length} momento(s) clave`);
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
    toggleChords,
    toggleChat,
    startRecording,
    stopRecording,
    addMarker,
  });
  actionsRef.current = {
    switchCamera,
    selectSecondCamera,
    toggleScreenShare,
    toggleDualView,
    toggleChords,
    toggleChat,
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
          void a.switchCamera();
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
        case "Digit5":
          e.preventDefault();
          a.toggleChords();
          break;
        case "KeyC":
          e.preventDefault();
          a.toggleChat();
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
      bounds.width - pipSize.w - 8
    );
    const y = Math.min(
      Math.max(e.clientY - bounds.top - drag.dy, 8),
      bounds.height - pipSize.h - 8
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

  // PiP resize (stretch from the bottom-right corner, 16:9 kept)
  const pipResizeRef = useRef<{ sx: number; w: number } | null>(null);

  const onPipResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pipResizeRef.current = { sx: e.clientX, w: pipSize.w };
  };

  const onPipResizeMove = (e: React.PointerEvent) => {
    const r = pipResizeRef.current;
    const c = containerRef.current;
    if (!r || !c) return;
    const bounds = c.getBoundingClientRect();
    const maxW = bounds.width * 0.45;
    const w = Math.min(Math.max(r.w + (e.clientX - r.sx), PIP_MIN_W), maxW);
    const h = Math.round(w / PIP_ASPECT);
    setPipSize({ w: Math.round(w), h });
  };

  const onPipResizeUp = () => {
    if (pipResizeRef.current) {
      try {
        localStorage.setItem(PIP_SIZE_KEY, JSON.stringify(pipSize));
      } catch {
        /* ignore */
      }
    }
    pipResizeRef.current = null;
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

  /** Shortcut label for the current platform. */
  const sc = (k: string) => (isMac ? `⌘⌥${k}` : `Ctrl+Alt+${k}`);

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
              Invitar estudiante (copiar enlace)
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
            className="flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
          >
            <SendIcon width={12} height={12} />
            Invitar · <span className="font-mono">{roomId}</span>
          </button>
          <span className="text-xs text-gray-400">{statusLabel[status]}</span>
        </div>
        <div className="flex items-center gap-3">
          {recording && (
            <span className="rec-pulse flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold">
              ● REC{markerCount > 0 ? ` · ${markerCount} ⚑` : ""}
            </span>
          )}
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white"
            title="Atajos de teclado"
          >
            <HelpIcon width={15} height={15} />
          </button>
        </div>
      </div>

      {/* Tuner */}
      <TunerPanel
        open={showTuner}
        localStream={localRawStream}
        remoteStream={remoteStream}
        onClose={() => setShowTuner(false)}
      />

      {/* Chord text box (teacher edits, student sees it read-only) */}
      <ChordOverlay
        box={chordBox}
        editable={isHost}
        containerRef={containerRef}
        onChange={updateChordBox}
        onClose={() => updateChordBox({ ...chordBox, visible: false })}
      />

      {/* In-call chat */}
      <ChatPanel
        open={showChat}
        messages={chatMessages}
        connected={dataConnected}
        onSend={sendChat}
        onClose={() => setShowChat(false)}
      />

      {/* Draggable + resizable self-view (PiP) */}
      <div
        ref={pipRef}
        onPointerDown={onPipPointerDown}
        onPointerMove={onPipPointerMove}
        onPointerUp={onPipPointerUp}
        style={{ ...pipStyle, width: pipSize.w, height: pipSize.h }}
        className="absolute z-20 cursor-grab touch-none select-none overflow-hidden rounded-xl border-2 border-accent/70 shadow-xl active:cursor-grabbing"
        title="Arrástrame para moverme · estira la esquina para redimensionar"
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full ${usingPhone ? "object-contain" : "object-cover"}`}
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
        {/* Resize handle */}
        <span
          onPointerDown={onPipResizeDown}
          onPointerMove={onPipResizeMove}
          onPointerUp={onPipResizeUp}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none rounded-tl-md bg-accent/80"
          title="Estira para cambiar el tamaño"
        />
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div className="absolute right-4 top-12 z-30 w-80 rounded-xl border border-gray-700 bg-panel/95 p-4 text-xs leading-relaxed shadow-2xl">
          <p className="mb-2 font-semibold text-gray-200">Atajos de teclado</p>
          <ul className="space-y-1 text-gray-300">
            <li>{sc("1")} — Cámara principal</li>
            <li>{sc("2")} — Cámara del celular</li>
            <li>{sc("3")} — Compartir pantalla</li>
            <li>{sc("4")} — Vista dual: cara + manos</li>
            <li>{sc("5")} — Acordes (caja de texto)</li>
            <li>{sc("C")} — Chat</li>
            <li>{sc("R")} — Iniciar grabación</li>
            <li>{sc("M")} — Marcar momento clave</li>
            <li>Pausa — Detener grabación y guardar</li>
          </ul>
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
            <p className="text-lg font-semibold">Tu celular como cámara</p>
            <ol className="mt-3 space-y-1.5 text-left text-xs leading-relaxed text-gray-300">
              <li>1. Conecta el celular a la misma red WiFi.</li>
              <li>2. Escanea este código con la cámara del celular y abre el enlace.</li>
              <li>3. Apunta el celular a tus manos / instrumento.</li>
              <li>
                4. Presiona <b>{sc("2")}</b> para cambiar a esa cámara, y{" "}
                <b>{sc("1")}</b> para volver.
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
            {/* Permanent pairing (URL fija) */}
            <div className="mt-4 border-t border-gray-700 pt-3 text-left">
              <button
                onClick={() => setShowPairing((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-semibold text-gray-200"
              >
                <span>📌 Vincular este celular de forma permanente</span>
                <span className="text-gray-500">{showPairing ? "▲" : "▼"}</span>
              </button>

              {showPairing && (
                <div className="mt-3 space-y-3">
                  {paired ? (
                    <>
                      <p className="text-[11px] leading-relaxed text-gray-300">
                        Escanea este código <b>una sola vez</b> en el celular y
                        agrégalo a la pantalla de inicio. Luego funcionará en
                        cualquier clase sin volver a escanear.
                      </p>
                      <div className="flex justify-center">
                        {deviceQrDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={deviceQrDataUrl}
                            alt="Código QR de la cámara fija"
                            className="rounded-lg bg-white p-2"
                          />
                        ) : (
                          <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-white/10 text-xs text-gray-400">
                            Generando…
                          </div>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (!deviceLink) return;
                          try {
                            await navigator.clipboard.writeText(deviceLink);
                            notify("Enlace fijo copiado");
                          } catch {
                            /* clipboard blocked */
                          }
                        }}
                        className="w-full rounded-lg border border-gray-600 px-4 py-2 text-xs hover:border-accent hover:text-accent"
                      >
                        Copiar enlace fijo
                      </button>
                      <div className="rounded-lg bg-black/30 p-2 text-[10px] leading-relaxed text-gray-400">
                        <b>Agregar a pantalla de inicio:</b>
                        <br />
                        Android: menú ⋮ → &ldquo;Agregar a pantalla de inicio&rdquo;.
                        <br />
                        iPhone: compartir → &ldquo;Agregar a pantalla de inicio&rdquo;.
                      </div>
                      <p className="text-[11px] text-emerald-400">
                        Celular vinculado ✓ ·{" "}
                        {new Date(paired.pairedAt).toLocaleDateString("es-CL")}
                      </p>
                      <button
                        onClick={unpair}
                        className="w-full rounded-lg bg-white/10 px-4 py-2 text-xs text-red-300 hover:bg-white/20"
                      >
                        Desvincular
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] leading-relaxed text-gray-300">
                        Genera un enlace fijo para dejar un celular instalado
                        como cámara. Se conectará solo en cada clase, sin escanear
                        de nuevo.
                      </p>
                      <button
                        onClick={generatePairing}
                        className="w-full rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-black hover:brightness-110"
                      >
                        Generar enlace fijo
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowPhoneQR(false)}
              className="mt-3 w-full rounded-lg bg-white/10 px-4 py-2 text-xs hover:bg-white/20"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Bottom control bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
        <HotkeyButton
          onClick={toggleMic}
          active={micOn}
          label={micOn ? <MicIcon /> : <MicOffIcon />}
          name="Micrófono"
          description={micOn ? "Silencia tu micrófono." : "Reactiva tu micrófono."}
        />
        <HotkeyButton
          onClick={toggleCam}
          active={camOn}
          label={camOn ? <VideoIcon /> : <VideoOffIcon />}
          name="Cámara"
          description={camOn ? "Apaga tu video sin salir de la clase." : "Enciende tu video."}
        />

        <Divider />

        <div className="relative">
          <HotkeyButton
            onClick={() => void switchCamera()}
            active={true}
            label={<Badged n={1}><VideoIcon /></Badged>}
            name="Cámara principal"
            description="Elige la cámara del computador. Toca el chevron para ver todas las fuentes de video."
            shortcut={sc("1")}
          />
          <button
            onClick={() => setShowCameraMenu((v) => !v)}
            aria-label="Elegir cámara"
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[9px] text-accent hover:bg-black"
          >
            ▾
          </button>
          <CameraMenu
            open={showCameraMenu}
            videoDevices={videoDevices}
            currentCamId={currentCamId}
            usingPhone={usingPhone}
            phoneConnecting={phoneConnecting}
            phoneConnected={!!phoneStreamRef.current}
            sharing={sharing}
            dualActive={dualActive}
            dualSourceB={dualSourceB}
            onPickCamera={(id) => void switchCamera(id)}
            onPickPhone={() => void selectSecondCamera()}
            onShareScreen={() => void toggleScreenShare()}
            onDualView={(src) => void toggleDualView(src)}
            onLinkPhone={() => setShowPhoneQR(true)}
            onClose={() => setShowCameraMenu(false)}
          />
        </div>
        <div className="relative">
          <HotkeyButton
            onClick={() => void selectSecondCamera()}
            active={!usingPhone}
            accent={usingPhone}
            label={<Badged n={2}><PhoneIcon /></Badged>}
            name="Cámara del celular"
            description="Cambia a la cámara del celular con un clic. Si aún no está conectado, muestra el código QR."
            shortcut={sc("2")}
          />
          {phoneConnecting && (
            <span className="rec-pulse pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400" />
          )}
        </div>
        <HotkeyButton
          onClick={() => void toggleScreenShare()}
          active={!sharing}
          accent={sharing}
          label={<Badged n={3}><ScreenIcon /></Badged>}
          name="Compartir pantalla"
          description="Muestra tu pantalla (partituras, apps). Presiona de nuevo para detener."
          shortcut={sc("3")}
        />
        <HotkeyButton
          onClick={() => void toggleDualView()}
          active={!dualActive}
          accent={dualActive}
          label={<Badged n={4}><DualIcon /></Badged>}
          name="Vista dual"
          description="Tu cara y tus manos a la vez, lado a lado. Requiere el celular conectado."
          shortcut={sc("4")}
        />
        {isHost && (
          <HotkeyButton
            onClick={toggleChords}
            active={!chordBox.visible}
            accent={chordBox.visible}
            label={<Badged n={5}><ChordIcon /></Badged>}
            name="Acordes"
            description="Caja de texto sobre el video para escribir acordes. Arrástrala, estírala y ajusta color/tamaño/transparencia; el estudiante la ve igual."
            shortcut={sc("5")}
          />
        )}

        <Divider />

        <HotkeyButton
          onClick={() => setShowTuner((v) => !v)}
          active={!showTuner}
          accent={showTuner}
          label={<ForkIcon />}
          name="Afinador"
          description="Afinador cromático: detecta la nota y su desviación en cents. Sirve para ti o para el estudiante."
        />
        <div className="relative">
          <HotkeyButton
            onClick={() => setShowMetro((v) => !v)}
            active={!showMetro && !metroOn}
            accent={showMetro || metroOn}
            label={<MetronomeIcon />}
            name="Metrónomo"
            description="Pulso compartido: lo escuchan ambos, sincronizado con tu instrumento. Tempo 40–208 BPM con tap tempo."
          />
          <MetronomePanel
            open={showMetro}
            on={metroOn}
            bpm={bpm}
            beat={beat}
            onToggle={toggleMetronome}
            onBpm={changeTempo}
            onClose={() => setShowMetro(false)}
          />
        </div>

        <Divider />

        <HotkeyButton
          onClick={() => (recording ? void stopRecording() : startRecording())}
          active={true}
          highlight={recording}
          label={
            recording ? (
              <StopIcon className="text-white" />
            ) : (
              <RecordIcon className="text-red-500" />
            )
          }
          name={recording ? "Detener y guardar" : "Grabar la clase"}
          description={
            recording
              ? "Termina la grabación y guarda el video (audio sincronizado) en tu escritorio."
              : "Graba video y audio de ambos participantes, sincronizados."
          }
          shortcut={recording ? "Pausa" : sc("R")}
        />
        {recording && (
          <HotkeyButton
            onClick={addMarker}
            active={true}
            label={<FlagIcon />}
            name="Marcar momento clave"
            description="Guarda el minuto actual; al final recibes la lista de momentos para repasar."
            shortcut={sc("M")}
          />
        )}

        <Divider />

        <div className="relative">
          <HotkeyButton
            onClick={() => setShowSettings((v) => !v)}
            active={!showSettings}
            accent={showSettings}
            label={<SlidersIcon />}
            name="Entrada de audio"
            description="Elige micrófono o interfaz, canal (estéreo/izq/der), modo instrumento y anti-eco."
          />
          <AudioSettingsPanel
            open={showSettings}
            devices={audioDevices}
            selectedDeviceId={micId}
            channel={channel}
            enhance={enhance}
            boost={boost}
            echoCancel={echoCancel}
            onDevice={(id) => void selectMicDevice(id)}
            onChannel={(c) => void selectChannel(c)}
            onEnhance={toggleEnhance}
            onBoost={changeBoost}
            onEcho={() => void toggleEchoCancel()}
            onClose={() => setShowSettings(false)}
          />
        </div>

        <div className="relative">
          <HotkeyButton
            onClick={toggleChat}
            active={!showChat}
            accent={showChat}
            label={<ChatIcon />}
            name="Chat"
            description="Mensajes de texto con el otro participante durante la clase."
            shortcut={sc("C")}
          />
          {unread > 0 && !showChat && (
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </div>

        <button
          onClick={hangUp}
          title="Salir de la clase"
          className="ml-1 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold hover:bg-red-500"
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

function Divider() {
  return <span className="mx-1 h-7 w-px bg-white/15" />;
}

/** Wraps an icon with a small shortcut-number badge. */
function Badged({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="relative flex items-center justify-center">
      {children}
      <span className="absolute -bottom-1.5 -right-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/70 text-[8px] font-bold text-accent">
        {n}
      </span>
    </span>
  );
}

/**
 * Round control button with a rich hover tooltip: action name, what it does,
 * and its keyboard shortcut (when it has one).
 */
function HotkeyButton({
  onClick,
  active,
  highlight,
  accent,
  label,
  name,
  description,
  shortcut,
}: {
  onClick: () => void;
  active: boolean;
  /** Red state (recording, danger). */
  highlight?: boolean;
  /** Gold state (feature engaged: sharing, dual, panels). */
  accent?: boolean;
  label: React.ReactNode;
  name: string;
  description: string;
  shortcut?: string;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        aria-label={name}
        className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
          highlight
            ? "bg-red-600 text-white hover:bg-red-500"
            : accent
              ? "bg-accent text-black hover:brightness-110"
              : active
                ? "bg-white/15 text-gray-100 hover:bg-white/25"
                : "bg-red-600/80 text-white hover:bg-red-500"
        }`}
      >
        {label}
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-56 -translate-x-1/2 rounded-xl border border-gray-700 bg-panel/95 p-3 text-center shadow-2xl group-hover:block">
        <p className="text-xs font-semibold text-white">{name}</p>
        <p className="mt-1 text-[11px] leading-snug text-gray-400">{description}</p>
        {shortcut && (
          <span className="mt-2 inline-block rounded-md border border-accent/50 bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent">
            {shortcut}
          </span>
        )}
        <span className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-gray-700" />
      </div>
    </div>
  );
}
