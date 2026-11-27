const INTERFERENCE_LEVELS = {
  Light: 0.2,
  Moderate: 0.4,
  Heavy: 0.7,
  Severe: 1,
};

export function interferenceIntensity(level) {
  return INTERFERENCE_LEVELS[level] ?? 0;
}

export class StaticNoise {
  constructor() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) throw new Error("Web Audio is not supported");

    this.context = new AudioCtor();
    this.enabled = false;
    this.active = false;
    this.intensity = 0;

    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;

    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    filter.connect(this.gain);
    this.gain.connect(this.context.destination);

    const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.random() * 2 - 1;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(filter);
    source.start();
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      try {
        await this.context.resume();
      } catch (error) {
        this.enabled = false;
        throw error;
      }
    }
    this.update(this.active, this.intensity);
  }

  update(active, intensity) {
    this.active = active;
    this.intensity = intensity;
    const volume = this.enabled && active ? intensity * 0.025 : 0;
    this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.12);
  }
}
