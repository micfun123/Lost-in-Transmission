import assert from "node:assert/strict";
import test from "node:test";
import { cuesForTransition, MissionAudio, SOUND_KEY } from "../web/audio.js";
import { REDACTED } from "../web/radio.js";

function createFakeAudioContext() {
  const events = [];
  const makeParam = () => ({
    value: 0,
    setValueAtTime(v, t) { events.push(["param.set", v, t]); },
    linearRampToValueAtTime(v, t) { events.push(["param.linear", v, t]); },
    exponentialRampToValueAtTime(v, t) { events.push(["param.exp", v, t]); },
  });
  const connectable = (kind) => ({
    type: "",
    loop: false,
    buffer: null,
    frequency: makeParam(),
    gain: makeParam(),
    Q: { value: 0 },
    connect(target) {
      events.push(["connect", kind]);
      return target;
    },
    start(when = 0) { events.push(["start", kind, when]); },
    stop(when = 0) { events.push(["stop", kind, when]); },
  });
  let buffersCreated = 0;
  let resumed = 0;
  const ctx = {
    currentTime: 1.5,
    sampleRate: 8000,
    state: "suspended",
    destination: { kind: "destination" },
    events,
    get buffersCreated() { return buffersCreated; },
    get resumed() { return resumed; },
    resume() {
      resumed += 1;
      ctx.state = "running";
      return Promise.resolve();
    },
    createBuffer(channels, length) {
      buffersCreated += 1;
      const data = new Float32Array(length);
      return { channels, length, getChannelData: () => data };
    },
    createOscillator: () => connectable("osc"),
    createGain: () => connectable("gain"),
    createBufferSource: () => connectable("noise"),
    createBiquadFilter: () => connectable("filter"),
  };
  return ctx;
}

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
  };
}

function baseState(overrides = {}) {
  return {
    role: "agent",
    phase: "active",
    stage: "moves",
    paired: true,
    mission: 1,
    interference: "Moderate",
    suspicion: 0,
    key: true,
    incoming: null,
    position: [1, 1],
    bag: null,
    points: 4,
    guard: null,
    last_seen: null,
    ...overrides,
  };
}

test("cuesForTransition maps mission phase changes, debrief echo, and skips resume", () => {
  assert.deepEqual(
    cuesForTransition(null, baseState({ phase: "briefing" })),
    [{ type: "stamp", kind: "briefing" }],
  );
  assert.deepEqual(
    cuesForTransition(null, baseState({ phase: "active" }), { resuming: true }),
    [],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ phase: "lobby" }), baseState({ phase: "briefing" })),
    [{ type: "stamp", kind: "briefing" }],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ phase: "briefing" }), baseState({ phase: "active" })),
    [{ type: "channelOpen" }],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ phase: "active" }), baseState({ phase: "cleared" })),
    [{ type: "stamp", kind: "cleared" }, { type: "echoHello", delayMs: 550 }],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ phase: "active" }), baseState({ phase: "complete" })),
    [{ type: "stamp", kind: "complete" }, { type: "echoHello", delayMs: 550 }],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ phase: "active" }), baseState({ phase: "failed" })),
    [{ type: "stamp", kind: "failed" }, { type: "echoHello", delayMs: 550 }],
  );
});

