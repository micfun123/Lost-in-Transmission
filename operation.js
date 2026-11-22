// Game rules for one room: missions, turns, ECHO, and what each role is allowed to see.
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { CALLSIGNS, MESSAGE_LIMIT, REDACTED, WORD_GROUPS } from "./web/radio.js";

const ROLES = Object.keys(CALLSIGNS);
const WORDS = new Set(Object.values(WORD_GROUPS).flat());
const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const OUTCOMES = new Set(["cleared", "failed", "complete"]);
// Settings a level file may leave out.
const LEVEL_DEFAULTS = { minutes: 10, rounds: 8, actionPoints: 4, echoChance: 0.25, echoMaxStatic: 2 };
const JAM_CHANCE_LIMIT = 0.6;

const LEVELS = new URL("./levels/", import.meta.url);
// Map letters the browser knows how to draw (MAP_TILES in web/screens.js).
const TILES = new Set([".", "#", "S", "D", "X", "E", "P", "T"]);
const TEXT_FIELDS = ["name", "briefing", "package", "destination", "decoy", "risk", "dropLabel"];

// Throws a readable error for anything that would crash or soft-lock a game, so a bad level
// stops the server at startup (and fails CI) instead of breaking a room mid-case.
export function checkLevel(level) {
  for (const field of TEXT_FIELDS) {
    if (typeof level[field] !== "string" || !level[field]) throw new Error(`"${field}" must be some text`);
  }
  for (const field of ["package", "destination", "decoy"]) {
    if (!WORDS.has(level[field].toUpperCase())) throw new Error(`"${field}" must be a radio word in web/radio.js`);
  }
  const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!positive(level.minutes)) throw new Error('"minutes" must be a number above 0');
  for (const field of ["rounds", "actionPoints"]) {
    if (!Number.isInteger(level[field]) || level[field] < 1) throw new Error(`"${field}" must be a whole number of 1 or more`);
  }
  if (typeof level.echoChance !== "number" || !(level.echoChance >= 0 && level.echoChance <= 1)) {
    throw new Error('"echoChance" must be a number from 0 to 1');
  }
  if (!Number.isInteger(level.echoMaxStatic) || level.echoMaxStatic < 0) {
    throw new Error('"echoMaxStatic" must be a whole number of 0 or more');
  }
  const { grid, patrol } = level;
  const size = (count) => Number.isInteger(count) && count >= 5 && count <= 12;
  if (!Array.isArray(grid) || !size(grid.length) || grid.some((row) => typeof row !== "string" || row.length !== grid[0].length) ||
      !size(grid[0].length)) {
    throw new Error('"grid" must be 5 to 12 rows, all the same length of 5 to 12 characters');
  }
  const letters = grid.join("");
  const unknown = [...letters].find((tile) => !TILES.has(tile));
  if (unknown) throw new Error(`"grid" has an unknown letter "${unknown}"`);
  for (const marker of ["S", "D", "X", "E"]) {
    if (letters.split(marker).length !== 2) throw new Error(`"grid" needs exactly one "${marker}"`);
  }
  const street = ([x, y]) => grid[y]?.[x] !== undefined && grid[y][x] !== "#";
  if (!Array.isArray(patrol) || patrol.length < 2) throw new Error('"patrol" needs at least 2 squares');
  patrol.forEach((square, index) => {
    if (!Array.isArray(square) || square.length !== 2 || !street(square)) {
      throw new Error(`"patrol" square ${index + 1} must be an [x, y] on the map, not a wall`);
    }
    const previous = patrol[index - 1];
    if (previous && Math.abs(square[0] - previous[0]) + Math.abs(square[1] - previous[1]) !== 1) {
      throw new Error(`"patrol" square ${index + 1} must be next to square ${index}`);
    }
  });
  const reached = new Set([site(level, "S").join()]);
  const queue = [site(level, "S")];
  for (const [x, y] of queue) {
    for (const [dx, dy] of Object.values(DIRECTIONS)) {
      const next = [x + dx, y + dy];
      if (street(next) && !reached.has(next.join())) {
        reached.add(next.join());
        queue.push(next);
      }
    }
  }
  for (const marker of ["D", "E"]) {
    if (!reached.has(site(level, marker).join())) throw new Error(`Wren can't walk from "S" to "${marker}"`);
  }
}

