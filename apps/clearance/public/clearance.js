const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const PENDING_RELOAD_KEY = "po1_clearance_pending_reload";
const CLIENT_LOCK_MS = 1500;

const DESTINATIONS = {
  "/": { short: "DEST: LOST IN TRANSMISSION", label: "Lost in Transmission" },
};

const CARD_ICONS = {
  fort: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="18" cy="14" rx="11" ry="4"/><path d="M7 14v10c0 2.2 4.9 4 11 4s11-1.8 11-4V14"/><line x1="13" y1="18" x2="13" y2="21"/><line x1="18" y1="19" x2="18" y2="22"/><line x1="23" y1="18" x2="23" y2="21"/><path d="M4 30c3-1.5 6 1.5 9 0s6 1.5 9 0 6 1.5 10 0"/></svg>`,
  beacon: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 30l2-14h6l2 14"/><rect x="14" y="10" width="8" height="6"/><polygon points="13,10 18,5 23,10"/><line x1="9" y1="30" x2="27" y2="30"/><line x1="6" y1="12" x2="11" y2="13"/><line x1="30" y1="12" x2="25" y2="13"/><line x1="8" y1="7" x2="12" y2="10"/><line x1="28" y1="7" x2="24" y2="10"/></svg>`,
  ferry: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 23h26l-3 6H8l-3-6z"/><path d="M10 23v-7h14v7"/><rect x="14" y="11" width="4" height="5"/><line x1="14" y1="19" x2="20" y2="19"/><path d="M4 32c4-1.5 7 1.5 10 0s7 1.5 10 0 5 1.5 8 0"/></svg>`,
  compass: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="12"/><polygon points="18,10 21,18 18,26 15,18"/><line x1="18" y1="4" x2="18" y2="7"/><line x1="18" y1="29" x2="18" y2="32"/><line x1="4" y1="18" x2="7" y2="18"/><line x1="29" y1="18" x2="32" y2="18"/></svg>`,
  keycard: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="26" height="18" rx="2"/><circle cx="12" cy="18" r="3"/><line x1="15" y1="18" x2="26" y2="18"/><line x1="22" y1="18" x2="22" y2="21"/><line x1="25" y1="18" x2="25" y2="21"/></svg>`,
  bottle: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="4" width="6" height="4"/><path d="M15 8v4l-5 6v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V18l-5-6V8"/><path d="M14 21h8M14 25h6"/></svg>`,
  anchor: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="9" r="3"/><line x1="18" y1="12" x2="18" y2="29"/><line x1="12" y1="16" x2="24" y2="16"/><path d="M9 22c0 5 4 8 9 8s9-3 9-8"/><polyline points="7,24 9,22 11,24"/><polyline points="25,24 27,22 29,24"/></svg>`,
  tea: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14h16v12a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V14z"/><path d="M24 16h3a3 3 0 0 1 0 6h-3"/><path d="M13 10c0-2 1.5-2 1.5-4"/><path d="M19 10c0-2 1.5-2 1.5-4"/></svg>`,
  container: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="12" width="28" height="16" rx="1"/><line x1="10" y1="12" x2="10" y2="28"/><line x1="16" y1="12" x2="16" y2="28"/><line x1="22" y1="12" x2="22" y2="28"/><line x1="28" y1="12" x2="28" y2="28"/><line x1="18" y1="5" x2="18" y2="9"/><line x1="12" y1="9" x2="24" y2="9"/></svg>`,
  envelope: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="26" height="18" rx="1"/><polyline points="5,10 18,20 31,10"/><line x1="24" y1="22" x2="29" y2="27"/><line x1="29" y1="22" x2="24" y2="27"/></svg>`,
  cone: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="18,6 27,28 9,28"/><line x1="6" y1="28" x2="30" y2="28"/><line x1="14" y1="16" x2="22" y2="16"/><line x1="12" y1="22" x2="24" y2="22"/></svg>`,
  jammer: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,19 9,11 14,25 19,8 24,26 28,15 32,19"/><line x1="6" y1="6" x2="30" y2="30"/></svg>`,
  gull: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20c4-7 11-7 13 0 2-7 9-7 13 0"/><circle cx="24" cy="14" r="2.5"/><polyline points="27,14 32,15 27,16"/></svg>`,
  bridge: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="22" x2="32" y2="22"/><path d="M6 22c4-9 8-9 12 0 4-9 8-9 12 0"/><line x1="10" y1="22" x2="10" y2="29"/><line x1="26" y1="22" x2="26" y2="29"/></svg>`,
  tape: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="26" height="16" rx="2"/><circle cx="13" cy="18" r="3.5"/><circle cx="23" cy="18" r="3.5"/><line x1="13" y1="21.5" x2="23" y2="21.5"/></svg>`,
  tug: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22h24l-3 7H9l-3-7z"/><rect x="11" y="14" width="11" height="8"/><rect x="14" y="9" width="4" height="5"/><path d="M16 6c2-1 4 0 5-1"/></svg>`,
  bot: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="11" width="20" height="16" rx="3"/><line x1="18" y1="6" x2="18" y2="11"/><circle cx="18" cy="5" r="1.5"/><circle cx="14" cy="18" r="1.5"/><circle cx="22" cy="18" r="1.5"/><line x1="13" y1="23" x2="23" y2="23"/></svg>`,
  hovercraft: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="21" width="26" height="6" rx="3"/><path d="M9 21l4-8h11l3 8"/><line x1="23" y1="10" x2="23" y2="15"/><path d="M4 30h28"/></svg>`,
  swan: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 25c2 3 15 3 18-1 2-3 0-7-5-7h-5c0-6 2-10 6-10 2 0 3 1.5 3 3"/><line x1="26" y1="10" x2="30" y2="11"/><path d="M6 29h24"/></svg>`,
  scarf: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h18v7H9z"/><path d="M13 17v13h6V17"/><line x1="13" y1="21" x2="19" y2="21"/><line x1="13" y1="25" x2="19" y2="25"/><line x1="15" y1="10" x2="15" y2="17"/><line x1="21" y1="10" x2="21" y2="17"/></svg>`,
};

class BureauAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.noiseNodes = null;
  }

  ensureContext() {
    if (!this.enabled) return null;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!this.ctx) this.ctx = new AudioCtor();
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    if (!this.enabled) this.stopRadioNoise();
  }

  playGullSquawk() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.13].forEach((offset, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      const startFreq = index === 0 ? 1280 : 1120;
      const endFreq = index === 0 ? 780 : 690;
      osc.frequency.setValueAtTime(startFreq, t + offset);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + offset + 0.11);
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.linearRampToValueAtTime(0.06, t + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.13);
    });
  }

  startRadioNoise() {
    const ctx = this.ensureContext();
    if (!ctx || this.noiseNodes) return;

    const sampleCount = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      channel[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1300;
    filter.Q.value = 0.9;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.03;

    noiseSource.connect(filter).connect(noiseGain).connect(ctx.destination);
    noiseSource.start();

    const tone = ctx.createOscillator();
    tone.type = "sine";
    tone.frequency.value = 520;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.0001;
    tone.connect(toneGain).connect(ctx.destination);
    tone.start();

    this.noiseNodes = { noiseSource, noiseGain, tone, toneGain };
  }

  updateRadioNoise(proximity) {
    if (!this.enabled) return;
    if (!this.noiseNodes) this.startRadioNoise();
    if (!this.noiseNodes || !this.ctx) return;

    const t = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, proximity));
    const staticVol = 0.032 * (1 - clamped * 0.82) + 0.003;
    const humVol = clamped > 0.45 ? (clamped - 0.45) * 0.055 : 0.0001;
    this.noiseNodes.noiseGain.gain.setTargetAtTime(staticVol, t, 0.04);
    this.noiseNodes.toneGain.gain.setTargetAtTime(humVol, t, 0.04);
    this.noiseNodes.tone.frequency.setTargetAtTime(460 + clamped * 160, t, 0.04);
  }

  stopRadioNoise() {
    if (!this.noiseNodes) return;
    try {
      this.noiseNodes.noiseSource.stop();
      this.noiseNodes.tone.stop();
      this.noiseNodes.noiseGain.disconnect();
      this.noiseNodes.toneGain.disconnect();
    } catch {
      // Ignore already stopped audio nodes.
    }
    this.noiseNodes = null;
  }

  playLockChime() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [660, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t + idx * 0.11);
      gain.gain.setValueAtTime(0.0001, t + idx * 0.11);
      gain.gain.linearRampToValueAtTime(0.08, t + idx * 0.11 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + idx * 0.11 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + idx * 0.11);
      osc.stop(t + idx * 0.11 + 0.24);
    });
  }

  playStamp(kind = "ok") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Low rubber-stamp thump
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(kind === "reject" ? 130 : 165, t);
    thump.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    thumpGain.gain.setValueAtTime(0.14, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(t);
    thump.stop(t + 0.11);

    if (kind === "reject") {
      const buzz = ctx.createOscillator();
      const buzzGain = ctx.createGain();
      buzz.type = "sawtooth";
      buzz.frequency.setValueAtTime(145, t + 0.03);
      buzz.frequency.linearRampToValueAtTime(118, t + 0.26);
      buzzGain.gain.setValueAtTime(0.055, t + 0.03);
      buzzGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      buzz.connect(buzzGain).connect(ctx.destination);
      buzz.start(t + 0.03);
      buzz.stop(t + 0.29);
    } else if (kind === "granted") {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        const start = t + 0.08 + idx * 0.09;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.075, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    }
  }
}

