import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export const REDACTION_TEXT = "[REDACTED BY PORTSMOUTH MARITIME AUTHORITY]";
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_ALIAS_LENGTH = 40;
export const MAX_BOTTLES = 500;
export const MIN_DRIFT_MS = 15_000;
export const MAX_DRIFT_MS = 45_000;

const SEED_PATH = new URL("../../data/seed-bottles.json", import.meta.url);

const LAUNCH_POINTS = [
  "Old Portsmouth",
  "Southsea Castle",
  "Clarence Pier",
  "Gunwharf Quays",
  "South Parade Pier",
  "Eastney Point",
  "Portsmouth Harbour Mouth",
  "Spice Island",
];

const WAYPOINTS = [
  "Spitbank Fort",
  "Horse Sand Fort",
  "No Man's Land Fort",
  "Gosport Ferry Wake",
  "Ryde Sands",
  "Nab Tower Eddy",
  "Langstone Bar",
  "Frequency 74 Buoy",
  "Round Tower Channel",
  "Stokes Bay Shallows",
];

const LANDING_POINTS = [
  "Southsea Beach",
  "Eastney Beach",
  "Old Portsmouth Shingle",
  "Clarence Esplanade",
  "Southsea Common",
  "Hayling Ferry Slipway",
  "Point Battery",
];

const SO14_INCIDENTS = [
  "WARNING: Brief contact with SO14 Docks (Contamination Logged)",
  "WARNING: Brushed SO14 Container Terminal (Biohazard Advisory)",
  "WARNING: Drifted through SO14 Water Column (Soggy Ink Alert)",
  "WARNING: Sideswiped by an SO14 tugboat (Quarantine Stamp Applied)",
];

const OBITUARIES = [
  "Eaten by an ambitious Southsea seagull.",
  "Stuck in traffic on the M27. Presumed dead.",
  `Washed up in ${REDACTION_TEXT}. Nobody there could read it.`,
  "Pulverised by the 14:15 Isle of Wight hovercraft at 45 knots.",
  "Confiscated by a territorial swan near Langstone Harbour.",
  "Sunk by the sheer wake of the Gosport Ferry during rush hour.",
  "Mistaken for a vintage milk bottle by an overly keen dockyard seagull.",
  "Lost to ECHO static halfway past Spitbank Fort.",
  "Cork failed immediately outside Old Portsmouth. Contents now property of the Solent.",
  "Intercepted by Admiralty customs for carrying unlicensed optimism.",
];

const DEFAULT_ALIASES = [
  "Southsea Pier",
  "Old Portsmouth Watch",
  "Spitbank Lookout",
  "Eastney Signalman",
  "Clarence Esplanade",
  "Station PO1 Desk",
];

export function censorSouthampton(text) {
  return String(text).replace(/southampton/gi, REDACTION_TEXT);
}

function pick(list, random) {
  const index = Math.min(list.length - 1, Math.floor(random() * list.length));
  return list[index];
}

function generateId() {
  return `btl_${randomBytes(3).toString("hex")}`;
}

export function buildDriftLog({ contaminated, launchPoint, random = Math.random }) {
  const launch = launchPoint || pick(LAUNCH_POINTS, random);
  const waypointA = pick(WAYPOINTS, random);
  let waypointB = pick(WAYPOINTS, random);
  if (waypointB === waypointA) {
    waypointB = WAYPOINTS[(WAYPOINTS.indexOf(waypointA) + 1) % WAYPOINTS.length];
  }
  const landing = pick(LANDING_POINTS, random);

  if (contaminated) {
    return [
      `Launched: ${launch}`,
      `Drifted: ${waypointA}`,
      pick(SO14_INCIDENTS, random),
      `Washed up: ${landing}`,
    ];
  }

  return [
    `Launched: ${launch}`,
    `Drifted: ${waypointA}`,
    `Drifted: ${waypointB}`,
    `Washed up: ${landing}`,
  ];
}

export function rollFate(random = Math.random) {
  const roll = random();
  if (roll < 0.65) return "normal";
  if (roll < 0.85) return "contaminated";
  return "lost";
}

export function loadSeedBottles() {
  const raw = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  return raw.map((item) => ({ ...item, seeded: true }));
}

export class BottleOcean {
  constructor({ now = () => Date.now(), random = Math.random, seed = loadSeedBottles() } = {}) {
    this.now = now;
    this.random = random;
    this.bottles = seed.map((bottle) => ({ ...bottle }));
  }

  serialize(bottle) {
    const currentNow = this.now();
    const isLost = bottle.status === "lost";
    const washedUp = !isLost && bottle.washUpAt !== null && currentNow >= bottle.washUpAt;
    const status = isLost ? "lost" : washedUp ? "washed_up" : "drifting";
    const result = {
      id: bottle.id,
      message: bottle.message,
      senderAlias: bottle.senderAlias,
      status,
      contaminated: Boolean(bottle.contaminated),
      driftLog: [...bottle.driftLog],
      washUpAt: bottle.washUpAt,
    };
    if (bottle.thrownAt !== undefined) result.thrownAt = bottle.thrownAt;
    if (isLost) {
      result.obituary = bottle.obituary || bottle.message;
      result.lostAt = bottle.lostAt ?? currentNow;
    } else if (status === "drifting") {
      result.etaMs = Math.max(0, bottle.washUpAt - currentNow);
    }
    return result;
  }

