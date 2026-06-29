/**
 * Chromatic tuner: autocorrelation (ACF2+) pitch detection over an
 * AnalyserNode. Works on any MediaStream — your mic or the student's audio.
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

function autoCorrelate(buf: Float32Array, sampleRate: number): number {
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
  if (rms < 0.005) return -1;

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
  if (N < 128) return -1;

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
  if (maxPos <= 0) return -1;

  // Parabolic interpolation around the peak
  let T0 = maxPos;
  const x1 = c[T0 - 1] ?? c[T0];
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? c[T0];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  const freq = sampleRate / T0;
  if (freq < 27 || freq > 4200) return -1; // outside musical range (A0..C8)
  return freq;
}

export class PitchDetector {
  private ctx: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;

  constructor(stream: MediaStream) {
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    void this.ctx.resume();
  }

  read(): PitchReading | null {
    this.analyser.getFloatTimeDomainData(this.buf);
    const freq = autoCorrelate(this.buf, this.ctx.sampleRate);
    if (freq <= 0) return null;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const nearest = Math.round(midi);
    const cents = Math.round((midi - nearest) * 100);
    return {
      freq,
      note: NOTE_NAMES[((nearest % 12) + 12) % 12],
      octave: Math.floor(nearest / 12) - 1,
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
