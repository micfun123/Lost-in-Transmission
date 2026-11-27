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

// random = () => 0 makes ECHO jam every learned word it's allowed to, so results are predictable.
function pairedRoom(now = () => 0, random = () => 0) {
  const room = new Room("ROOM1", now, random);
  room.connect("handler", {});
  room.connect("agent", {});
  return room;
}

function playSolution(room, route) {
  ready(room);
  command(room, "handler", "radio", { tiles: ["GO"] });
  for (const step of route) {
    if (!room.snapshot("agent").points) {
      command(room, "agent", "end_moves");
      command(room, "agent", "radio", { tiles: ["YES"] });
      command(room, "handler", "radio", { tiles: ["GO"] });
    }
    if (step === "take" || step === "drop") command(room, "agent", step);
    else command(room, "agent", "move", { direction: step });
  }
}

test("plays every level from its solution, shows the declassified finale with campaign totals, and resets on replay", () => {
  const room = pairedRoom();
  const routes = MISSIONS.map((mission) => mission.solution.route);
  let totalRounds = 0;
  let totalTransmissions = 0;
  let totalSent = 0;
  let totalBlocked = 0;

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
    assert.equal("dossier" in result, false);
    assert.equal("campaign" in result, false);

    totalRounds += result.round;
    totalTransmissions += result.transmissions.length;
    totalSent += result.transmissions.reduce((sum, entry) => sum + entry.sent.length, 0);
    totalBlocked += result.transmissions.reduce(
      (sum, entry) => sum + entry.heard.filter((tile) => tile === REDACTED).length,
      0,
    );
    ready(room);
  }

  for (const role of ["handler", "agent"]) {
    const finale = room.snapshot(role);
    assert.equal(finale.phase, "finale");
    assert.equal(finale.dossier.length, MISSIONS.length);
    MISSIONS.forEach((mission, index) => {
      assert.equal(finale.dossier[index].mission, index + 1);
      assert.equal(finale.dossier[index].name, mission.name);
      assert.equal(finale.dossier[index].briefing, mission.briefing);
      assert.equal(finale.dossier[index].peak_suspicion, mission.solution.peakSuspicion);
      assert.ok(finale.dossier[index].rounds >= 1);
    });
    assert.equal(finale.campaign.cases_cleared, MISSIONS.length);
    assert.equal(finale.campaign.rounds, totalRounds);
    assert.equal(finale.campaign.retries, 0);
    assert.equal(finale.campaign.transmissions, totalTransmissions);
    assert.equal(finale.campaign.tiles_sent, totalSent);
    assert.equal(finale.campaign.intercepts, totalBlocked);
    assert.equal(finale.campaign.signal, Math.round(100 * (totalSent - totalBlocked) / totalSent));
    assert.equal(finale.campaign.peak_suspicion, Math.max(...MISSIONS.map((mission) => mission.solution.peakSuspicion)));
    assert.equal(finale.campaign.most_jammed.word, "GO");
    assert.ok(finale.campaign.most_jammed.count > 0);
  }

  ready(room);
  assert.equal(room.snapshot("agent").phase, "briefing");
  assert.equal(room.snapshot("agent").mission, 1);
  assert.equal(room.campaign.rounds, 0);
  assert.equal(room.campaign.retries, 0);
  assert.equal(room.campaign.cases.size, 0);
  assert.equal(room.casesCleared, MISSIONS.length);
  ready(room);
  command(room, "handler", "radio", { tiles: ["GO"] });
  assert.deepEqual(room.incoming("agent").tiles, ["GO"]);
});

test("campaign totals include failed retries and report no jammed word on a clean channel", () => {
  let now = 0;
  const room = pairedRoom(() => now, () => 0.99);
  room.missionIndex = MISSIONS.length - 1;
  room.prepareCase();

  // Fail Case 08 once on timeout after sending a message.
  ready(room);
  command(room, "handler", "radio", { tiles: ["GO", "EAST"] });
  now = MISSIONS.at(-1).minutes * 60_000;
  assert.equal(room.expireMission(), true);
  assert.equal(room.snapshot("handler").phase, "failed");

  // Retry and clear Case 08, then open the finale.
  ready(room);
  playSolution(room, MISSIONS.at(-1).solution.route);
  assert.equal(room.snapshot("agent").phase, "complete");
  ready(room);

  const finale = room.snapshot("agent");
  assert.equal(finale.phase, "finale");
  assert.equal(finale.campaign.retries, 1);
  assert.equal(finale.campaign.intercepts, 0);
  assert.equal(finale.campaign.signal, 100);
  assert.equal(finale.campaign.most_jammed, null);
  assert.equal(finale.campaign.rounds, finale.dossier.at(-1).rounds + 1);
  assert.equal(finale.dossier.length, MISSIONS.length);
  assert.equal(finale.dossier.at(-1).signal, 100);
});

