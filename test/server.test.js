import assert from "node:assert/strict";
import { on, once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { COOKIE_NAME, LEGIT_CARDS } from "../apps/clearance/clearance.js";
import { createGameServer } from "../server.js";

const LEGIT_IDS = new Set(LEGIT_CARDS.map((card) => card.id));

function extractCookiePair(response) {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";", 1)[0];
}

test("gates / until clearance passes, while preserving link preview tags and static assets", async (t) => {
  const base = await startServer(t);

  // Unverified requests receive Form PO1-00 in place with HTTP 200 and OpenGraph tags intact.
  const gated = await fetch(base, { headers: { "X-Forwarded-Proto": "https" } });
  assert.equal(gated.status, 200);
  const gatedHtml = await gated.text();
  assert.ok(gatedHtml.includes("FORM PO1-00"));
  assert.ok(gatedHtml.includes('<script type="module" src="/clearance/clearance.js">'));
  assert.ok(!gatedHtml.includes('<script type="module" src="/game.js">'));
  assert.ok(gatedHtml.includes(`content="${base.replace("http:", "https:")}/logo.jpg"`));
  assert.ok(gatedHtml.includes('property="og:title" content="Lost in Transmission"'));

  // Forged cookies stay gated.
  const forged = await fetch(base, { headers: { Cookie: `${COOKIE_NAME}=PO1-999.fake.bad-sig` } });
  assert.equal(forged.status, 200);
  assert.ok((await forged.text()).includes("FORM PO1-00"));

  // Request a clearance challenge from the server.
  const challengeRes = await fetch(`${base}/api/clearance/challenge`, { method: "POST" });
  assert.equal(challengeRes.status, 200);
  const challenge = await challengeRes.json();
  assert.equal(challenge.grid.length, 9);
  assert.ok(challenge.grid.every((card) => !("legit" in card)));

  // Reject incomplete Beat 1 (seagull not shooed).
  const noGull = await fetch(`${base}/api/clearance/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      gullShooed: false,
      tunedFrequency: challenge.targetFrequency,
      holdMs: 1500,
      selectedIds: challenge.grid.filter((c) => LEGIT_IDS.has(c.id)).map((c) => c.id),
    }),
  });
  assert.equal(noGull.status, 400);
  assert.equal((await noGull.json()).stage, "humanity");

  // Reject off-frequency Beat 2.
  const badRadio = await fetch(`${base}/api/clearance/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      gullShooed: true,
      tunedFrequency: challenge.targetFrequency + 1.5,
      holdMs: 1500,
      selectedIds: challenge.grid.filter((c) => LEGIT_IDS.has(c.id)).map((c) => c.id),
    }),
  });
  assert.equal(badRadio.status, 400);
  assert.equal((await badRadio.json()).stage, "radio");

  // Reject wrong Beat 3 manifest and remove only the wrong cards from the existing grid.
  const originalLegitIds = challenge.grid.filter((c) => LEGIT_IDS.has(c.id)).map((c) => c.id);
  const decoys = challenge.grid.filter((c) => !LEGIT_IDS.has(c.id)).slice(0, 3).map((c) => c.id);
  const badCustomsRes = await fetch(`${base}/api/clearance/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      gullShooed: true,
      tunedFrequency: challenge.targetFrequency,
      holdMs: 1500,
      selectedIds: decoys,
    }),
  });
  assert.equal(badCustomsRes.status, 400);
  const badCustoms = await badCustomsRes.json();
  assert.equal(badCustoms.stage, "customs");
  assert.equal(badCustoms.grid.length, 6);
  assert.deepEqual(badCustoms.removedIds, decoys);
  assert.ok(badCustoms.grid.every((c) => !decoys.includes(c.id)));
  assert.equal(badCustomsRes.headers.get("set-cookie"), null);

  // Submit the 3 legitimate Station PO1 cards remaining on the narrowed grid.
  const validIds = badCustoms.grid.filter((c) => LEGIT_IDS.has(c.id)).map((c) => c.id);
  assert.deepEqual(validIds, originalLegitIds);
  const passRes = await fetch(`${base}/api/clearance/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-Proto": "https",
    },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      gullShooed: true,
      tunedFrequency: challenge.targetFrequency,
      holdMs: 1500,
      selectedIds: validIds,
    }),
  });
  assert.equal(passRes.status, 200);
  assert.equal((await passRes.json()).ok, true);
  const setCookieHeader = passRes.headers.get("set-cookie") ?? "";
  assert.ok(setCookieHeader.includes(`${COOKIE_NAME}=`));
  assert.ok(setCookieHeader.includes("HttpOnly"));
  assert.ok(setCookieHeader.includes("SameSite=Lax"));
  assert.ok(setCookieHeader.includes("Secure"));

  // Replaying a spent challenge fails.
  const replay = await fetch(`${base}/api/clearance/verify`, {
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
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).expired, true);

  const clearanceCookie = extractCookiePair(passRes);

  // Cleared request receives the game page and link preview tags.
  const page = await fetch(base, {
    headers: { Cookie: clearanceCookie, "X-Forwarded-Proto": "https" },
  });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('<script type="module" src="/game.js">'));
  assert.ok(html.includes(`content="${base.replace("http:", "https:")}/logo.jpg"`));
  assert.ok(html.includes('rel="icon" href="/favicon.png"'));
  assert.ok(html.includes('rel="apple-touch-icon" href="/apple-touch-icon.png"'));

  // POST /api/clearance/reset expires the cookie so subsequent loads hit the gate again.
  const resetRes = await fetch(`${base}/api/clearance/reset`, { method: "POST" });
  assert.equal(resetRes.status, 200);
  const resetCookieHeader = resetRes.headers.get("set-cookie") ?? "";
  assert.ok(resetCookieHeader.includes(`${COOKIE_NAME}=;`));
  assert.ok(resetCookieHeader.includes("Max-Age=0"));
  const relocked = await fetch(base, { headers: { Cookie: extractCookiePair(resetRes) } });
  assert.ok((await relocked.text()).includes("FORM PO1-00"));

  const assets = [
    ["/game.js", "text/javascript"], ["/screens.js", "text/javascript"],
    ["/interference.js", "text/javascript"],
    ["/radio.js", "text/javascript"], ["/style.css", "text/css"],
    ["/logo.jpg", "image/jpeg"], ["/favicon.png", "image/png"], ["/apple-touch-icon.png", "image/png"],
    ["/assets/fonts/SpecialElite-Regular.ttf", "font/ttf"],
    ["/clearance/clearance.css", "text/css"], ["/clearance/clearance.js", "text/javascript"],
  ];
  for (const [path, mime] of assets) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type").startsWith(mime));
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  const missing = await fetch(base + "/missing");
  assert.equal(missing.status, 404);
});