export const MISSIONS = readdirSync(LEVELS).filter((file) => file.endsWith(".json")).sort().map((file) => {
  try {
    const level = { ...LEVEL_DEFAULTS, ...JSON.parse(readFileSync(new URL(file, LEVELS), "utf8")) };
    checkLevel(level);
    return level;
  } catch (error) {
    throw new Error(`levels/${file}: ${error.message}`);
  }
});
if (!MISSIONS.length) throw new Error("levels/ has no level files");

function site(mission, marker) {
  const row = mission.grid.findIndex((line) => line.includes(marker));
  return [mission.grid[row].indexOf(marker), row];
}

function samePosition(left, right) {
  return right !== null && left[0] === right[0] && left[1] === right[1];
}

function redactionCount(tiles) {
  return tiles.filter((tile) => tile === REDACTED).length;
}

function signalScore(sent, blocked) {
  return sent ? Math.round(100 * (sent - blocked) / sent) : 100;
}

export class Room {
  constructor(code, now = () => performance.now(), random = Math.random) {
    this.code = code;
    this.now = now;
    this.random = random;
    this.tokens = new Map();
    this.peers = new Map();
    this.missionIndex = 0;
    this.words = new Map();
    this.emptySince = null;
    this.prepareCase();
    this.phase = "lobby";
  }

  get mission() {
    return MISSIONS[this.missionIndex];
  }

  get paired() {
    return this.peers.size === ROLES.length;
  }

  get guard() {
    const route = this.mission.patrol;
    const period = (route.length - 1) * 2;
    const step = this.patrolStep % period;
    return route[Math.min(step, period - step)];
  }

  connect(role, peer) {
    if (!this.tokens.has(role)) this.tokens.set(role, randomBytes(24).toString("base64url"));
    this.peers.set(role, peer);
    this.emptySince = null;
    if (this.paired && this.phase === "lobby") {
      this.phase = "briefing";
    } else if (this.paired && this.pausedAt !== null) {
      this.deadline += this.now() - this.pausedAt;
      this.pausedAt = null;
    }
    return this.tokens.get(role);
  }

  disconnect(role) {
    this.peers.delete(role);
    this.ready.delete(role);
    if (this.phase === "active" && this.pausedAt === null) this.pausedAt = this.now();
    if (this.peers.size === 0) this.emptySince = this.now();
  }

  prepareCase() {
    this.phase = "briefing";
    this.stage = "order";
    this.round = 1;
    this.points = this.mission.actionPoints;
    this.position = site(this.mission, "S");
    this.packageAt = site(this.mission, "D");
    this.decoyAt = site(this.mission, "X");
    this.destination = site(this.mission, "E");
    this.bag = null;
    this.patrolStep = 0;
    this.suspicion = 0;
    this.peakSuspicion = 0;
    this.lastSeen = null;
    this.keys = new Set(ROLES);
    this.decoded = new Map();
    this.transmissions = [];
    this.activity = {};
    this.ready = new Set();
    this.deadline = null;
    this.pausedAt = null;
    this.finishedAt = null;
    this.result = "";
  }

  confirm(role) {
    this.ready.add(role);
    if (this.ready.size !== ROLES.length) return [true, ""];
    if (this.phase === "briefing") {
      this.ready.clear();
      this.phase = "active";
      this.deadline = this.now() + this.mission.minutes * 60_000;
    } else {
      if (this.phase === "cleared") {
        this.missionIndex += 1;
        // ECHO's memory fades between cases so later cases don't open fully jammed.
        for (const [term, count] of this.words) this.words.set(term, Math.floor(count / 2));
      }
      if (this.phase === "complete") {
        this.missionIndex = 0;
        this.words.clear();
      }
      this.prepareCase();
    }
    return [true, ""];
  }

  expireMission() {
    if (this.phase !== "active" || !this.paired || this.now() < this.deadline) return false;
    this.finish("failed", "Time ran out. The drop went cold.");
    return true;
  }

  finish(phase, result) {
    this.phase = phase;
    this.result = result;
    this.finishedAt = this.now();
  }

