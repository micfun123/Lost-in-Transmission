import { randomBytes } from "node:crypto";
import { CALLSIGNS, MESSAGE_LIMIT, REDACTED, WORD_GROUPS } from "./web/radio.js";

const ROLES = Object.keys(CALLSIGNS);
const WORDS = new Set(Object.values(WORD_GROUPS).flat());
const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const OUTCOMES = new Set(["cleared", "failed", "complete"]);
const MISSION_MS = 600_000;
const ROUND_LIMIT = 8;
const ACTION_POINTS = 4;

const MISSIONS = [
  {
    name: "Dead Drop",
    briefing: "A briefcase is waiting under a table at the red café. Bring it to the fountain. Routine.",
    package: "briefcase", destination: "fountain", decoy: "umbrella", risk: "Light",
    grid: ["...#..D.", ".#.#.#..", ".#......", ".S..E.##", "..#.....", ".#X#..P.", "........", "#..T..#."],
    patrol: [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6]],
  },
  {
    name: "The Courier",
    briefing: "The courier missed their connection. Collect the envelope at the red café and leave it at the station.",
    package: "envelope", destination: "station", decoy: "paper", risk: "Moderate",
    grid: ["..D.....", ".###.#..", "..S#.#P.", ".#...#..", "....##..", ".#X.....", "...#....", ".#...E#."],
    patrol: [[4, 5], [5, 5], [6, 5], [7, 5]],
  },
  {
    name: "Dead Air",
    briefing: "A technician left a recording of ECHO at the red café. Take it to the park before the signal disappears.",
    package: "recording", destination: "park", decoy: "paper", risk: "Heavy",
    grid: ["....#..D", ".##.#.#.", "...#....", ".#...#..", ".#.#...T", "....##..", "..X.....", "S..#...E"],
    patrol: [[4, 2], [5, 2], [6, 2], [7, 2], [7, 3]],
  },
];

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

// Match the original score's rounding, including ties to the even integer.
function signalScore(sent, blocked) {
  if (!sent) return 100;
  const score = 100 * (sent - blocked) / sent;
  const whole = Math.floor(score);
  return score - whole === 0.5 && whole % 2 === 0 ? whole : Math.round(score);
}

export class Room {
  constructor(code, now = () => performance.now()) {
    this.code = code;
    this.now = now;
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
    this.points = ACTION_POINTS;
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
      this.deadline = this.now() + MISSION_MS;
    } else {
      if (this.phase === "cleared") this.missionIndex += 1;
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

    const terms = new Set(tiles);
    const learned = [...terms].filter((term) => this.words.get(term) >= 2);
    learned.sort((left, right) => this.words.get(right) - this.words.get(left) ||
      (left < right ? -1 : 1));
    const blocked = new Set(learned.slice(0, this.missionIndex + 1));
    for (const term of terms) this.words.set(term, (this.words.get(term) ?? 0) + 1);
    const heard = tiles.map((tile) => blocked.has(tile) ? REDACTED : tile);
    this.transmissions.push({ round: this.round, sender: role, sent: tiles, heard });

    if (role === "handler") {
      this.stage = "moves";
    } else if (this.round === ROUND_LIMIT) {
      this.finish("failed", "The last round ended before the drop was made.");
    } else {
      this.round += 1;
      this.points = ACTION_POINTS;
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
      interference: mission.risk, suspicion: this.suspicion, grid,
      round: this.round, round_limit: ROUND_LIMIT, key: this.keys.has(role),
      incoming: this.incoming(role), ready: [...this.ready].sort(),
      seconds: this.deadline === null ? MISSION_MS / 1000 : Math.max(0, this.deadline - now) / 1000,
    };
    if (handler) {
      Object.assign(state, {
        briefing: mission.briefing,
        objective: `${mission.package[0].toUpperCase()}${mission.package.slice(1)} → ${mission.destination}`,
        patrol: mission.patrol, last_seen: this.lastSeen,
      });
    } else {
      Object.assign(state, {
        briefing: "The bureau will send orders over the radio. Recover the package and deliver it at the drop point.",
        objective: "Follow Magpie’s orders", position: this.position, bag: this.bag,
        points: this.points, point_limit: ACTION_POINTS,
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
