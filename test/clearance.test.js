import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CHALLENGE_TTL_MS,
  COOKIE_NAME,
  DECOY_CARDS,
  LEGIT_CARDS,
  createClearanceRouter,
  parseCookies,
} from "../apps/clearance/clearance.js";
import { createGameServer } from "../server.js";

test("parseCookies extracts named cookie values safely", () => {
  const cookies = parseCookies(`foo=bar; ${COOKIE_NAME}=PO1-123.abc.sig==; theme=dark`);
  assert.equal(cookies.get("foo"), "bar");
  assert.equal(cookies.get(COOKIE_NAME), "PO1-123.abc.sig==");
  assert.equal(cookies.get("theme"), "dark");
  assert.equal(parseCookies("").size, 0);
});

test("every card icon in LEGIT_CARDS and DECOY_CARDS is defined in clearance.js", () => {
  const clientSource = readFileSync(
    new URL("../apps/clearance/public/clearance.js", import.meta.url),
    "utf8",
  );
  for (const card of [...LEGIT_CARDS, ...DECOY_CARDS]) {
    assert.ok(
      clientSource.includes(`  ${card.icon}: \``),
      `Missing SVG icon definition for "${card.icon}"`,
    );
  }
});

test("expires stale challenges, rotates Beat 3 rejection stamps, and validates HTTP methods", async (t) => {
  let clock = 1_000_000;
  const server = createGameServer({
    clearance: {
      now: () => clock,
      secret: "station-po1-shared-test-secret",
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;

  // Wrong HTTP methods return 405 and unknown routes return 404 JSON.
  for (const path of ["/api/clearance/challenge", "/api/clearance/verify", "/api/clearance/reset"]) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
  }
  const unknown = await fetch(`${base}/api/clearance/unknown`, { method: "POST" });
  assert.equal(unknown.status, 404);

  // Issue challenge and trigger two consecutive Beat 3 rejections to verify rotating stamps.
  const challenge = await (await fetch(`${base}/api/clearance/challenge`, { method: "POST" })).json();
  const reject1 = await (await fetch(`${base}/api/clearance/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      gullShooed: true,
      tunedFrequency: challenge.targetFrequency,
      holdMs: 1500,
      selectedIds: ["wrong-1", "wrong-2", "wrong-3"],
    }),
  })).json();
  const reject2 = await (await fetch(`${base}/api/clearance/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      gullShooed: true,
      tunedFrequency: challenge.targetFrequency,
      holdMs: 1500,
      selectedIds: ["wrong-1", "wrong-2", "wrong-3"],
    }),
  })).json();
  assert.notEqual(reject1.stamp, reject2.stamp);

  // Advance past TTL and confirm expiry returns a fresh challenge.
  clock += CHALLENGE_TTL_MS + 1;
  const expiredRes = await fetch(`${base}/api/clearance/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      gullShooed: true,
      tunedFrequency: challenge.targetFrequency,
      holdMs: 1500,
      selectedIds: ["wrong-1", "wrong-2", "wrong-3"],
    }),
  });
  assert.equal(expiredRes.status, 400);
  const expiredData = await expiredRes.json();
  assert.equal(expiredData.expired, true);
  assert.ok(expiredData.challenge?.challengeId);
  assert.notEqual(expiredData.challenge.challengeId, challenge.challengeId);
});

test("clearance cookies stay valid across server restarts when CLEARANCE_SECRET matches", async (t) => {
  const sharedSecret = "portsmouth-1974-secret";
  const serverA = createGameServer({ clearance: { secret: sharedSecret } });
  serverA.listen(0, "127.0.0.1");
  await once(serverA, "listening");
  t.after(() => { serverA.close(); });
  const baseA = `http://127.0.0.1:${serverA.address().port}`;

  const legitIds = new Set(LEGIT_CARDS.map((card) => card.id));
  const challenge = await (await fetch(`${baseA}/api/clearance/challenge`, { method: "POST" })).json();
  const validIds = challenge.grid.filter((card) => legitIds.has(card.id)).map((card) => card.id);
  const verifyRes = await fetch(`${baseA}/api/clearance/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      gullShooed: true,
      tunedFrequency: challenge.targetFrequency,
      holdMs: 1500,
      selectedIds: validIds,
    }),
  });
  assert.equal(verifyRes.status, 200);
  const cookiePair = (verifyRes.headers.get("set-cookie") ?? "").split(";", 1)[0];

  const routerSameSecret = createClearanceRouter({ secret: sharedSecret });
  const routerOtherSecret = createClearanceRouter({ secret: "different-secret" });
  assert.equal(routerSameSecret.hasValidClearance({ headers: { cookie: cookiePair } }), true);
  assert.equal(routerOtherSecret.hasValidClearance({ headers: { cookie: cookiePair } }), false);
});

test("Beat 3 removes only wrong picks on failure until only the 3 legitimate items remain", async (t) => {
  const server = createGameServer({ clearance: { secret: "elimination-test-secret" } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const legitIds = new Set(LEGIT_CARDS.map((card) => card.id));
  const challenge = await (await fetch(`${base}/api/clearance/challenge`, { method: "POST" })).json();
  const validCards = challenge.grid.filter((card) => legitIds.has(card.id)).map((card) => card.id);
  const decoyCards = challenge.grid.filter((card) => !legitIds.has(card.id)).map((card) => card.id);
  assert.equal(validCards.length, 3);
  assert.equal(decoyCards.length, 6);

  async function submit(selectedIds) {
    const res = await fetch(`${base}/api/clearance/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        gullShooed: true,
        tunedFrequency: challenge.targetFrequency,
        holdMs: 1500,
        selectedIds,
      }),
    });
    return { status: res.status, body: await res.json() };
  }

  // Incomplete selection of valid cards removes nothing.
  const incomplete = await submit(validCards.slice(0, 2));
  assert.equal(incomplete.status, 400);
  assert.deepEqual(incomplete.body.removedIds, []);
  assert.equal(incomplete.body.grid.length, 9);

  // 2 valid + 1 wrong removes only the 1 wrong card (9 -> 8).
  const firstMiss = await submit([validCards[0], validCards[1], decoyCards[0]]);
  assert.equal(firstMiss.status, 400);
  assert.deepEqual(firstMiss.body.removedIds, [decoyCards[0]]);
  assert.equal(firstMiss.body.grid.length, 8);
  assert.ok(validCards.every((id) => firstMiss.body.grid.some((c) => c.id === id)));

  // 1 valid + 2 wrong removes those 2 wrong cards (8 -> 6).
  const secondMiss = await submit([validCards[0], decoyCards[1], decoyCards[2]]);
  assert.equal(secondMiss.status, 400);
  assert.deepEqual(secondMiss.body.removedIds, [decoyCards[1], decoyCards[2]]);
  assert.equal(secondMiss.body.grid.length, 6);

  // Remaining 3 wrong cards are removed, leaving only the 3 legitimate options (6 -> 3).
  const thirdMiss = await submit(decoyCards.slice(3, 6));
  assert.equal(thirdMiss.status, 400);
  assert.deepEqual(thirdMiss.body.removedIds, decoyCards.slice(3, 6));
  assert.deepEqual(thirdMiss.body.grid.map((card) => card.id), validCards);
  assert.match(thirdMiss.body.reason, /Only the 3 genuine Station PO1 items remain/i);

  // Submitting the 3 remaining cards grants clearance.
  const pass = await submit(thirdMiss.body.grid.map((card) => card.id));
  assert.equal(pass.status, 200);
  assert.equal(pass.body.ok, true);
});
