import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import {
  BottleOcean,
  MAX_DRIFT_MS,
  MIN_DRIFT_MS,
  REDACTION_TEXT,
  censorSouthampton,
  rollFate,
} from "../apps/bottles/drift.js";
import { createGameServer } from "../server.js";

test("censors Southampton case-insensitively across messages and aliases", () => {
  assert.equal(
    censorSouthampton("Sailing from Southampton past SOUTHAMPTON docks"),
    `Sailing from ${REDACTION_TEXT} past ${REDACTION_TEXT} docks`,
  );
  assert.equal(censorSouthampton("Portsmouth Harbour is clear"), "Portsmouth Harbour is clear");
});

test("rolls normal, SO14 contaminated, and lost-at-sea fates at expected thresholds", () => {
  assert.equal(rollFate(() => 0.0), "normal");
  assert.equal(rollFate(() => 0.649), "normal");
  assert.equal(rollFate(() => 0.65), "contaminated");
  assert.equal(rollFate(() => 0.849), "contaminated");
  assert.equal(rollFate(() => 0.85), "lost");
  assert.equal(rollFate(() => 0.999), "lost");
});

test("bottles drift for 15-45s and wash ashore once washUpAt passes", () => {
  let currentTime = 1_760_000_000_000;
  const rolls = [0.2, 0.5, 0.1, 0.2, 0.3, 0.4, 0.5];
  let idx = 0;
  const random = () => rolls[idx++ % rolls.length];

  const ocean = new BottleOcean({ now: () => currentTime, random, seed: [] });
  assert.equal(ocean.beachcomb(), null);

  const thrown = ocean.throwBottle({
    message: "Hello from Southampton pier!",
    senderAlias: "Southsea Watch",
  });
  assert.equal(thrown.fate, "normal");
  assert.equal(thrown.censored, true);
  assert.equal(thrown.bottle.status, "drifting");
  assert.equal(thrown.bottle.contaminated, false);
  assert.ok(thrown.bottle.message.includes(REDACTION_TEXT));
  assert.ok(thrown.bottle.washUpAt >= currentTime + MIN_DRIFT_MS);
  assert.ok(thrown.bottle.washUpAt <= currentTime + MAX_DRIFT_MS);

  // Not yet washed up
  assert.equal(ocean.beachcomb(), null);
  assert.equal(ocean.getStatus().driftingCount, 1);
  assert.equal(ocean.getStatus().shoreCount, 0);

  // Advance clock past washUpAt
  currentTime = thrown.bottle.washUpAt;
  const recovered = ocean.beachcomb();
  assert.equal(recovered.id, thrown.bottle.id);
  assert.equal(recovered.status, "washed_up");
  assert.equal(ocean.getStatus().driftingCount, 0);
  assert.equal(ocean.getStatus().shoreCount, 1);
});

test("contaminated and lost-at-sea bottles behave according to spec", () => {
  let currentTime = 1_760_000_000_000;
  const oceanContaminated = new BottleOcean({
    now: () => currentTime,
    random: () => 0.72,
    seed: [],
  });
  const cont = oceanContaminated.throwBottle({ message: "Damp dispatch" });
  assert.equal(cont.fate, "contaminated");
  assert.equal(cont.bottle.contaminated, true);
  assert.ok(cont.bottle.driftLog.some((line) => line.includes("SO14")));

  const oceanLost = new BottleOcean({
    now: () => currentTime,
    random: () => 0.92,
    seed: [],
  });
  const lost = oceanLost.throwBottle({ message: "Doomed dispatch", senderAlias: "Spitbank" });
  assert.equal(lost.fate, "lost");
  assert.equal(lost.bottle.status, "lost");
  assert.ok(lost.bottle.obituary.length > 0);
  assert.equal(oceanLost.beachcomb(), null);
  const graveyard = oceanLost.getGraveyard(10);
  assert.equal(graveyard.length, 1);
  assert.equal(graveyard[0].id, lost.bottle.id);
});

test("bottles HTTP API supports throw, beachcomber exclude, graveyard, status, and validation", async (t) => {
  let currentTime = 1_760_000_000_000;
  const server = createGameServer({
    bottles: { now: () => currentTime, random: () => 0.9 },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;

  // Pre-seeded beachcomber works immediately
  const first = await fetch(`${base}/api/bottles/beachcomber`);
  assert.equal(first.status, 200);
  const firstData = await first.json();
  assert.equal(firstData.bottle.status, "washed_up");
  assert.ok(firstData.ocean.shoreCount >= 10);

  // Exclude avoids immediate repeat
  const second = await fetch(`${base}/api/bottles/beachcomber?exclude=${encodeURIComponent(firstData.bottle.id)}`);
  assert.equal(second.status, 200);
  const secondData = await second.json();
  assert.notEqual(secondData.bottle.id, firstData.bottle.id);

  // Throw a bottle (with random=0.9 -> lost at sea, immediately enters graveyard)
  const thrown = await fetch(`${base}/api/bottles/throw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "No love for Southampton!", senderAlias: "Pompey Desk" }),
  });
  assert.equal(thrown.status, 201);
  const thrownData = await thrown.json();
  assert.equal(thrownData.fate, "lost");
  assert.equal(thrownData.censored, true);
  assert.ok(thrownData.bottle.message.includes(REDACTION_TEXT));

  // Graveyard returns newest first, capped at 10
  const graveyard = await fetch(`${base}/api/bottles/graveyard`);
  assert.equal(graveyard.status, 200);
  const graveyardData = await graveyard.json();
  assert.ok(graveyardData.obituaries.length >= 1 && graveyardData.obituaries.length <= 10);
  assert.equal(graveyardData.obituaries[0].id, thrownData.bottle.id);

  // Validation & hardening checks
  const emptyMsg = await fetch(`${base}/api/bottles/throw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "   " }),
  });
  assert.equal(emptyMsg.status, 400);

  const tooBig = await fetch(`${base}/api/bottles/throw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(5000) }),
  });
  assert.equal(tooBig.status, 413);

  const wrongMethod = await fetch(`${base}/api/bottles/throw`, { method: "GET" });
  assert.equal(wrongMethod.status, 405);
});
