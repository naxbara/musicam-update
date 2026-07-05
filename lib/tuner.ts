/**
 * Chromatic tuner: autocorrelation (ACF2+) pitch detection over an
 * AnalyserNode. Works on any MediaStream — your mic or the student's audio.
 *
 * Accuracy work (feedback "Versión 4"):
 *  - Longer window (fftSize 4096 ≈ 85 ms @ 48 kHz) → ~7 periods on a low E2,
 *    so bass strings resolve without octave jumps.
 *  - A clarity metric gates out background noise (no phantom notes in silence).
 *  - Temporal smoothing: a median over recent frequencies, note hysteresis and
 *    an EMA on the cents needle, so the reading is steady on a held note.
 *  - Configurable A4 reference (440 / 441 / 442).
 */

// American note names (clave americana): C, D, E, F, G, A, B.
const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export interface PitchReading {
  freq: number;
  note: string;
  octave: number;
  /** Deviation from the tempered note, in cents (-50..+50). */
  cents: number;
}

/** Below this clarity (peak / zero-lag energy) a frame is treated as noise. */
const CLARITY_MIN = 0.5;

interface RawPitch {
  freq: number;
  clarity: number;
}

function autoCorrelate(buf: Float32Array, sampleRate: number): RawPitch | null {
  const SIZE = buf.length;

  // Signal gate: ignore near-silence. Also track the peak amplitude so the
  // trimming threshold can adapt to soft instruments (a fixed threshold was
  // discarding almost the whole window and breaking detection).
  let rms = 0;
  let maxAbs = 0;
  for (let i = 0; i < SIZE; i++) {
    const v = buf[i];
    rms += v * v;
    const a = Math.abs(v);
    if (a > maxAbs) maxAbs = a;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005) return null;

  // Trim leading/trailing low-level samples, relative to this frame's peak.
  const threshold = Math.max(0.02, 0.2 * maxAbs);
  let r1 = 0;
  let r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < threshold) r1 = i;
    else break;
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < threshold) r2 = SIZE - i;
    else break;
  }
  const sliced = buf.slice(r1, r2);
  const N = sliced.length;
  if (N < 128) return null;

  // Autocorrelation
  const c = new Float32Array(N);
  for (let lag = 0; lag < N; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) sum += sliced[i] * sliced[i + lag];
    c[lag] = sum;
  }

  // Skip the first descending slope, then pick the FIRST strong peak (>=90%
  // of the zero-lag energy) rather than the global maximum. This avoids the
  // common octave error where a later, slightly taller peak is chosen.
  let d = 0;
  while (d < N - 1 && c[d] > c[d + 1]) d++;
  const peakThreshold = 0.9 * c[0];
  let maxPos = -1;
  let maxVal = -1;
  for (let i = d; i < N; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
    // Once we pass a clear local maximum above the threshold, lock it in.
    if (maxVal >= peakThreshold && i > maxPos && c[i] < maxVal) break;
  }
  if (maxPos <= 0) return null;

  // Clarity: how strong the periodic peak is vs the zero-lag energy. Noise and
  // inharmonic transients score low; a clean pitched note scores high.
  const clarity = c[0] > 0 ? maxVal / c[0] : 0;

  // Parabolic interpolation around the peak
  let T0 = maxPos;
  const x1 = c[T0 - 1] ?? c[T0];
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? c[T0];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  const freq = sampleRate / T0;
  if (freq < 27 || freq > 4200) return null; // outside musical range (A0..C8)
  return { freq, clarity };
}

function median(arr: number[]): number {
  const s = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class PitchDetector {
  private ctx: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  private referenceHz: number;

  // Temporal smoothing state
  private freqHistory: number[] = [];
  private displayedMidi: number | null = null;
  private candMidi: number | null = null;
  private candCount = 0;
  private emaCents: number | null = null;

  constructor(stream: MediaStream, referenceHz = 440) {
    this.referenceHz = referenceHz;
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    // Longer window → better low-frequency resolution (guitar 6th string E2).
    this.analyser.fftSize = 4096;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    void this.ctx.resume();
  }

  /** Change the A4 reference (440 / 441 / 442) mid-session. */
  setReferenceHz(hz: number) {
    this.referenceHz = hz;
  }

  read(): PitchReading | null {
    this.analyser.getFloatTimeDomainData(this.buf);
    const raw = autoCorrelate(this.buf, this.ctx.sampleRate);
    if (!raw || raw.clarity < CLARITY_MIN) return null;

    // Median over the last few valid frequencies smooths frame-to-frame jitter.
    this.freqHistory.push(raw.freq);
    if (this.freqHistory.length > 5) this.freqHistory.shift();
    const medFreq = median(this.freqHistory);

    const midi = 69 + 12 * Math.log2(medFreq / this.referenceHz);
    const nearest = Math.round(midi);

    // Note hysteresis: only switch the displayed note once a new candidate has
    // been the nearest for 2 consecutive frames (kills octave flicker).
    if (this.displayedMidi === null) {
      this.displayedMidi = nearest;
      this.emaCents = null;
    } else if (nearest !== this.displayedMidi) {
      if (nearest === this.candMidi) this.candCount++;
      else {
        this.candMidi = nearest;
        this.candCount = 1;
      }
      if (this.candCount >= 2) {
        this.displayedMidi = nearest;
        this.candCount = 0;
        this.emaCents = null; // reset so the needle doesn't lurch on the switch
      }
    } else {
      this.candCount = 0;
    }

    const displayed = this.displayedMidi;
    const rawCents = (midi - displayed) * 100;
    // EMA so the needle glides instead of trembling on a sustained note.
    this.emaCents =
      this.emaCents === null ? rawCents : this.emaCents * 0.7 + rawCents * 0.3;
    const cents = Math.round(Math.max(-50, Math.min(50, this.emaCents)));

    return {
      freq: medFreq,
      note: NOTE_NAMES[((displayed % 12) + 12) % 12],
      octave: Math.floor(displayed / 12) - 1,
      cents,
    };
  }

  close() {
    try {
      this.source.disconnect();
      void this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