const audio = new BureauAudio();

const elements = {
  checkpointDest: document.getElementById("checkpoint-dest"),
  destLabel: document.getElementById("dest-label"),
  soundToggle: document.getElementById("sound-toggle"),
  cookieAlert: document.getElementById("cookie-alert"),
  dossierStamp: document.getElementById("dossier-stamp"),
  receiptHumanity: document.getElementById("receipt-humanity"),
  receiptRadio: document.getElementById("receipt-radio"),
  receiptRadioText: document.getElementById("receipt-radio-text"),
  receiptCustoms: document.getElementById("receipt-customs"),
  stageHumanity: document.getElementById("stage-humanity"),
  humanityCheck: document.getElementById("humanity-check"),
  gullThief: document.getElementById("gull-thief"),
  gullStatus: document.getElementById("gull-status"),
  stageRadio: document.getElementById("stage-radio"),
  radioTarget: document.getElementById("radio-target"),
  radioLive: document.getElementById("radio-live"),
  radioBadge: document.getElementById("radio-badge"),
  radioWavePath: document.getElementById("radio-wave-path"),
  radioTargetZone: document.getElementById("radio-target-zone"),
  radioNeedle: document.getElementById("radio-needle"),
  radioSlider: document.getElementById("radio-slider"),
  radioDown: document.getElementById("radio-down"),
  radioUp: document.getElementById("radio-up"),
  radioHint: document.getElementById("radio-hint"),
  radioLockPct: document.getElementById("radio-lock-pct"),
  radioProgress: document.getElementById("radio-progress"),
  radioLockFill: document.getElementById("radio-lock-fill"),
  stageCustoms: document.getElementById("stage-customs"),
  customsCounter: document.getElementById("customs-counter"),
  customsReject: document.getElementById("customs-reject"),
  customsRejectStamp: document.getElementById("customs-reject-stamp"),
  customsRejectText: document.getElementById("customs-reject-text"),
  customsGrid: document.getElementById("customs-grid"),
  customsSubmit: document.getElementById("customs-submit"),
  grantedPanel: document.getElementById("clearance-granted"),
  grantedStamp: document.getElementById("granted-stamp"),
  grantedText: document.getElementById("granted-text"),
};

