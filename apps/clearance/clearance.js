import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "po1_clearance";
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const MAX_CHALLENGES = 1000;
export const DIAL_MIN_MHZ = 70.0;
export const DIAL_MAX_MHZ = 79.0;
export const FREQUENCY_TOLERANCE_MHZ = 0.25;
export const HOLD_REQUIRED_MS = 1400;
const MAX_BODY_BYTES = 4096;

export const LEGIT_CARDS = Object.freeze([
  {
    id: "spitbank-log",
    icon: "fort",
    title: "Spitbank Fort Logbook",
    subtitle: "Official Solent sea-fort watch ledger",
    legit: true,
  },
  {
    id: "southsea-beacon",
    icon: "beacon",
    title: "Southsea Castle Beacon",
    subtitle: "Admiralty coastal signal lantern",
    legit: true,
  },
  {
    id: "gosport-ferry",
    icon: "ferry",
    title: "Gosport Ferry Ticket",
    subtitle: "Stamped Harbour Mouth crossing pass",
    legit: true,
  },
  {
    id: "portsmouth-tide",
    icon: "compass",
    title: "Old Portsmouth Tide Chart",
    subtitle: "Certified PO1 shingle drift table",
    legit: true,
  },
  {
    id: "freq74-key",
    icon: "keycard",
    title: "Frequency 74 Keycard",
    subtitle: "Magpie and Wren authorized cipher slip",
    legit: true,
  },
  {
    id: "solent-bottle",
    icon: "bottle",
    title: "Sealed Solent Bottle",
    subtitle: "Regulation corked Station PO1 dispatch",
    legit: true,
  },
  {
    id: "clarence-pass",
    icon: "anchor",
    title: "Clarence Pier Pass",
    subtitle: "Portsmouth Harbour duty officer badge",
    legit: true,
  },
  {
    id: "watchroom-tea",
    icon: "tea",
    title: "Station PO1 Tea Tin",
    subtitle: "Ministry-approved watchroom rations",
    legit: true,
  },
]);

export const DECOY_CARDS = Object.freeze([
  {
    id: "so14-container",
    icon: "container",
    title: "SO14 Container Pass",
    subtitle: "Unlicensed Southampton Docks manifest",
    legit: false,
  },
  {
    id: "southampton-slip",
    icon: "envelope",
    title: "Southampton Postcode",
    subtitle: "Quarantined SO14 forwarding address",
    legit: false,
  },
  {
    id: "m27-citation",
    icon: "cone",
    title: "M27 Traffic Citation",
    subtitle: "Stuck near Junction 7 since 1974",
    legit: false,
  },
  {
    id: "echo-jammer",
    icon: "jammer",
    title: "ECHO Static Jammer",
    subtitle: "Unregistered frequency interceptor",
    legit: false,
  },
  {
    id: "southsea-gull",
    icon: "gull",
    title: "Suspicious Seagull",
    subtitle: "Known serial thief of Southsea chips",
    legit: false,
  },
  {
    id: "itchen-toll",
    icon: "bridge",
    title: "Itchen Bridge Toll",
    subtitle: "Foreign river crossing receipt",
    legit: false,
  },
  {
    id: "redacted-tape",
    icon: "tape",
    title: "Redacted Cipher Tape",
    subtitle: "Tainted by hostile word repetition",
    legit: false,
  },
  {
    id: "so14-tugboat",
    icon: "tug",
    title: "SO14 Tugboat Log",
    subtitle: "Smells faintly of Southampton Water",
    legit: false,
  },
  {
    id: "robot-claw",
    icon: "bot",
    title: "Automated Clicking Arm",
    subtitle: "Definitely not a human duty officer",
    legit: false,
  },
  {
    id: "rogue-hovercraft",
    icon: "hovercraft",
    title: "Rogue Hovercraft Wake",
    subtitle: "Flattens regulation bottles at 45 knots",
    legit: false,
  },
  {
    id: "langstone-swan",
    icon: "swan",
    title: "Territorial Swan",
    subtitle: "Confiscates unguarded bureau paperwork",
    legit: false,
  },
  {
    id: "red-white-scarf",
    icon: "scarf",
    title: "Red-and-White Scarf",
    subtitle: "Contraband football knitwear, SO14",
    legit: false,
  },
]);

const REJECTION_STAMPS = Object.freeze([
  "SO14 SUSPECTED",
  "QUARANTINE FLAG",
  "CUSTOMS DENIAL",
  "M27 DETOUR LOGGED",
  "ECHO IMPERSONATOR",
]);