  command(role, data) {
    let action = data.type;
    if (!this.paired) return [false, "Waiting for your partner."];
    if (action === "ready" && (this.phase === "briefing" || OUTCOMES.has(this.phase))) {
      return this.confirm(role);
    }
    if (this.phase !== "active") return [false, "The channel is on hold."];
    if (action === "decrypt") return this.decrypt(role);
    if (action === "radio") return this.transmit(role, data.tiles);
    if (role !== "agent" || this.stage !== "moves") return [false, "Wait for the next order."];
    if (action === "end_moves") {
      this.stage = "report";
      return [true, ""];
    }
    if (this.points === 0) return [false, "No action points left this round."];
    if (action === "move") return this.move(data.direction);
    if (action === "interact") action = this.bag ? "drop" : "take";
    if (["take", "drop", "use", "wait"].includes(action)) return this.act(action);
    return [false, "That action is unavailable."];
  }

  move(direction) {
    if (typeof direction !== "string" || !Object.hasOwn(DIRECTIONS, direction)) return [false, ""];
    const [dx, dy] = DIRECTIONS[direction];
    const [x, y] = [this.position[0] + dx, this.position[1] + dy];
    const tile = this.mission.grid[y]?.[x];
    if (tile === undefined || tile === "#") return [false, ""];
    this.position = [x, y];
    this.spendPoint();
    return [true, ""];
  }

  act(action) {
    const mission = this.mission;
    if (action === "take") {
      if (this.bag) return [false, "Your bag is full."];
      if (samePosition(this.position, this.packageAt)) {
        this.bag = mission.package;
        this.packageAt = null;
      } else if (samePosition(this.position, this.decoyAt)) {
        this.bag = mission.decoy;
        this.decoyAt = null;
        this.raiseSuspicion(15);
      } else {
        return [false, "There is nothing to take here."];
      }
      this.record(`Took the ${this.bag}.`);
    } else if (action === "drop") {
      if (!this.bag) return [false, "Your bag is empty."];
      if (this.bag === mission.package && samePosition(this.position, this.destination)) {
        this.points -= 1;
        this.bag = null;
        this.record(`Delivered the ${mission.package}.`);
        const outcome = this.missionIndex === MISSIONS.length - 1 ? "complete" : "cleared";
        this.finish(outcome, `The ${mission.package} reached the ${mission.destination}.`);
        return [true, ""];
      }
      if (this.bag === mission.package) {
        this.packageAt = this.position;
      } else {
        this.decoyAt = this.position;
      }
      this.record(`Dropped the ${this.bag}.`);
      this.bag = null;
    } else if (action === "use") {
      if (this.bag !== mission.decoy) return [false, "A decoy item can lower suspicion."];
      this.bag = null;
      this.suspicion = Math.max(0, this.suspicion - 15);
      this.record(`Blended in using the ${mission.decoy}.`);
    }
    this.spendPoint();
    return [true, ""];
  }

  record(text) {
    (this.activity[this.round] ??= []).push(text);
  }

  raiseSuspicion(amount) {
    this.suspicion = Math.min(100, this.suspicion + amount);
    this.peakSuspicion = Math.max(this.peakSuspicion, this.suspicion);
    if (this.suspicion === 100) this.finish("failed", "The guard recognised Wren. Cover blown.");
  }

  spendPoint() {
    this.points -= 1;
    this.patrolStep += 1;
    const [gx, gy] = this.guard;
    const [x, y] = this.position;
    if (Math.abs(gx - x) + Math.abs(gy - y) > 1) return;
    if (this.lastSeen?.round !== this.round) {
      this.record("The guard spotted Wren.");
      this.raiseSuspicion(25);
    }
    this.lastSeen = { position: this.position, round: this.round };
  }

