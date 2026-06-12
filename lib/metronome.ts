/**
 * Shared metronome: clicks are generated locally AND injected into the
 * outgoing call audio, so teacher and student hear the same beat — the click
 * travels with the same latency as the instrument, keeping them musically
 * aligned on the student's side.
 *
 * Uses the classic look-ahead scheduler for rock-solid timing, and exposes
 * an onBeat callback (fired in sync with the audible click) for visual
 * beat indicators.
 */

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;
export const BEATS_PER_MEASURE = 4;

export class Metronome {
  private ctx: AudioContext;
  private outputs: AudioNode[];
  private timer: number | null = null;
  private nextTime = 0;
  private beat = 0;
  private bpm = 92;

  /** Fired (approximately) when each click becomes audible. 0 = accent. */
  onBeat: ((beatIndex: number) => void) | null = null;

  constructor(ctx: AudioContext, outputs: AudioNode[]) {
    this.ctx = ctx;
    this.outputs = outputs;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  private click(time: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1318 : 880; // E6 accent, A5 beat
    env.gain.setValueAtTime(accent ? 0.4 : 0.25, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(env);
    for (const out of this.outputs) env.connect(out);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  start(bpm: number) {
    if (this.timer !== null) return;
    this.bpm = bpm;
    this.beat = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => {
      while (this.nextTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
        const beatIndex = this.beat % BEATS_PER_MEASURE;
        this.click(this.nextTime, beatIndex === 0);
        const delayMs = Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000);
        window.setTimeout(() => this.onBeat?.(beatIndex), delayMs);
        this.nextTime += 60 / this.bpm;
        this.beat += 1;
      }
    }, LOOKAHEAD_MS);
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
  }
}
