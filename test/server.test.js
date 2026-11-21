import assert from "node:assert/strict";
import { on, once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { createGameServer } from "../server.js";

test("serves the game and link preview without a build step", async (t) => {
  const base = await startServer(t);
  const page = await fetch(base, { headers: { "X-Forwarded-Proto": "https" } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('<script type="module" src="/game.js">'));
  assert.ok(html.includes(`content="${base.replace("http:", "https:")}/logo.jpg"`));
  assert.ok(html.includes('rel="icon" href="/favicon.png"'));
  assert.ok(html.includes('rel="apple-touch-icon" href="/apple-touch-icon.png"'));

  const assets = [
    ["/game.js", "text/javascript"], ["/screens.js", "text/javascript"],
    ["/radio.js", "text/javascript"], ["/style.css", "text/css"],
    ["/logo.jpg", "image/jpeg"], ["/favicon.png", "image/png"], ["/apple-touch-icon.png", "image/png"],
    ["/assets/fonts/SpecialElite-Regular.ttf", "font/ttf"],
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

async function startServer(t) {
  const server = createGameServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