test("players can create, play, reconnect to, and close a room over /ws", { timeout: 10_000 }, async (t) => {
  const base = await startServer(t);
  const url = base.replace("http:", "ws:") + "/ws";
  const signal = AbortSignal.timeout(8_000);
  const sockets = new Set();
  t.after(() => {
    for (const socket of sockets) socket.terminate();
  });
  async function connect() {
    const socket = new WebSocket(url, { origin: base });
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    const messages = on(socket, "message", { signal });
    await once(socket, "open", { signal });
    return {
      socket,
      send(type, extra = {}) {
        socket.send(JSON.stringify({ type, ...extra }));
      },
      async receive(type, condition = () => true) {
        while (true) {
          const { value, done } = await messages.next();
          if (done) throw new Error(`Missing ${type} message`);
          const message = JSON.parse(value[0].toString());
          if (message.type === type && condition(message)) return message;
        }
      },
    };
  }

  const handler = await connect();
  handler.send("create");
  const { code } = await handler.receive("joined");
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal((await handler.receive("state")).phase, "lobby");

  const qr = await fetch(`${base}/api/room-qr?code=${code.toLowerCase()}`);
  assert.equal(qr.status, 200);
  assert.ok(qr.headers.get("content-type").startsWith("image/svg+xml"));
  assert.match(await qr.text(), /<svg[\s>]/);
  const qrHead = await fetch(`${base}/api/room-qr?code=${code}`, { method: "HEAD" });
  assert.equal(qrHead.status, 200);
  assert.equal(await qrHead.text(), "");
  const qrPost = await fetch(`${base}/api/room-qr?code=${code}`, { method: "POST" });
  assert.equal(qrPost.status, 405);
  assert.equal(qrPost.headers.get("allow"), "GET, HEAD");
  assert.equal((await fetch(`${base}/api/room-qr?code=INVALID`)).status, 400);
  const missingCode = `${code[0] === "A" ? "B" : "A"}${code.slice(1)}`;
  assert.equal((await fetch(`${base}/api/room-qr?code=${missingCode}`)).status, 404);

  const agent = await connect();
  agent.send("join", { code: code.toLowerCase() });
  const { token } = await agent.receive("joined");
  const agentBriefing = await agent.receive("state");
  const handlerBriefing = await handler.receive("state");
  assert.equal(agentBriefing.phase, "briefing");
  assert.equal(agentBriefing.grid.join("").replaceAll("?", "").length, 9);
  assert.equal("patrol" in agentBriefing, false);
  assert.equal("position" in handlerBriefing, false);
  assert.equal(handlerBriefing.grid.join("").includes("?"), false);

  handler.send("ready");
  agent.send("ready");
  await handler.receive("state", (state) => state.phase === "active");
  handler.send("radio", { tiles: ["GO", "EAST"] });
  const order = await agent.receive("state", (state) => state.stage === "moves");
  assert.deepEqual(order.incoming.tiles, ["GO", "EAST"]);

  agent.send("move", { direction: "right" });
  const moved = await agent.receive("state", (state) => state.points === 3);
  assert.deepEqual(moved.position, [2, 3]);

  agent.socket.close();
  const paused = await handler.receive("state", (state) => !state.paired);
  assert.equal(paused.phase, "active");
  const resumed = await connect();
  resumed.send("resume", { code, token });
  assert.equal((await resumed.receive("joined")).token, token);
  const restored = await resumed.receive("state");
  assert.equal(restored.paired, true);
  assert.deepEqual(restored.position, moved.position);
  assert.equal(restored.points, moved.points);

  resumed.send("leave");
  assert.equal((await handler.receive("left")).text, "The other player closed the room.");
  assert.equal((await resumed.receive("left")).text, "");
});