const state = {
  challenge: null,
  humanityPhase: "idle", // idle | stolen | done
  gullShooed: false,
  radioActive: false,
  radioLocked: false,
  radioRafId: null,
  radioLastFrame: 0,
  radioClock: 0,
  dialFreq: 71.0,
  effectiveFreq: 71.0,
  holdMs: 0,
  lockedFrequency: null,
  selectedIds: new Set(),
  submitting: false,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getDestination() {
  const path = window.location.pathname.length > 1
    ? window.location.pathname.replace(/\/+$/, "")
    : "/";
  return DESTINATIONS[path] ?? DESTINATIONS["/"];
}

function checkBlockedCookieReload() {
  try {
    const raw = sessionStorage.getItem(PENDING_RELOAD_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_RELOAD_KEY);
    const stamp = Number(raw);
    if (Number.isFinite(stamp) && Date.now() - stamp < 12_000) {
      elements.cookieAlert.hidden = false;
    }
  } catch {
    // Ignore restricted storage environments.
  }
}

async function fetchChallenge() {
  const response = await fetch("/api/clearance/challenge", { method: "POST" });
  if (!response.ok) throw new Error("Could not load Station PO1 clearance form.");
  return response.json();
}

function applyChallenge(challenge) {
  state.challenge = challenge;
  elements.radioTarget.textContent = `${challenge.targetFrequency.toFixed(1)} MHz`;
  elements.radioSlider.min = String(challenge.dialMin);
  elements.radioSlider.max = String(challenge.dialMax);

  const range = challenge.dialMax - challenge.dialMin;
  const zoneLeftPct = ((challenge.targetFrequency - challenge.tolerance - challenge.dialMin) / range) * 100;
  const zoneWidthPct = ((challenge.tolerance * 2) / range) * 100;
  elements.radioTargetZone.style.left = `${clamp(zoneLeftPct, 0, 100)}%`;
  elements.radioTargetZone.style.width = `${clamp(zoneWidthPct, 2, 100)}%`;

  const startFreq = challenge.targetFrequency >= 74.5 ? 71.4 : 77.6;
  state.dialFreq = startFreq;
  state.effectiveFreq = startFreq;
  elements.radioSlider.value = String(startFreq);

  renderCustomsGrid(challenge.grid);
}

/* ---------------- Beat 1: Form PO1-A (Humanity + Seagull) ---------------- */

function handleHumanityClick() {
  if (state.humanityPhase !== "idle") return;
  audio.ensureContext();
  state.humanityPhase = "stolen";

  elements.humanityCheck.setAttribute("aria-checked", "false");
  elements.humanityCheck.classList.add("humanity-check--stolen");
  elements.humanityCheck.disabled = true;

  elements.gullThief.hidden = false;
  elements.gullThief.classList.remove("gull-thief--fleeing");
  elements.gullStatus.textContent = "SEAGULL INTERFERENCE LOGGED! Click or press Enter on the gull to reclaim your tick.";
  elements.gullStatus.className = "gull-status gull-status--alert";

  audio.playGullSquawk();
  elements.gullThief.focus();
}

function handleGullShoo() {
  if (state.humanityPhase !== "stolen") return;
  state.humanityPhase = "done";
  state.gullShooed = true;

  audio.playGullSquawk();
  elements.gullThief.classList.add("gull-thief--fleeing");
  elements.humanityCheck.classList.remove("humanity-check--stolen");
  elements.humanityCheck.setAttribute("aria-checked", "true");
  elements.gullStatus.textContent = "Tick recovered. Proceeding to Form PO1-B carrier calibration...";
  elements.gullStatus.className = "gull-status gull-status--ok";

  audio.playStamp("ok");

  window.setTimeout(() => {
    elements.gullThief.hidden = true;
    elements.stageHumanity.hidden = true;
    elements.receiptHumanity.hidden = false;
    startRadioStage();
  }, REDUCED_MOTION ? 120 : 420);
}

/* ---------------- Beat 2: Form PO1-B (Radio Lock) ---------------- */

function renderScopeWave(proximity, clock) {
  const width = 360;
  const midY = 27;
  const points = [];
  const staticAmp = (1 - proximity) * (REDUCED_MOTION ? 5 : 16);
  const sineAmp = 5 + proximity * 12;

  for (let x = 0; x <= width; x += 6) {
    const phase = (x / width) * Math.PI * 6 + clock * (REDUCED_MOTION ? 2 : 7);
    const clean = Math.sin(phase) * sineAmp;
    const jitter = Math.sin(x * 1.7 + clock * 29) * Math.cos(x * 0.43 - clock * 17) * staticAmp;
    const y = clamp(midY + clean + jitter, 3, 51);
    points.push(`${x === 0 ? "M" : "L"} ${x} ${y.toFixed(1)}`);
  }

  elements.radioWavePath.setAttribute("d", points.join(" "));
  elements.radioWavePath.setAttribute("stroke", proximity >= 0.9 ? "#6bf09a" : "#f2a541");
}

function updateRadioUi(proximity, inBand) {
  const challenge = state.challenge;
  const range = challenge.dialMax - challenge.dialMin;
  const needlePct = ((state.effectiveFreq - challenge.dialMin) / range) * 100;

  elements.radioNeedle.style.left = `${clamp(needlePct, 0, 100)}%`;
  elements.radioNeedle.classList.toggle("radio-band__needle--locked", inBand || state.radioLocked);
  elements.radioLive.textContent = `${state.effectiveFreq.toFixed(1)} MHz`;

  const pct = Math.min(100, Math.round((state.holdMs / CLIENT_LOCK_MS) * 100));
  elements.radioLockPct.textContent = `${pct}%`;
  elements.radioLockFill.style.width = `${pct}%`;
  elements.radioProgress.setAttribute("aria-valuenow", String(pct));

  if (state.radioLocked) {
    elements.radioBadge.textContent = "CARRIER LOCKED";
    elements.radioBadge.dataset.state = "locked";
    elements.radioHint.textContent = `Signal locked at ${state.lockedFrequency.toFixed(1)} MHz.`;
  } else if (inBand) {
    elements.radioBadge.textContent = "HOLDING LOCK";
    elements.radioBadge.dataset.state = "holding";
    elements.radioHint.textContent = "Hold steady! ECHO is nudging the needle.";
  } else if (proximity > 0.55) {
    elements.radioBadge.textContent = "NEAR BAND";
    elements.radioBadge.dataset.state = "near";
    elements.radioHint.textContent = "Almost on carrier. Counter-steer ECHO's drift.";
  } else {
    elements.radioBadge.textContent = "STATIC";
    elements.radioBadge.dataset.state = "static";
    elements.radioHint.textContent = `Sweep toward ${challenge.targetFrequency.toFixed(1)} MHz to pick up Station PO1.`;
  }
}

function tickRadio(timestamp) {
  if (!state.radioActive || state.radioLocked || !state.challenge) return;

  const dt = state.radioLastFrame ? Math.min(60, timestamp - state.radioLastFrame) : 16;
  state.radioLastFrame = timestamp;
  state.radioClock += dt / 1000;

  const { targetFrequency, dialMin, dialMax, tolerance } = state.challenge;
  const rawDistance = Math.abs(state.dialFreq - targetFrequency);

  // ECHO interferes more noticeably as the operator approaches the target band.
  const echoProximity = clamp(1 - rawDistance / 1.8, 0, 1);
  const driftScale = REDUCED_MOTION ? 0.22 : 1;
  const echoWave =
    Math.sin(state.radioClock * 1.15) * 0.28
    + Math.sin(state.radioClock * 2.05 + 1.2) * 0.14;
  const echoOffset = echoWave * (0.18 + echoProximity * 0.82) * driftScale;

  state.effectiveFreq = clamp(state.dialFreq + echoOffset, dialMin, dialMax);

  const delta = Math.abs(state.effectiveFreq - targetFrequency);
  const inBand = delta <= tolerance;
  const proximity = clamp(1 - delta / 2.2, 0, 1);

  if (inBand) {
    state.holdMs = Math.min(CLIENT_LOCK_MS, state.holdMs + dt);
  } else {
    state.holdMs = Math.max(0, state.holdMs - dt * 0.45);
  }

  audio.updateRadioNoise(proximity);
  renderScopeWave(inBand ? 1 : proximity, state.radioClock);
  updateRadioUi(proximity, inBand);

  if (state.holdMs >= CLIENT_LOCK_MS) {
    completeRadioStage();
    return;
  }

  state.radioRafId = window.requestAnimationFrame(tickRadio);
}

function startRadioStage() {
  state.radioActive = true;
  state.radioLocked = false;
  state.holdMs = 0;
  state.radioLastFrame = 0;
  elements.stageRadio.hidden = false;
  elements.radioSlider.disabled = false;
  elements.radioDown.disabled = false;
  elements.radioUp.disabled = false;
  elements.radioSlider.focus();
  state.radioRafId = window.requestAnimationFrame(tickRadio);
}

function completeRadioStage() {
  state.radioLocked = true;
  state.radioActive = false;
  state.lockedFrequency = Number(state.effectiveFreq.toFixed(2));
  if (state.radioRafId) window.cancelAnimationFrame(state.radioRafId);
  audio.stopRadioNoise();
  audio.playLockChime();

  elements.radioSlider.disabled = true;
  elements.radioDown.disabled = true;
  elements.radioUp.disabled = true;
  renderScopeWave(1, state.radioClock);
  updateRadioUi(1, true);

  elements.receiptRadioText.textContent = `Carrier locked at ${state.challenge.targetFrequency.toFixed(1)} MHz through ECHO static.`;

  window.setTimeout(() => {
    elements.stageRadio.hidden = true;
    elements.receiptRadio.hidden = false;
    openCustomsStage();
  }, REDUCED_MOTION ? 120 : 480);
}

function nudgeDial(delta) {
  if (!state.radioActive || state.radioLocked || !state.challenge) return;
  audio.ensureContext();
  state.dialFreq = clamp(
    Number((state.dialFreq + delta).toFixed(2)),
    state.challenge.dialMin,
    state.challenge.dialMax,
  );
  elements.radioSlider.value = String(state.dialFreq);
}

/* ---------------- Beat 3: Form PO1-C (Coastal Customs) ---------------- */

function updateCustomsControls() {
  const count = state.selectedIds.size;
  elements.customsCounter.textContent = `${count} / 3 STAMPED`;

  if (state.submitting) {
    elements.customsSubmit.disabled = true;
    elements.customsSubmit.textContent = "Verifying manifest...";
    return;
  }

  if (count === 3) {
    elements.customsSubmit.disabled = false;
    elements.customsSubmit.textContent = "Submit Clearance Dossier";
  } else if (count < 3) {
    const remaining = 3 - count;
    elements.customsSubmit.disabled = true;
    elements.customsSubmit.textContent = remaining === 1
      ? "Stamp 1 more item"
      : `Stamp ${remaining} more items`;
  } else {
    elements.customsSubmit.disabled = true;
    elements.customsSubmit.textContent = `Unstamp ${count - 3} item${count - 3 === 1 ? "" : "s"}`;
  }
}

function createIconNode(iconName) {
  const template = document.createElement("template");
  template.innerHTML = CARD_ICONS[iconName] ?? CARD_ICONS.fort;
  const svg = template.content.firstElementChild;
  svg.classList.add("customs-card__icon");
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

function renderCustomsGrid(grid) {
  state.selectedIds.clear();
  elements.customsGrid.replaceChildren();

  for (const card of grid) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "customs-card";
    button.dataset.cardId = card.id;
    button.setAttribute("aria-pressed", "false");

    const top = document.createElement("div");
    top.className = "customs-card__top";

    const code = document.createElement("span");
    code.className = "customs-card__code";
    code.textContent = card.code;

    top.append(code, createIconNode(card.icon));

    const title = document.createElement("span");
    title.className = "customs-card__title";
    title.textContent = card.title;

    const sub = document.createElement("span");
    sub.className = "customs-card__sub";
    sub.textContent = card.subtitle;

    const stamp = document.createElement("span");
    stamp.className = "customs-card__stamp";
    stamp.setAttribute("aria-hidden", "true");
    stamp.textContent = "CLEARED";

    button.append(top, title, sub, stamp);

    button.addEventListener("click", () => {
      if (state.submitting) return;
      audio.ensureContext();
      if (state.selectedIds.has(card.id)) {
        state.selectedIds.delete(card.id);
        button.setAttribute("aria-pressed", "false");
      } else {
        state.selectedIds.add(card.id);
        button.setAttribute("aria-pressed", "true");
        audio.playStamp("ok");
      }
      updateCustomsControls();
    });

    elements.customsGrid.append(button);
  }

  updateCustomsControls();
}

function openCustomsStage() {
  elements.stageCustoms.hidden = false;
  const firstCard = elements.customsGrid.querySelector(".customs-card");
  if (firstCard) firstCard.focus();
}

function syncCustomsGrid(grid) {
  const remainingIds = new Set(grid.map((card) => card.id));
  const existingCards = [...elements.customsGrid.querySelectorAll(".customs-card")];
  const existingIds = new Set(existingCards.map((button) => button.dataset.cardId));

  const isSubset =
    grid.length <= existingCards.length
    && grid.every((card) => existingIds.has(card.id));

  if (!isSubset) {
    renderCustomsGrid(grid);
    return;
  }

  for (const id of [...state.selectedIds]) {
    if (!remainingIds.has(id)) {
      state.selectedIds.delete(id);
    }
  }

  for (const button of existingCards) {
    if (!remainingIds.has(button.dataset.cardId)) {
      button.remove();
    }
  }

  updateCustomsControls();
}

function triggerGridShake() {
  if (REDUCED_MOTION) return;
  elements.customsGrid.classList.remove("customs-grid--shake");
  void elements.customsGrid.offsetWidth;
  elements.customsGrid.classList.add("customs-grid--shake");
}

async function submitClearance() {
  if (state.submitting || state.selectedIds.size !== 3 || !state.challenge) return;
  state.submitting = true;
  updateCustomsControls();

  try {
    const response = await fetch("/api/clearance/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: state.challenge.challengeId,
        gullShooed: state.gullShooed,
        tunedFrequency: state.lockedFrequency,
        holdMs: Math.round(state.holdMs),
        selectedIds: [...state.selectedIds],
      }),
    });

    const data = await response.json();

    if (response.ok && data.ok) {
      audio.playStamp("granted");
      elements.customsReject.hidden = true;
      elements.stageCustoms.hidden = true;
      elements.receiptCustoms.hidden = false;

      elements.dossierStamp.textContent = data.stamp || "CLEARANCE GRANTED // PO1";
      elements.dossierStamp.className = "bureau-stamp bureau-stamp--signal";

      const dest = getDestination();
      elements.grantedStamp.textContent = data.stamp || "CLEARANCE GRANTED // PO1";
      elements.grantedText.textContent = `Officer ${data.officerId ?? "PO1"} cleared. Opening ${dest.label}...`;
      elements.grantedPanel.hidden = false;

      try {
        sessionStorage.setItem(PENDING_RELOAD_KEY, String(Date.now()));
      } catch {
        // Ignore restricted storage environments.
      }

      window.setTimeout(() => {
        window.location.reload();
      }, REDUCED_MOTION ? 260 : 850);
      return;
    }

    audio.playStamp("reject");
    elements.customsRejectStamp.textContent = data.stamp || "SO14 SUSPECTED";
    elements.customsRejectText.textContent = data.reason || "Customs rejected your manifest. Wrong items have been removed.";
    elements.customsReject.hidden = false;

    if (data.expired && data.challenge) {
      // Fresh full challenge required because the old slip expired.
      elements.receiptHumanity.hidden = true;
      elements.receiptRadio.hidden = true;
      elements.stageCustoms.hidden = true;
      elements.stageHumanity.hidden = false;
      state.humanityPhase = "idle";
      state.gullShooed = false;
      state.radioLocked = false;
      elements.humanityCheck.disabled = false;
      elements.humanityCheck.setAttribute("aria-checked", "false");
      elements.humanityCheck.classList.remove("humanity-check--stolen");
      elements.gullStatus.textContent = "Form expired. Re-tick the box to issue a new slip.";
      elements.gullStatus.className = "gull-status gull-status--alert";
      applyChallenge(data.challenge);
    } else if (Array.isArray(data.grid)) {
      syncCustomsGrid(data.grid);
      triggerGridShake();
    }
  } catch {
    audio.playStamp("reject");
    elements.customsRejectStamp.textContent = "SIGNAL LOST";
    elements.customsRejectText.textContent = "Station PO1 did not answer. Check your connection and try again.";
    elements.customsReject.hidden = false;
  } finally {
    state.submitting = false;
    updateCustomsControls();
  }
}

