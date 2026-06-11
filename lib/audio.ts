/**
 * Audio engine for music lessons (MusiCam).
 *
 * Two key ideas:
 * 1. RAW capture — explicitly disable noise suppression, echo cancellation
 *    and auto gain control so instrument harmonics are not destroyed.
 * 2. Instrument boost — a gentle compressor + makeup gain chain (similar to
 *    what Zoom/Teams do for voice, but tuned for instruments) that lifts the
 *    instrument level without pumping artifacts.
 */

export const RAW_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false, // use headphones to avoid feedback
  noiseSuppression: false, // never suppress instrument harmonics
  autoGainControl: false, // keep natural dynamics
  channelCount: { ideal: 2 },
  sampleRate: { ideal: 48000 },
};

export interface InstrumentChain {
  ctx: AudioContext;
  /** Stream carrying the processed audio track (send this to the peer). */
  outputStream: MediaStream;
  /** Node carrying the final mixed signal (tap point for recording). */
  outputNode: GainNode;
  /** Stream destination — extra sources (metronome) can connect here. */
  destinationNode: MediaStreamAudioDestinationNode;
  setBoost(value: number): void;
  setEnhanceEnabled(enabled: boolean): void;
  close(): void;
}

/**
 * Builds: source -> [compressor] -> gain -> destination.
 * The compressor evens out dynamics; gain provides makeup/boost (1x–4x).
 */
export function createInstrumentChain(inputStream: MediaStream): InstrumentChain {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  const source = ctx.createMediaStreamSource(inputStream);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const gain = ctx.createGain();
  gain.gain.value = 1.4; // sensible default makeup gain

  const destination = ctx.createMediaStreamDestination();
  gain.connect(destination);

  let enhanceEnabled = true;

  const rewire = () => {
    source.disconnect();
    compressor.disconnect();
    if (enhanceEnabled) {
      source.connect(compressor);
      compressor.connect(gain);
    } else {
      source.connect(gain);
    }
  };
  rewire();

  return {
    ctx,
    outputStream: destination.stream,
    outputNode: gain,
    destinationNode: destination,
    setBoost(value: number) {
      gain.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
    },
    setEnhanceEnabled(enabled: boolean) {
      enhanceEnabled = enabled;
      rewire();
    },
    close() {
      try {
        source.disconnect();
        compressor.disconnect();
        gain.disconnect();
        void ctx.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/**
 * SDP transform: force Opus into hi-fi music mode.
 * Stereo, 256 kbps average bitrate, full 48 kHz playback, DTX off so quiet
 * passages (sustained notes, decays) are never cut as "silence".
 */
export function hifiOpusSdp(sdp: string): string {
  const lines = sdp.split("\r\n");
  const opusPayloads = new Set<string>();

  for (const line of lines) {
    const m = line.match(/^a=rtpmap:(\d+) opus\/48000/i);
    if (m) opusPayloads.add(m[1]);
  }
  if (opusPayloads.size === 0) return sdp;

  const HIFI =
    "stereo=1;sprop-stereo=1;maxaveragebitrate=256000;maxplaybackrate=48000;usedtx=0";

  const fmtpSeen = new Set<string>();
  const out = lines.map((line) => {
    const m = line.match(/^a=fmtp:(\d+) (.*)$/);
    if (!m || !opusPayloads.has(m[1])) return line;
    fmtpSeen.add(m[1]);
    // Drop any conflicting params, then append ours
    const kept = m[2]
      .split(";")
      .map((p) => p.trim())
      .filter(
        (p) =>
          p &&
          !/^(stereo|sprop-stereo|maxaveragebitrate|maxplaybackrate|usedtx)=/i.test(p)
      );
    return `a=fmtp:${m[1]} ${[...kept, HIFI].join(";")}`;
  });

  // Add fmtp lines for opus payloads that had none
  for (const pt of Array.from(opusPayloads)) {
    if (fmtpSeen.has(pt)) continue;
    const idx = out.findIndex((l) => l.startsWith(`a=rtpmap:${pt} `));
    if (idx !== -1) out.splice(idx + 1, 0, `a=fmtp:${pt} ${HIFI}`);
  }

  return out.join("\r\n");
}