test("cuesForTransition maps radio packets, decrypt keys, Wren moves, guards, and Magpie CCTV", () => {
  // Incoming clean vs jammed packet
  assert.deepEqual(
    cuesForTransition(
      baseState({ incoming: null }),
      baseState({ incoming: { number: 1, tiles: ["GO", "EAST"] } }),
    ),
    [{ type: "incoming", redacted: 0, interference: "Moderate" }],
  );
  assert.deepEqual(
    cuesForTransition(
      baseState({ incoming: { number: 1, tiles: ["GO", "EAST"] } }),
      baseState({ incoming: { number: 2, tiles: [REDACTED, "NORTH", REDACTED] }, interference: "Severe" }),
    ),
    [{ type: "incoming", redacted: 2, interference: "Severe" }],
  );

  // Decrypt key spent
  assert.deepEqual(
    cuesForTransition(baseState({ key: true }), baseState({ key: false })),
    [{ type: "decrypt" }],
  );

  // Wren step + guard entering 3x3 view
  assert.deepEqual(
    cuesForTransition(
      baseState({ position: [1, 1], guard: null }),
      baseState({ position: [2, 1], guard: [3, 1] }),
    ),
    [{ type: "step" }, { type: "guardNear" }],
  );

  // Wren takes package, takes decoy (+15), blends in (-15), drops package, gets spotted (+25)
  assert.deepEqual(
    cuesForTransition(baseState({ bag: null }), baseState({ bag: "briefcase" })),
    [{ type: "item", kind: "take" }],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ bag: null, suspicion: 0 }), baseState({ bag: "umbrella", suspicion: 15 })),
    [{ type: "item", kind: "decoy" }],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ bag: "umbrella", suspicion: 25 }), baseState({ bag: null, suspicion: 10 })),
    [{ type: "item", kind: "blend" }],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ bag: "briefcase" }), baseState({ bag: null })),
    [{ type: "item", kind: "drop" }],
  );
  assert.deepEqual(
    cuesForTransition(
      baseState({ position: [2, 1], guard: null, suspicion: 0 }),
      baseState({ position: [3, 1], guard: [4, 1], suspicion: 25 }),
    ),
    [{ type: "step" }, { type: "spotted", suspicion: 25 }],
  );

  // Magpie CCTV sighting + spotted alert, and partner disconnect/reconnect
  assert.deepEqual(
    cuesForTransition(
      baseState({ role: "handler", last_seen: null, suspicion: 0 }),
      baseState({ role: "handler", last_seen: { position: [3, 1], round: 2 }, suspicion: 25 }),
    ),
    [{ type: "cctv" }, { type: "spotted", suspicion: 25 }],
  );
  assert.deepEqual(
    cuesForTransition(baseState({ paired: true }), baseState({ paired: false })),
    [{ type: "connection", connected: false }],
  );
});

test("MissionAudio synthesizes cues, caches the noise buffer, persists mute, and cancels delayed sounds", () => {
  const storage = createMemoryStorage();
  const ctx = createFakeAudioContext();
  const scheduled = new Map();
  let nextId = 1;
  const audio = new MissionAudio({
    storage,
    createContext: () => ctx,
    setTimeoutFn: (fn, ms) => {
      const id = nextId++;
      scheduled.set(id, { fn, ms });
      return id;
    },
    clearTimeoutFn: (id) => { scheduled.delete(id); },
    random: () => 0.5,
  });

  assert.equal(audio.enabled, true);

  audio.playTileClick("add");
  audio.playTileClick("remove");
  audio.playTileClick("tab");
  audio.playTransmit(4, "Heavy");
  audio.playIncoming({ redacted: 0, interference: "Light" });
  audio.playIncoming({ redacted: 2, interference: "Severe" });
  audio.playDecrypt();
  audio.playStep();
  audio.playWallBump();
  audio.playItem("take");
  audio.playItem("decoy");
  audio.playItem("drop");
  audio.playItem("blend");
  audio.playGuardNear();
  audio.playSpotted(75);
  audio.playCctvPing();
  audio.playChannelOpen();
  audio.playConnection(false);
  audio.playConnection(true);
  audio.playTimerWarning();
  audio.playTimerTick(false);
  audio.playTimerTick(true);
  audio.playStamp("briefing");
  audio.playStamp("cleared");
  audio.playStamp("complete");
  audio.playStamp("failed");
  audio.playStamp("reject");

  assert.equal(ctx.resumed, 1);
  assert.equal(ctx.buffersCreated, 1);
  assert.ok(ctx.events.some(([op, kind]) => op === "start" && kind === "osc"));
  assert.ok(ctx.events.some(([op, kind]) => op === "start" && kind === "noise"));

  // Debrief transition schedules the delayed "H E L L O" numbers-station chime.
  audio.playTransition(baseState({ phase: "active" }), baseState({ phase: "cleared" }));
  assert.equal(scheduled.size, 1);
  const [[timerId, timer]] = scheduled.entries();
  assert.equal(timer.ms, 550);
  const eventsBeforeHello = ctx.events.length;
  scheduled.delete(timerId);
  timer.fn();
  assert.ok(ctx.events.length > eventsBeforeHello);

  // Muting cancels pending timers, persists preference, and suppresses audio calls.
  audio.playTransition(baseState({ phase: "active" }), baseState({ phase: "failed" }));
  assert.equal(scheduled.size, 1);
  audio.setEnabled(false);
  assert.equal(scheduled.size, 0);
  assert.equal(storage.getItem(SOUND_KEY), "off");

  const countWhileMuted = ctx.events.length;
  audio.playStep();
  audio.playTransmit(3, "Severe");
  assert.equal(ctx.events.length, countWhileMuted);

  // Reloading reads persisted mute preference.
  const reloaded = new MissionAudio({ storage, createContext: () => ctx });
  assert.equal(reloaded.enabled, false);
});
