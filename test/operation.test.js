import assert from "node:assert/strict";
import test from "node:test";
import { MISSIONS, Room, checkLevel } from "../operation.js";
import { REDACTED } from "../web/radio.js";

function command(room, role, type, extra = {}) {
  assert.deepEqual(room.command(role, { type, ...extra }), [true, ""]);
}

function ready(room) {
  for (const role of ["handler", "agent"]) command(room, role, "ready");
}

function pairedRoom(now = () => 0) {
  const room = new Room("ROOM1", now);
  room.connect("handler", {});
  room.connect("agent", {});
  return room;
}

test("plays every level from its solution, keeps ECHO's memory between cases, and clears it on replay", () => {
  const room = pairedRoom();
  const routes = MISSIONS.map((mission) => mission.solution.route);
  for (const [index, route] of routes.entries()) {
    assert.equal(room.snapshot("handler").mission, index + 1);
    ready(room);
    command(room, "handler", "radio", { tiles: ["GO"] });
    assert.deepEqual(room.incoming("agent").tiles, [index ? REDACTED : "GO"]);

    for (const step of route) {
      if (!room.snapshot("agent").points) {
        command(room, "agent", "end_moves");
        command(room, "agent", "radio", { tiles: ["YES"] });
        command(room, "handler", "radio", { tiles: ["GO"] });
      }
      if (step === "take" || step === "drop") command(room, "agent", step);
      else command(room, "agent", "move", { direction: step });
    }

    const result = room.snapshot("agent");
    assert.equal(result.phase, index === routes.length - 1 ? "complete" : "cleared");
    assert.equal(result.peak_suspicion, MISSIONS[index].solution.peakSuspicion);
    assert.match(result.result, /reached the/);
    assert.ok(result.transmissions.length > 2);
    ready(room);
  }
  assert.equal(room.snapshot("agent").mission, 1);
  ready(room);
  command(room, "handler", "radio", { tiles: ["GO"] });
  assert.deepEqual(room.incoming("agent").tiles, ["GO"]);
});

test("redacts repeated words by frequency, allows one decrypt, and keeps memory on retry", () => {
  const room = pairedRoom();
  ready(room);
  const tiles = ["TAKE", "GO", "GO"];
  command(room, "handler", "radio", { tiles });
  assert.deepEqual(room.incoming("agent").tiles, tiles);
  command(room, "agent", "end_moves");
  command(room, "agent", "radio", { tiles });
  assert.deepEqual(room.incoming("handler").tiles, tiles);
  command(room, "handler", "radio", { tiles });
  assert.deepEqual(room.incoming("agent").tiles, ["TAKE", REDACTED, REDACTED]);

  command(room, "agent", "decrypt");
  assert.deepEqual(room.incoming("agent").tiles, ["TAKE", "GO", REDACTED]);
  assert.equal(room.snapshot("agent").key, false);
  assert.equal(room.command("agent", { type: "decrypt" })[0], false);

  for (let round = 2; round <= 8; round++) {
    command(room, "agent", "end_moves");
    command(room, "agent", "radio", { tiles: ["YES"] });
    if (round < 8) command(room, "handler", "radio", { tiles: ["GO"] });
  }
  const result = room.snapshot("handler");
  assert.equal(result.phase, "failed");
  assert.match(result.result, /last round/);
  assert.deepEqual(result.transmissions[2].heard, ["TAKE", REDACTED, REDACTED]);

  ready(room);
  ready(room);
  command(room, "handler", "radio", { tiles: ["GO"] });
  assert.deepEqual(room.incoming("agent").tiles, [REDACTED]);
  assert.equal(room.snapshot("agent").key, true);
});

test("pauses the mission clock on loss of either player and resumes the remaining time", () => {
  let now = 0;
  const room = pairedRoom(() => now);
  ready(room);
  now = 60_000;
  const token = room.tokens.get("agent");
  room.disconnect("agent");
  now = 700_000;
  assert.equal(room.snapshot("handler").seconds, 540);
  assert.equal(room.expireMission(), false);
  assert.equal(room.connect("agent", {}), token);
  now += 539_999;
  assert.equal(room.expireMission(), false);
  now += 1;
  assert.equal(room.expireMission(), true);
  assert.equal(room.snapshot("agent").seconds, 0);
  assert.match(room.snapshot("handler").result, /Time ran out/);
});

test("rejects levels that would crash or can't be finished", () => {
  const level = structuredClone(MISSIONS[0]);
  assert.doesNotThrow(() => checkLevel(level));
  const broken = [
    [(copy) => { copy.grid[5] = copy.grid[5].replace("X", "."); }, /exactly one "X"/],
    [(copy) => { copy.grid[0] = "Q" + copy.grid[0].slice(1); }, /unknown letter "Q"/],
    [(copy) => { copy.grid.pop(); }, /8 rows of 8/],
    [(copy) => { copy.patrol = [[5, 2]]; }, /at least 2 squares/],
    [(copy) => { copy.patrol = [[5, 2], [5, 4]]; }, /square 2 must be next to square 1/],
    [(copy) => { copy.patrol = [[3, 0], [3, 1]]; }, /square 1 must be an \[x, y\] on the map, not a wall/],
    [(copy) => { copy.decoy = "teapot"; }, /"decoy" must be a radio word/],
    [(copy) => {
      // Wall in the drop point at (4, 3) on all four sides.
      copy.patrol = [[0, 6], [1, 6]];
      for (const [x, y] of [[4, 2], [3, 3], [5, 3], [4, 4]]) copy.grid[y] = `${copy.grid[y].slice(0, x)}#${copy.grid[y].slice(x + 1)}`;
    }, /walk from "S" to "[DE]"/],
  ];
  for (const [breakIt, message] of broken) {
    const copy = structuredClone(level);
    breakIt(copy);
    assert.throws(() => checkLevel(copy), message);
  }
});