  transmit(role, tiles) {
    const expected = { order: "handler", moves: null, report: "agent" };
    if (expected[this.stage] !== role) return [false, "Your partner has the channel."];
    if (!Array.isArray(tiles) || tiles.length < 1 || tiles.length > MESSAGE_LIMIT ||
        tiles.some((tile) => !WORDS.has(tile))) {
      return [false, "Choose one to six radio tiles."];
    }

    // A word heard in 2+ earlier messages may be jammed, more often the more it's used.
    const { echoChance, echoMaxStatic } = this.mission;
    const terms = new Set(tiles);
    const jammed = new Set([...terms].filter((term) => (this.words.get(term) ?? 0) >= 2 &&
      this.random() < Math.min(JAM_CHANCE_LIMIT, echoChance * (this.words.get(term) - 1))));
    for (const term of terms) this.words.set(term, (this.words.get(term) ?? 0) + 1);
    let budget = Math.min(echoMaxStatic, Math.max(1, Math.floor(tiles.length / 2)));
    const heard = tiles.map((tile) => jammed.has(tile) && budget-- > 0 ? REDACTED : tile);
    this.transmissions.push({ round: this.round, sender: role, sent: tiles, heard });

    if (role === "handler") {
      this.stage = "moves";
    } else if (this.round === this.mission.rounds) {
      this.finish("failed", "The last round ended before the drop was made.");
    } else {
      this.round += 1;
      this.points = this.mission.actionPoints;
      this.stage = "order";
    }
    return [true, ""];
  }

  decrypt(role) {
    const message = this.incoming(role);
    const tile = message?.tiles.indexOf(REDACTED) ?? -1;
    if (!this.keys.has(role) || tile === -1) return [false, "There is no intercepted tile to decrypt."];
    this.keys.delete(role);
    this.decoded.set(message.number - 1, tile);
    this.record(`${CALLSIGNS[role]} used their decrypt key.`);
    return [true, ""];
  }

  incoming(role) {
    const index = this.transmissions.findLastIndex((message) => message.sender !== role);
    if (index === -1) return null;
    const message = this.transmissions[index];
    const tiles = [...message.heard];
    if (this.decoded.has(index)) {
      const tile = this.decoded.get(index);
      tiles[tile] = message.sent[tile];
    }
    return { number: index + 1, round: message.round, sender: CALLSIGNS[message.sender], tiles };
  }

  snapshot(role) {
    const mission = this.mission;
    const handler = role === "handler";
    const [x, y] = this.position;
    const visible = (col, row) => Math.abs(col - x) <= 1 && Math.abs(row - y) <= 1;
    const grid = handler ? mission.grid : mission.grid.map((line, row) =>
      [...line].map((tile, col) => visible(col, row) ? tile : "?").join(""));
    const now = this.finishedAt ?? this.pausedAt ?? this.now();
    const state = {
      type: "state", role, code: this.code, phase: this.phase, stage: this.stage,
      paired: this.paired, mission: this.missionIndex + 1, name: mission.name,
      next_case: MISSIONS[this.missionIndex + 1]?.name ?? null,
      drop_label: mission.dropLabel,
      interference: mission.risk, suspicion: this.suspicion, grid,
      round: this.round, round_limit: mission.rounds, key: this.keys.has(role),
      incoming: this.incoming(role), ready: [...this.ready].sort(),
      seconds: this.deadline === null ? mission.minutes * 60 : Math.max(0, this.deadline - now) / 1000,
    };
    if (handler) {
      Object.assign(state, {
        briefing: mission.briefing,
        objective: `${mission.package[0].toUpperCase()}${mission.package.slice(1)} → ${mission.destination}`,
        package: mission.package, patrol: mission.patrol, last_seen: this.lastSeen,
      });
    } else {
      Object.assign(state, {
        briefing: "The bureau will send orders over the radio. Recover the package and deliver it at the drop point.",
        objective: "Follow Magpie’s orders", position: this.position, bag: this.bag,
        points: this.points, point_limit: mission.actionPoints,
        guard: visible(...this.guard) ? this.guard : null,
      });
    }
    if (OUTCOMES.has(this.phase)) {
      const sent = this.transmissions.reduce((sum, entry) => sum + entry.sent.length, 0);
      const blocked = this.transmissions.reduce((sum, entry) => sum + redactionCount(entry.heard), 0);
      Object.assign(state, {
        result: this.result, peak_suspicion: this.peakSuspicion, signal: signalScore(sent, blocked),
        transmissions: this.transmissions, activity: this.activity,
      });
    }
    return state;
  }
}
