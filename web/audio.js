// Synthesized mission sound effects using the Web Audio API (no audio files or build step).
import { REDACTED } from "./radio.js";

export const SOUND_KEY = "lost-in-transmission-sound";
const OUTCOMES = new Set(["cleared", "failed", "complete"]);
const INTERFERENCE_LEVEL = { Light: 1, Moderate: 1.35, Heavy: 1.75, Severe: 2.2 };

function readSoundPreference(storage) {
  try {
    return storage?.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveSoundPreference(storage, enabled) {
  try {
    storage?.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Restricted storage falls back to in-memory toggle state.
  }
}

function samePoint(a, b) {
  return Boolean(a && b) && a[0] === b[0] && a[1] === b[1];
}

// Decides which sound cues to play when a new server state snapshot arrives.
// Pure function so game state transitions can be tested without a browser.
export function cuesForTransition(oldState, newState, { resuming = false } = {}) {
  if (!newState || resuming) return [];
  const cues = [];

  if (!oldState) {
    if (newState.phase === "briefing") cues.push({ type: "stamp", kind: "briefing" });
    return cues;
  }

  if (oldState.phase !== newState.phase) {
    if (newState.phase === "briefing") {
      cues.push({ type: "stamp", kind: "briefing" });
      return cues;
    }
    if (oldState.phase === "briefing" && newState.phase === "active") {
      cues.push({ type: "channelOpen" });
      return cues;
    }
    if (OUTCOMES.has(newState.phase)) {
      cues.push({ type: "stamp", kind: newState.phase });
      cues.push({ type: "echoHello", delayMs: 550 });
      return cues;
    }
  }

  if (oldState.phase !== "lobby" && newState.phase !== "lobby" && oldState.paired !== newState.paired) {
    cues.push({ type: "connection", connected: newState.paired });
  }

  if (oldState.phase !== "active" || newState.phase !== "active" || oldState.mission !== newState.mission) {
    return cues;
  }

  if (oldState.key && !newState.key) {
    cues.push({ type: "decrypt" });
  }

  if (newState.incoming && newState.incoming.number !== oldState.incoming?.number) {
    const redacted = newState.incoming.tiles.filter((tile) => tile === REDACTED).length;
    cues.push({ type: "incoming", redacted, interference: newState.interference });
  }

  const suspicionDelta = newState.suspicion - oldState.suspicion;

  if (newState.role === "agent") {
    if (oldState.stage === "moves" && newState.stage === "report") {
      cues.push({ type: "tile", kind: "tab" });
    }
    if (!samePoint(oldState.position, newState.position) && oldState.position && newState.position) {
      cues.push({ type: "step" });
    }
    if (!oldState.bag && newState.bag) {
      const pickedDecoy = suspicionDelta === 15 || suspicionDelta >= 40;
      cues.push({ type: "item", kind: pickedDecoy ? "decoy" : "take" });
    } else if (oldState.bag && !newState.bag) {
      cues.push({ type: "item", kind: suspicionDelta < 0 ? "blend" : "drop" });
    }
    if (suspicionDelta >= 25) {
      cues.push({ type: "spotted", suspicion: newState.suspicion });
    } else if (!oldState.guard && newState.guard) {
      cues.push({ type: "guardNear" });
    }
  } else if (newState.role === "handler") {
    const sawSighting = Boolean(newState.last_seen) && (
      oldState.last_seen?.round !== newState.last_seen.round
      || !samePoint(oldState.last_seen?.position, newState.last_seen.position)
    );
    if (sawSighting) cues.push({ type: "cctv" });
    if (suspicionDelta >= 25) {
      cues.push({ type: "spotted", suspicion: newState.suspicion });
    }
  }

  return cues;
}

export class MissionAudio {
  constructor({
    storage = globalThis.localStorage,
    createContext,
    setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
    clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
    random = Math.random,
  } = {}) {
    this.storage = storage;
    this.createContext = createContext;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.random = random;
    this.enabled = readSoundPreference(storage);
    this.ctx = null;
    this.noiseBuffer = null;
    this.timers = new Set();
  }

  ensureContext() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      if (this.createContext) {
        this.ctx = this.createContext();
      } else {
        const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioCtor) return null;
        this.ctx = new AudioCtor();
      }
      this.noiseBuffer = null;
    }
    if (this.ctx?.state === "suspended") this.ctx.resume?.().catch(() => {});
    return this.ctx;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    saveSoundPreference(this.storage, this.enabled);
    if (!this.enabled) this.cancelPending();
  }

  cancelPending() {
    for (const id of this.timers) this.clearTimeoutFn?.(id);
    this.timers.clear();
  }

  schedule(delayMs, fn) {
    if (!this.enabled || !this.setTimeoutFn) return;
    const id = this.setTimeoutFn(() => {
      this.timers.delete(id);
      if (this.enabled) fn();
    }, delayMs);
    this.timers.add(id);
  }

  getNoiseBuffer(ctx) {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.max(1, Math.floor(ctx.sampleRate || 44100));
    const buffer = ctx.createBuffer(1, length, length);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) channel[i] = this.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  tone(ctx, {
    start = ctx.currentTime,
    duration = 0.1,
    freq = 440,
    endFreq = null,
    type = "triangle",
    gain = 0.05,
    attack = 0.01,
    ramp = "exponential",
  }) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== null) {
      if (ramp === "linear") osc.frequency.linearRampToValueAtTime(endFreq, start + duration);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    }
    const peakAt = start + Math.min(attack, duration * 0.4);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, peakAt);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.015);
  }

  noise(ctx, {
    start = ctx.currentTime,
    duration = 0.06,
    freq = 1400,
    endFreq = null,
    q = 1.2,
    filterType = "bandpass",
    gain = 0.04,
    attack = 0.006,
  }) {
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, start);
    if (endFreq !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), start + duration);
    }
    filter.Q.value = q;

    const amp = ctx.createGain();
    const peakAt = start + Math.min(attack, duration * 0.35);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, peakAt);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start(start, this.random() * 0.45);
    source.stop(start + duration + 0.015);
  }

  playTileClick(kind = "add") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const settings = {
      add: { noiseFreq: 2200, freq: 860, endFreq: 980, gain: 0.03 },
      remove: { noiseFreq: 1450, freq: 560, endFreq: 420, gain: 0.028 },
      tab: { noiseFreq: 1800, freq: 680, endFreq: 720, gain: 0.022 },
    }[kind] ?? { noiseFreq: 2000, freq: 800, endFreq: 880, gain: 0.028 };
    this.noise(ctx, { start: t, duration: 0.024, freq: settings.noiseFreq, q: 1.8, gain: 0.026 });
    this.tone(ctx, {
      start: t, duration: 0.036, freq: settings.freq, endFreq: settings.endFreq,
      type: "triangle", gain: settings.gain, attack: 0.004,
    });
  }

  playTransmit(tileCount = 2, interference = "Light") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const scale = INTERFERENCE_LEVEL[interference] ?? 1;
    const pulses = Math.min(5, Math.max(2, tileCount));

    // PTT squelch open
    this.noise(ctx, { start: t, duration: 0.04, freq: 1650, q: 1.1, gain: 0.022 * scale });
    for (let i = 0; i < pulses; i += 1) {
      const start = t + 0.032 + i * 0.042;
      this.tone(ctx, {
        start, duration: 0.03, freq: i % 2 === 0 ? 1160 : 1380,
        type: "sine", gain: 0.032, attack: 0.004,
      });
    }
    const tailAt = t + 0.036 + pulses * 0.042;
    this.noise(ctx, { start: tailAt, duration: 0.055 * Math.min(1.6, scale), freq: 1200, q: 0.9, gain: 0.024 * scale });
  }

  playIncoming({ redacted = 0, interference = "Light" } = {}) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const scale = INTERFERENCE_LEVEL[interference] ?? 1;

    this.noise(ctx, { start: t, duration: 0.038, freq: 1450, q: 1.0, gain: 0.024 * scale });
    if (redacted === 0) {
      [660, 880].forEach((freq, idx) => {
        this.tone(ctx, {
          start: t + 0.025 + idx * 0.105, duration: 0.19, freq,
          type: "triangle", gain: 0.055, attack: 0.012,
        });
      });
      return;
    }

    // Intercepted packet: partial chime interrupted by ECHO static tears.
    this.tone(ctx, { start: t + 0.02, duration: 0.11, freq: 660, type: "triangle", gain: 0.05 });
    const bursts = Math.min(3, redacted);
    for (let i = 0; i < bursts; i += 1) {
      const at = t + 0.095 + i * 0.105;
      this.noise(ctx, {
        start: at, duration: 0.088, freq: 1150 + i * 240, q: 0.85,
        gain: Math.min(0.085, 0.048 * scale),
      });
      this.tone(ctx, {
        start: at, duration: 0.085, freq: 215 - i * 18, endFreq: 145,
        type: "sawtooth", gain: 0.03, attack: 0.008, ramp: "linear",
      });
    }
  }

  playDecrypt() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noise(ctx, { start: t, duration: 0.18, freq: 720, endFreq: 2400, q: 2.2, gain: 0.048 });
    this.tone(ctx, { start: t + 0.09, duration: 0.13, freq: 659.25, type: "sine", gain: 0.048, attack: 0.01 });
    this.tone(ctx, { start: t + 0.17, duration: 0.24, freq: 1046.5, type: "triangle", gain: 0.06, attack: 0.012 });
  }

  playStep() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const jitter = 0.9 + this.random() * 0.2;
    this.noise(ctx, {
      start: t, duration: 0.032, freq: 340 * jitter, q: 0.8,
      filterType: "lowpass", gain: 0.042, attack: 0.004,
    });
    this.tone(ctx, {
      start: t, duration: 0.038, freq: 120 * jitter, endFreq: 64,
      type: "sine", gain: 0.03, attack: 0.004,
    });
  }

  playWallBump() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, {
      start: t, duration: 0.075, freq: 115, endFreq: 50,
      type: "sine", gain: 0.068, attack: 0.004,
    });
  }

  playItem(kind = "take") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === "take") {
      this.tone(ctx, { start: t, duration: 0.07, freq: 440, type: "triangle", gain: 0.045 });
      this.tone(ctx, { start: t + 0.055, duration: 0.11, freq: 660, type: "triangle", gain: 0.05 });
    } else if (kind === "decoy") {
      this.tone(ctx, { start: t, duration: 0.07, freq: 440, type: "triangle", gain: 0.042 });
      this.tone(ctx, {
        start: t + 0.045, duration: 0.22, freq: 150, endFreq: 118,
        type: "sawtooth", gain: 0.042, ramp: "linear",
      });
    } else if (kind === "blend") {
      this.noise(ctx, {
        start: t, duration: 0.16, freq: 900, endFreq: 320, q: 0.9,
        filterType: "lowpass", gain: 0.032,
      });
      this.tone(ctx, { start: t + 0.03, duration: 0.14, freq: 392, type: "sine", gain: 0.04 });
      this.tone(ctx, { start: t + 0.11, duration: 0.2, freq: 587.33, type: "sine", gain: 0.042 });
    } else {
      this.tone(ctx, { start: t, duration: 0.07, freq: 520, type: "triangle", gain: 0.038 });
      this.tone(ctx, { start: t + 0.055, duration: 0.1, freq: 360, type: "triangle", gain: 0.036 });
    }
  }

  playGuardNear() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.16].forEach((offset, idx) => {
      this.tone(ctx, {
        start: t + offset, duration: 0.09, freq: idx === 0 ? 96 : 86, endFreq: 46,
        type: "sine", gain: 0.068, attack: 0.005,
      });
    });
  }

  playSpotted(suspicion = 25) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const high = suspicion >= 75;
    const freqs = high ? [554, 523] : [466, 440];
    this.tone(ctx, { start: t, duration: 0.09, freq: 135, endFreq: 52, type: "sine", gain: 0.09, attack: 0.004 });
    freqs.forEach((freq, idx) => {
      this.tone(ctx, {
        start: t + 0.02 + idx * 0.115, duration: 0.11, freq,
        type: "sawtooth", gain: high ? 0.045 : 0.036, attack: 0.008,
      });
    });
  }

  playCctvPing() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noise(ctx, { start: t, duration: 0.02, freq: 2600, q: 1.5, filterType: "highpass", gain: 0.03 });
    this.tone(ctx, { start: t + 0.015, duration: 0.095, freq: 1040, type: "sine", gain: 0.042, attack: 0.006 });
  }

  playChannelOpen() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noise(ctx, { start: t, duration: 0.065, freq: 1350, q: 1.0, gain: 0.03 });
    this.tone(ctx, { start: t + 0.03, duration: 0.12, freq: 520, endFreq: 780, type: "triangle", gain: 0.048 });
  }

  playConnection(connected) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (connected) {
      this.tone(ctx, { start: t, duration: 0.1, freq: 620, type: "triangle", gain: 0.042 });
      this.tone(ctx, { start: t + 0.085, duration: 0.16, freq: 880, type: "triangle", gain: 0.048 });
    } else {
      this.tone(ctx, { start: t, duration: 0.24, freq: 580, endFreq: 180, type: "sine", gain: 0.045 });
      this.noise(ctx, { start: t + 0.14, duration: 0.11, freq: 1200, q: 0.9, gain: 0.028 });
    }
  }

  playTimerWarning() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, { start: t, duration: 0.11, freq: 784, type: "sine", gain: 0.036 });
    this.tone(ctx, { start: t + 0.14, duration: 0.14, freq: 784, type: "sine", gain: 0.032 });
  }

  playTimerTick(urgent = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noise(ctx, { start: t, duration: 0.016, freq: 2400, q: 2.0, gain: urgent ? 0.026 : 0.018 });
    if (urgent) {
      this.tone(ctx, { start: t, duration: 0.032, freq: 880, type: "sine", gain: 0.022, attack: 0.003 });
    }
  }

  playStamp(kind = "briefing") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    if (kind === "reject") {
      this.tone(ctx, {
        start: t, duration: 0.16, freq: 155, endFreq: 124,
        type: "sawtooth", gain: 0.036, attack: 0.008, ramp: "linear",
      });
      return;
    }

    // Low rubber-stamp thump (same voice as the clearance desk).
    this.tone(ctx, {
      start: t, duration: 0.1, freq: kind === "failed" ? 130 : 165, endFreq: 48,
      type: "sine", gain: 0.12, attack: 0.004,
    });

    if (kind === "briefing") {
      this.noise(ctx, { start: t + 0.02, duration: 0.045, freq: 2200, q: 0.7, filterType: "highpass", gain: 0.02 });
    } else if (kind === "cleared") {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        this.tone(ctx, {
          start: t + 0.08 + idx * 0.09, duration: 0.26, freq,
          type: "triangle", gain: 0.065, attack: 0.015,
        });
      });
    } else if (kind === "complete") {
      // ECHO's carrier fades out before the final resolution chord.
      this.noise(ctx, { start: t + 0.04, duration: 0.34, freq: 1600, endFreq: 260, q: 1.0, gain: 0.042 });
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        this.tone(ctx, {
          start: t + 0.28 + idx * 0.1, duration: 0.34, freq,
          type: "triangle", gain: 0.065, attack: 0.018,
        });
      });
    } else if (kind === "failed") {
      this.tone(ctx, {
        start: t + 0.06, duration: 0.22, freq: 220, endFreq: 185,
        type: "sawtooth", gain: 0.042, ramp: "linear",
      });
      this.tone(ctx, {
        start: t + 0.24, duration: 0.28, freq: 175, endFreq: 138,
        type: "sawtooth", gain: 0.038, ramp: "linear",
      });
      this.noise(ctx, { start: t + 0.3, duration: 0.16, freq: 1100, q: 0.8, gain: 0.024 });
    }
  }

  playEchoHello() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Five faint shortwave tones matching "H E L L O" in the debrief footer.
    this.noise(ctx, { start: t, duration: 0.88, freq: 1400, q: 2.0, gain: 0.014 });
    [740, 698.46, 740, 659.25, 622.25].forEach((freq, idx) => {
      const start = t + 0.04 + idx * 0.155;
      this.tone(ctx, { start, duration: 0.13, freq, type: "sine", gain: 0.026, attack: 0.012 });
      this.tone(ctx, { start, duration: 0.13, freq: freq * 1.006, type: "sine", gain: 0.012, attack: 0.012 });
    });
  }

  playCue(cue) {
    if (!this.enabled || !cue) return;
    switch (cue.type) {
      case "tile": this.playTileClick(cue.kind); break;
      case "transmit": this.playTransmit(cue.count, cue.interference); break;
      case "incoming": this.playIncoming(cue); break;
      case "decrypt": this.playDecrypt(); break;
      case "step": this.playStep(); break;
      case "wall": this.playWallBump(); break;
      case "item": this.playItem(cue.kind); break;
      case "guardNear": this.playGuardNear(); break;
      case "spotted": this.playSpotted(cue.suspicion); break;
      case "cctv": this.playCctvPing(); break;
      case "channelOpen": this.playChannelOpen(); break;
      case "connection": this.playConnection(cue.connected); break;
      case "stamp": this.playStamp(cue.kind); break;
      case "echoHello":
        this.schedule(cue.delayMs ?? 550, () => this.playEchoHello());
        break;
    }
  }

  playTransition(oldState, newState, options) {
    if (!this.enabled) return;
    if (oldState?.phase !== newState?.phase) this.cancelPending();
    for (const cue of cuesForTransition(oldState, newState, options)) {
      this.playCue(cue);
    }
  }
}
