/**
 * Call recorder (MusiCam): composes remote + local video on a canvas and mixes both
 * audio streams through an AudioContext, so audio/video stay in sync.
 * Output: .webm (VP9/VP8 + Opus). Saved via the File System Access API
 * (suggests the Desktop) with a download fallback.
 */

export interface RecorderSources {
  localVideo: HTMLVideoElement | null;
  remoteVideo: HTMLVideoElement | null;
  /** Processed local audio (instrument chain output). */
  localAudioStream: MediaStream | null;
  remoteAudioStream: MediaStream | null;
  /** Returns the PiP corner so the recording mirrors the on-screen layout. */
  getPipCorner: () => "tl" | "tr" | "bl" | "br";
}

const W = 1280;
const H = 720;
const PIP_W = 320;
const PIP_H = 180;
const PIP_MARGIN = 24;

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "";
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

export class CallRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private audioCtx: AudioContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private mimeType = "";

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  start(sources: RecorderSources): void {
    if (this.isRecording) return;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx2d = canvas.getContext("2d")!;
    this.canvas = canvas;

    const draw = () => {
      ctx2d.fillStyle = "#0c0e14";
      ctx2d.fillRect(0, 0, W, H);

      const { localVideo, remoteVideo } = sources;
      const remoteLive = remoteVideo && remoteVideo.readyState >= 2;
      const localLive = localVideo && localVideo.readyState >= 2;

      if (remoteLive) {
        drawCover(ctx2d, remoteVideo!, 0, 0, W, H);
        if (localLive) {
          const corner = sources.getPipCorner();
          const px = corner.includes("l") ? PIP_MARGIN : W - PIP_W - PIP_MARGIN;
          const py = corner.includes("t") ? PIP_MARGIN : H - PIP_H - PIP_MARGIN;
          ctx2d.strokeStyle = "#e8b339";
          ctx2d.lineWidth = 2;
          drawCover(ctx2d, localVideo!, px, py, PIP_W, PIP_H);
          ctx2d.strokeRect(px, py, PIP_W, PIP_H);
        }
      } else if (localLive) {
        drawCover(ctx2d, localVideo!, 0, 0, W, H);
      }

      this.raf = requestAnimationFrame(draw);
    };
    draw();

    // --- Audio mix ---
    const audioCtx = new AudioContext({ sampleRate: 48000 });
    this.audioCtx = audioCtx;
    const mixDest = audioCtx.createMediaStreamDestination();

    for (const s of [sources.localAudioStream, sources.remoteAudioStream]) {
      if (s && s.getAudioTracks().length > 0) {
        audioCtx.createMediaStreamSource(s).connect(mixDest);
      }
    }

    const mixedStream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...mixDest.stream.getAudioTracks(),
    ]);

    this.mimeType = pickMimeType();
    this.chunks = [];
    this.recorder = new MediaRecorder(mixedStream, {
      mimeType: this.mimeType || undefined,
      videoBitsPerSecond: 5_000_000,
      audioBitsPerSecond: 320_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec || rec.state === "inactive") {
        reject(new Error("Not recording"));
        return;
      }
      rec.onstop = () => {
        cancelAnimationFrame(this.raf);
        void this.audioCtx?.close();
        this.audioCtx = null;
        this.canvas = null;
        const blob = new Blob(this.chunks, {
          type: this.mimeType || "video/webm",
        });
        this.chunks = [];
        this.recorder = null;
        resolve(blob);
      };
      rec.stop();
    });
  }
}

/**
 * Saves the recording. Uses the File System Access API suggesting the
 * Desktop as target; falls back to a regular download if unavailable.
 */
export async function saveRecording(blob: Blob): Promise<string> {
  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace("T", "_")
    .replace(":", "-");
  const fileName = `clase-musicam_${stamp}.webm`;

  const picker = (window as any).showSaveFilePicker as
    | ((opts: object) => Promise<any>)
    | undefined;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        startIn: "desktop",
        types: [
          { description: "Video WebM", accept: { "video/webm": [".webm"] } },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name as string;
    } catch (err: any) {
      if (err?.name === "AbortError") throw err; // user cancelled
      // fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}