test("startAtFinale skips paired rooms straight to the campaign finale and allows replay", { timeout: 10_000 }, async (t) => {
  const base = await startServer(t, { startAtFinale: true });
  const url = base.replace("http:", "ws:") + "/ws";
  const signal = AbortSignal.timeout(8_000);
  const sockets = new Set();
  t.after(() => {
    for (const socket of sockets) socket.terminate();
  });
  async function connect() {
    const socket = new WebSocket(url, { origin: base });
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    const messages = on(socket, "message", { signal });
    await once(socket, "open", { signal });
    return {
      send(type, extra = {}) {
        socket.send(JSON.stringify({ type, ...extra }));
      },
      async receive(type, condition = () => true) {
        while (true) {
          const { value, done } = await messages.next();
          if (done) throw new Error(`Missing ${type} message`);
          const message = JSON.parse(value[0].toString());
          if (message.type === type && condition(message)) return message;
        }
      },
    };
  }

  const handler = await connect();
  handler.send("create");
  const { code } = await handler.receive("joined");
  assert.equal((await handler.receive("state")).phase, "lobby");

  const agent = await connect();
  agent.send("join", { code });
  await agent.receive("joined");
  const agentFinale = await agent.receive("state");
  const handlerFinale = await handler.receive("state");
  for (const state of [agentFinale, handlerFinale]) {
    assert.equal(state.phase, "finale");
    assert.equal(state.dossier.length, 8);
    assert.ok(state.campaign.rounds > 0);
    assert.ok(state.campaign.transmissions > 0);
    assert.ok(state.dossier.every((entry) => entry.rounds >= 1));
  }

  handler.send("ready");
  agent.send("ready");
  const replay = await agent.receive("state", (state) => state.phase === "briefing");
  assert.equal(replay.mission, 1);
});

async function startServer(t, options) {
  const server = createGameServer(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