const FILING_CODES = Object.freeze([
  "FILE 14-A",
  "FILE 27-C",
  "FILE 33-F",
  "FILE 41-B",
  "FILE 58-D",
  "FILE 62-E",
  "FILE 74-G",
  "FILE 83-H",
  "FILE 91-K",
]);

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        settled = true;
        reject({ statusCode: 413, message: "Request body too large." });
        request.resume();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject({ statusCode: 400, message: "Expected a JSON object body." });
          return;
        }
        resolve(parsed);
      } catch {
        reject({ statusCode: 400, message: "Invalid JSON body." });
      }
    });

    request.on("error", () => {
      if (settled) return;
      settled = true;
      reject({ statusCode: 400, message: "Failed to read request body." });
    });
  });
}

export function parseCookies(cookieHeader) {
  const cookies = new Map();
  if (typeof cookieHeader !== "string" || !cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

function shuffle(items, pickInt = randomInt) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = pickInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dealCustomsGrid(pickInt = randomInt) {
  const chosenLegit = shuffle(LEGIT_CARDS, pickInt).slice(0, 3);
  const chosenDecoys = shuffle(DECOY_CARDS, pickInt).slice(0, 6);
  const combined = shuffle([...chosenLegit, ...chosenDecoys], pickInt);
  const codes = shuffle(FILING_CODES, pickInt);

  const grid = combined.map((card, index) => ({
    id: card.id,
    code: codes[index],
    icon: card.icon,
    title: card.title,
    subtitle: card.subtitle,
  }));
  const validIds = new Set(chosenLegit.map((card) => card.id));
  return { grid, validIds };
}

function pickTargetFrequency(pickInt = randomInt) {
  // Pick between 71.2 MHz and 77.8 MHz in 0.2 MHz steps so ECHO can nudge both ways safely.
  const steps = 34; // 71.2 + 33 * 0.2 = 77.8
  const step = pickInt(steps);
  return Number((71.2 + step * 0.2).toFixed(1));
}

function isSecureRequest(request) {
  return request.headers["x-forwarded-proto"] === "https" || Boolean(request.socket?.encrypted);
}

export function createClearanceRouter(options = {}) {
  const now = options.now ?? (() => Date.now());
  const pickInt = options.randomInt ?? randomInt;
  const secretBuffer = Buffer.from(
    options.secret ?? process.env.CLEARANCE_SECRET ?? randomBytes(32).toString("hex"),
    "utf8",
  );
  const challenges = new Map();

  function signPayload(payload) {
    return createHmac("sha256", secretBuffer).update(payload).digest("base64url");
  }

  function createCookieValue(officerId) {
    const nonce = randomBytes(12).toString("base64url");
    const payload = `${officerId}.${nonce}`;
    const signature = signPayload(payload);
    return `${payload}.${signature}`;
  }

  function verifyCookieValue(value) {
    if (typeof value !== "string") return false;
    const parts = value.split(".");
    if (parts.length !== 3) return false;
    const [officerId, nonce, providedSig] = parts;
    if (!officerId || !nonce || !providedSig) return false;
    const expectedSig = signPayload(`${officerId}.${nonce}`);
    const providedBuf = Buffer.from(providedSig, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  }

  function hasValidClearance(request) {
    const cookies = parseCookies(request.headers?.cookie);
    const token = cookies.get(COOKIE_NAME);
    return verifyCookieValue(token);
  }

  function pruneChallenges() {
    const current = now();
    for (const [id, entry] of challenges) {
      if (entry.expiresAt <= current) challenges.delete(id);
    }
    while (challenges.size >= MAX_CHALLENGES) {
      const oldestKey = challenges.keys().next().value;
      if (oldestKey === undefined) break;
      challenges.delete(oldestKey);
    }
  }

  function issueChallenge() {
    pruneChallenges();
    const challengeId = `po1_${randomBytes(12).toString("base64url")}`;
    const targetFrequency = pickTargetFrequency(pickInt);
    const { grid, validIds } = dealCustomsGrid(pickInt);
    const entry = {
      id: challengeId,
      targetFrequency,
      grid,
      validIds,
      attempts: 0,
      expiresAt: now() + CHALLENGE_TTL_MS,
    };
    challenges.set(challengeId, entry);
    return {
      challengeId,
      targetFrequency,
      dialMin: DIAL_MIN_MHZ,
      dialMax: DIAL_MAX_MHZ,
      tolerance: FREQUENCY_TOLERANCE_MHZ,
      holdRequiredMs: HOLD_REQUIRED_MS,
      grid,
    };
  }

  function buildSetCookieHeader(value, request, clear = false) {
    const parts = [
      `${COOKIE_NAME}=${clear ? "" : value}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (clear) parts.push("Max-Age=0");
    if (isSecureRequest(request)) parts.push("Secure");
    return parts.join("; ");
  }

  async function handle(request, response, url) {
    const { pathname } = url;

    if (pathname === "/api/clearance/challenge") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed. Use POST." }, { Allow: "POST" });
        return true;
      }
      sendJson(response, 200, issueChallenge());
      return true;
    }

    if (pathname === "/api/clearance/verify") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed. Use POST." }, { Allow: "POST" });
        return true;
      }
      let body;
      try {
        body = await readJsonBody(request);
      } catch (err) {
        sendJson(response, err.statusCode ?? 400, { ok: false, error: err.message ?? "Bad request." });
        return true;
      }

      const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
      const entry = challenges.get(challengeId);
      if (!entry || entry.expiresAt <= now()) {
        if (entry) challenges.delete(challengeId);
        const fresh = issueChallenge();
        sendJson(response, 400, {
          ok: false,
          expired: true,
          stamp: "FORM EXPIRED",
          reason: "Your clearance slip timed out on the clipboard. A fresh form has been issued.",
          challenge: fresh,
        });
        return true;
      }

      if (body.gullShooed !== true) {
        sendJson(response, 400, {
          ok: false,
          stage: "humanity",
          stamp: "GULL STILL PRESENT",
          reason: "Form PO1-A is incomplete. Shoo the Southsea seagull off your tick first.",
        });
        return true;
      }

      const tunedFrequency = Number(body.tunedFrequency);
      const holdMs = Number(body.holdMs);
      const frequencyDelta = Math.abs(tunedFrequency - entry.targetFrequency);
      if (
        !Number.isFinite(tunedFrequency)
        || !Number.isFinite(holdMs)
        || frequencyDelta > FREQUENCY_TOLERANCE_MHZ + 0.001
        || holdMs < HOLD_REQUIRED_MS
      ) {
        sendJson(response, 400, {
          ok: false,
          stage: "radio",
          stamp: "CARRIER UNLOCKED",
          reason: `Form PO1-B requires holding ${entry.targetFrequency.toFixed(1)} MHz through ECHO static.`,
        });
        return true;
      }

      const selected = Array.isArray(body.selectedIds)
        ? [...new Set(body.selectedIds.filter((id) => typeof id === "string"))]
        : [];
      const exactMatch = selected.length === entry.validIds.size
        && selected.every((id) => entry.validIds.has(id));

      if (!exactMatch) {
        const stamp = REJECTION_STAMPS[entry.attempts % REJECTION_STAMPS.length];
        entry.attempts += 1;
        const wrongIds = new Set(selected.filter((id) => !entry.validIds.has(id)));
        const removedIds = [];
        entry.grid = entry.grid.filter((card) => {
          if (wrongIds.has(card.id)) {
            removedIds.push(card.id);
            return false;
          }
          return true;
        });
        entry.expiresAt = now() + CHALLENGE_TTL_MS;

        let reason;
        if (removedIds.length === 0) {
          reason = "Manifest incomplete. Stamp all 3 genuine Station PO1 items.";
        } else if (entry.grid.length === entry.validIds.size) {
          reason = "All contraband confiscated. Only the 3 genuine Station PO1 items remain — stamp them to clear customs.";
        } else if (removedIds.length === 1) {
          reason = "1 contraband item confiscated from your desk. Stamp the 3 genuine Station PO1 items.";
        } else {
          reason = `${removedIds.length} contraband items confiscated from your desk. Stamp the 3 genuine Station PO1 items.`;
        }

        sendJson(response, 400, {
          ok: false,
          stage: "customs",
          stamp,
          reason,
          grid: entry.grid,
          removedIds,
        });
        return true;
      }

      challenges.delete(challengeId);
      const officerId = `PO1-${randomInt(100, 999)}`;
      const cookieValue = createCookieValue(officerId);
      sendJson(
        response,
        200,
        {
          ok: true,
          stamp: "CLEARANCE GRANTED // PO1",
          officerId,
        },
        {
          "Set-Cookie": buildSetCookieHeader(cookieValue, request, false),
        },
      );
      return true;
    }

    if (pathname === "/api/clearance/reset") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed. Use POST." }, { Allow: "POST" });
        return true;
      }
      sendJson(
        response,
        200,
        { ok: true },
        {
          "Set-Cookie": buildSetCookieHeader("", request, true),
        },
      );
      return true;
    }

    return false;
  }

  return {
    handle,
    hasValidClearance,
  };
}