/* ---------------- Wiring & Init ---------------- */

async function init() {
  const dest = getDestination();
  elements.checkpointDest.textContent = dest.short;
  elements.destLabel.textContent = dest.label;

  checkBlockedCookieReload();

  elements.soundToggle.addEventListener("click", () => {
    const next = !audio.enabled;
    audio.setEnabled(next);
    elements.soundToggle.setAttribute("aria-pressed", String(next));
    elements.soundToggle.textContent = next ? "SOUND: ON" : "SOUND: OFF";
    if (next) audio.ensureContext();
  });

  elements.humanityCheck.addEventListener("click", handleHumanityClick);
  elements.gullThief.addEventListener("click", handleGullShoo);

  elements.radioSlider.addEventListener("input", () => {
    audio.ensureContext();
    state.dialFreq = Number(elements.radioSlider.value);
  });
  elements.radioDown.addEventListener("click", () => nudgeDial(-0.2));
  elements.radioUp.addEventListener("click", () => nudgeDial(0.2));

  elements.customsSubmit.addEventListener("click", submitClearance);

  window.addEventListener("pagehide", () => {
    if (state.radioRafId) window.cancelAnimationFrame(state.radioRafId);
    audio.stopRadioNoise();
  });

  try {
    const challenge = await fetchChallenge();
    applyChallenge(challenge);
  } catch {
    elements.gullStatus.textContent = "Unable to reach Station PO1 clearance desk. Reload to retry.";
    elements.gullStatus.className = "gull-status gull-status--alert";
    elements.humanityCheck.disabled = true;
  }
}

init();