  pruneIfNeeded() {
    while (this.bottles.length >= MAX_BOTTLES) {
      const nonSeedIndex = this.bottles.findIndex((b) => !b.seeded);
      const dropIndex = nonSeedIndex >= 0 ? nonSeedIndex : 0;
      this.bottles.splice(dropIndex, 1);
    }
  }

  throwBottle({ message, senderAlias } = {}) {
    if (typeof message !== "string") {
      return { error: "Message must be a text string.", statusCode: 400 };
    }
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return { error: "Write a message before tossing your bottle into the Solent.", statusCode: 400 };
    }
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return {
        error: `Message is too long for a standard PO1 bottle (max ${MAX_MESSAGE_LENGTH} characters).`,
        statusCode: 400,
      };
    }

    let rawAlias = "";
    if (senderAlias !== undefined && senderAlias !== null) {
      if (typeof senderAlias !== "string") {
        return { error: "Sender alias must be a text string.", statusCode: 400 };
      }
      rawAlias = senderAlias.trim();
      if (rawAlias.length > MAX_ALIAS_LENGTH) {
        return {
          error: `Sender alias is too long (max ${MAX_ALIAS_LENGTH} characters).`,
          statusCode: 400,
        };
      }
    }

    const cleanMessage = censorSouthampton(trimmedMessage);
    const cleanAlias = rawAlias
      ? censorSouthampton(rawAlias)
      : pick(DEFAULT_ALIASES, this.random);
    const censored = cleanMessage !== trimmedMessage || (rawAlias && cleanAlias !== rawAlias);

    const fate = rollFate(this.random);
    const currentNow = this.now();
    const id = generateId();
    const launchPoint = pick(LAUNCH_POINTS, this.random);

    let bottle;
    if (fate === "lost") {
      const obituary = pick(OBITUARIES, this.random);
      const touchedSO14 = obituary.includes(REDACTION_TEXT);
      bottle = {
        id,
        message: cleanMessage,
        senderAlias: cleanAlias,
        status: "lost",
        contaminated: touchedSO14,
        driftLog: [
          `Launched: ${launchPoint}`,
          ...(touchedSO14 ? ["WARNING: Swept into SO14 Sector"] : []),
          `LOST AT SEA: ${obituary}`,
        ],
        obituary,
        lostAt: currentNow,
        thrownAt: currentNow,
        washUpAt: null,
        seeded: false,
      };
    } else {
      const contaminated = fate === "contaminated";
      const driftMs = Math.round(MIN_DRIFT_MS + this.random() * (MAX_DRIFT_MS - MIN_DRIFT_MS));
      bottle = {
        id,
        message: cleanMessage,
        senderAlias: cleanAlias,
        status: "drifting",
        contaminated,
        driftLog: buildDriftLog({ contaminated, launchPoint, random: this.random }),
        thrownAt: currentNow,
        washUpAt: currentNow + driftMs,
        seeded: false,
      };
    }

    this.pruneIfNeeded();
    this.bottles.push(bottle);

    return {
      bottle: this.serialize(bottle),
      fate,
      censored: Boolean(censored),
      ocean: this.getStatus(),
    };
  }

  beachcomb(excludeIds = []) {
    const currentNow = this.now();
    const excluded = new Set(excludeIds);
    const washedUp = this.bottles.filter(
      (bottle) => bottle.status !== "lost" && bottle.washUpAt !== null && currentNow >= bottle.washUpAt,
    );
    if (washedUp.length === 0) return null;

    const fresh = washedUp.filter((bottle) => !excluded.has(bottle.id));
    const pool = fresh.length > 0 ? fresh : washedUp;
    const chosen = pick(pool, this.random);
    return this.serialize(chosen);
  }

  getGraveyard(limit = 10) {
    return this.bottles
      .filter((bottle) => bottle.status === "lost")
      .sort((a, b) => (b.lostAt ?? 0) - (a.lostAt ?? 0))
      .slice(0, limit)
      .map((bottle) => this.serialize(bottle));
  }

  getStatus() {
    const currentNow = this.now();
    let driftingCount = 0;
    let shoreCount = 0;
    let lostCount = 0;
    let contaminatedShoreCount = 0;
    let nextWashUpInMs = null;

    for (const bottle of this.bottles) {
      if (bottle.status === "lost") {
        lostCount += 1;
      } else if (bottle.washUpAt !== null && currentNow >= bottle.washUpAt) {
        shoreCount += 1;
        if (bottle.contaminated) contaminatedShoreCount += 1;
      } else {
        driftingCount += 1;
        if (bottle.washUpAt !== null) {
          const remaining = Math.max(0, bottle.washUpAt - currentNow);
          if (nextWashUpInMs === null || remaining < nextWashUpInMs) {
            nextWashUpInMs = remaining;
          }
        }
      }
    }

    return {
      driftingCount,
      shoreCount,
      lostCount,
      contaminatedShoreCount,
      nextWashUpInMs,
    };
  }
}