test("jams learned words up to the level's cap, allows one decrypt, and keeps memory on retry", () => {
  const room = pairedRoom();
  ready(room);
  const tiles = ["TAKE", "GO", "GO"];
  command(room, "handler", "radio", { tiles });
  assert.deepEqual(room.incoming("agent").tiles, tiles);
  command(room, "agent", "end_moves");
  command(room, "agent", "radio", { tiles });
  assert.deepEqual(room.incoming("handler").tiles, tiles);
  command(room, "handler", "radio", { tiles });
  // Both words are learned, but Dead Drop allows one static tile per message.
  assert.deepEqual(room.incoming("agent").tiles, [REDACTED, "GO", "GO"]);

  command(room, "agent", "decrypt");
  assert.deepEqual(room.incoming("agent").tiles, tiles);
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
  assert.deepEqual(result.transmissions[2].heard, [REDACTED, "GO", "GO"]);

  ready(room);
  ready(room);
  command(room, "handler", "radio", { tiles: ["GO"] });
  assert.deepEqual(room.incoming("agent").tiles, [REDACTED]);
  assert.equal(room.snapshot("agent").key, true);
});

test("pauses the mission clock on loss of either player and resumes the remaining time", () => {
  let now = 0;
  const room = pairedRoom(() => now);
  const events = [];
  room.track = (event) => events.push(event);
  ready(room);
  now = 60_000;
  const token = room.tokens.get("agent");
  room.disconnect("agent");
  now = 700_000;
  assert.equal(room.snapshot("handler").seconds, 840);
  assert.equal(room.expireMission(), false);
  assert.equal(room.connect("agent", {}), token);
  now += 839_999;
  assert.equal(room.expireMission(), false);
  now += 1;
  assert.equal(room.expireMission(), true);
  assert.equal(room.snapshot("agent").seconds, 0);
  assert.match(room.snapshot("handler").result, /Time ran out/);
  // The 640 s pause isn't counted as time played.
  assert.deepEqual([events.length, events[0].outcome, events[0].seconds], [1, "failed", 900]);
});

test("rejects levels that would crash or can't be finished", () => {
  const level = structuredClone(MISSIONS[0]);
  assert.doesNotThrow(() => checkLevel(level));
  const broken = [
    [(copy) => { copy.grid[5] = copy.grid[5].replace("X", "."); }, /exactly one "X"/],
    [(copy) => { copy.grid[0] = "Q" + copy.grid[0].slice(1); }, /unknown letter "Q"/],
    [(copy) => { copy.grid[0] += "."; }, /all the same length/],
    [(copy) => { copy.grid = copy.grid.slice(0, 4); }, /5 to 12 rows/],
    [(copy) => { copy.rounds = 0; }, /"rounds" must be a whole number/],
    [(copy) => { copy.minutes = "ten"; }, /"minutes" must be a number/],
    [(copy) => { copy.echoChance = 2; }, /"echoChance" must be a number from 0 to 1/],
    [(copy) => { copy.echoMaxStatic = 1.5; }, /"echoMaxStatic" must be a whole number/],
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

test("ECHO jams by chance, caps static per message, and fades between cases", () => {
  const sendTwice = (room, tiles) => {
    command(room, "handler", "radio", { tiles });
    command(room, "agent", "end_moves");
    command(room, "agent", "radio", { tiles });
    command(room, "handler", "radio", { tiles });
    return room.incoming("agent").tiles;
  };
  const words = ["GO", "NORTH", "EAST", "WEST", "SOUTH", "TAKE"];

  // A roll above the 60% ceiling never jams, however often a word is used.
  const lucky = pairedRoom(() => 0, () => 0.99);
  ready(lucky);
  assert.deepEqual(sendTwice(lucky, words), words);

  // Dead Air allows 2 static tiles, even when all 6 words are learned.
  const heavy = pairedRoom();
  heavy.missionIndex = 2;
  heavy.prepareCase();
  ready(heavy);
  assert.equal(sendTwice(heavy, words).filter((tile) => tile === REDACTED).length, 2);

  // Clearing a case halves ECHO's memory; retrying keeps it.
  const room = pairedRoom();
  room.words.set("GO", 7);
  room.phase = "failed";
  ready(room);
  assert.equal(room.words.get("GO"), 7);
  room.phase = "cleared";
  ready(room);
  assert.equal(room.words.get("GO"), 3);
});

test("levels can override time, rounds, action points and map size", () => {
  const level = MISSIONS[0];
  assert.deepEqual([level.minutes, level.rounds, level.actionPoints], [15, 8, 4]);
  const saved = { ...level };
  try {
    Object.assign(level, { minutes: 2, rounds: 3, actionPoints: 6 });
    const room = pairedRoom();
    const state = room.snapshot("agent");
    assert.deepEqual([state.seconds, state.round_limit, state.points, state.point_limit], [120, 3, 6, 6]);
  } finally {
    Object.assign(level, saved);
  }
  const wide = structuredClone(level);
  wide.grid = wide.grid.map((row) => `${row}....`);
  assert.doesNotThrow(() => checkLevel(wide));
});
