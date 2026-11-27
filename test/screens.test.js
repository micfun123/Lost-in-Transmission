import assert from "node:assert/strict";
import test from "node:test";
import { MISSIONS, Room } from "../operation.js";

function createElement(tag) {
  return {
    tag,
    attrs: {},
    dataset: {},
    children: [],
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
  };
}

function findAll(node, predicate, results = []) {
  if (!node || typeof node !== "object") return results;
  if (predicate(node)) results.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, results);
  return results;
}

function textContent(node) {
  if (typeof node === "string") return node;
  return (node?.children ?? []).map(textContent).join("");
}

function activeRoom() {
  const room = new Room("ROOM1", () => 0, () => 0);
  room.connect("handler", {});
  room.connect("agent", {});
  room.command("handler", { type: "ready" });
  room.command("agent", { type: "ready" });
  return room;
}

test("handler sees the mission objective strip during active play and can render the briefing modal", async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement };
  t.after(() => {
    globalThis.document = previousDocument;
  });

  const { renderBriefingModal, renderScreen } = await import("../web/screens.js");
  const room = activeRoom();
  const handlerState = room.snapshot("handler");
  const handlerScreen = renderScreen({
    state: handlerState, online: true, available: true, composing: true,
    moving: false, canDecrypt: false, draft: [], category: "PLACE", status: "",
  });

  const strips = findAll(handlerScreen, (node) => node.attrs?.["data-action"] === "briefing");
  assert.equal(strips.length, 1);
  assert.match(textContent(strips[0]), new RegExp(handlerState.objective));

  const modal = { children: renderBriefingModal(handlerState) };
  const headings = findAll(modal, (node) => node.attrs?.id === "briefing-dialog-heading");
  assert.equal(headings.length, 1);
  assert.equal(headings[0].tag, "h2");
  assert.equal(textContent(headings[0]), handlerState.name);
  assert.ok(textContent(modal).includes(handlerState.briefing));
  assert.ok(textContent(modal).includes(handlerState.objective));
});

test("agent does not see the handler mission strip during moves or report", async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement };
  t.after(() => {
    globalThis.document = previousDocument;
  });

  const { renderScreen } = await import("../web/screens.js");
  const room = activeRoom();
  room.command("handler", { type: "radio", tiles: ["GO"] });

  const movesScreen = renderScreen({
    state: room.snapshot("agent"), online: true, available: true, composing: false,
    moving: true, canDecrypt: false, draft: [], category: "REPORT", status: "",
  });
  assert.equal(findAll(movesScreen, (node) => node.attrs?.["data-action"] === "briefing").length, 0);

  room.command("agent", { type: "end_moves" });
  const reportScreen = renderScreen({
    state: room.snapshot("agent"), online: true, available: true, composing: true,
    moving: false, canDecrypt: false, draft: [], category: "REPORT", status: "",
  });
  assert.equal(findAll(reportScreen, (node) => node.attrs?.["data-action"] === "briefing").length, 0);
});

function clearCurrentMission(room) {
  room.command("handler", { type: "radio", tiles: ["GO"] });
  for (const step of MISSIONS[room.missionIndex].solution.route) {
    if (!room.snapshot("agent").points) {
      room.command("agent", { type: "end_moves" });
      room.command("agent", { type: "radio", tiles: ["YES"] });
      room.command("handler", { type: "radio", tiles: ["GO"] });
    }
    if (step === "take" || step === "drop") room.command("agent", { type: step });
    else room.command("agent", { type: "move", direction: step });
  }
}

function gameView(state) {
  return {
    state, online: true, available: true, composing: false,
    moving: false, canDecrypt: false, draft: [], category: "PLACE", status: "",
  };
}

test("debrief silences ECHO on Case 08 completion and offers to declassify the dossier", async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement };
  t.after(() => {
    globalThis.document = previousDocument;
  });

  const { renderScreen } = await import("../web/screens.js");
  const clearedRoom = activeRoom();
  clearCurrentMission(clearedRoom);
  const clearedScreen = renderScreen(gameView(clearedRoom.snapshot("agent")));
  assert.ok(textContent(clearedScreen).includes("H E L L O"));
  assert.ok(textContent(clearedScreen).includes("Next case · The Courier"));

  const finalRoom = activeRoom();
  finalRoom.missionIndex = MISSIONS.length - 1;
  finalRoom.prepareCase();
  finalRoom.command("handler", { type: "ready" });
  finalRoom.command("agent", { type: "ready" });
  clearCurrentMission(finalRoom);

  const completeScreen = renderScreen(gameView(finalRoom.snapshot("agent")));
  const completeText = textContent(completeScreen);
  assert.ok(completeText.includes("NO CARRIER"));
  assert.equal(completeText.includes("H E L L O"), false);
  assert.ok(completeText.includes("Declassify dossier"));
});

test("finale screen reveals all briefings, campaign totals, and silenced ECHO to both roles", async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement };
  t.after(() => {
    globalThis.document = previousDocument;
  });

  const { renderScreen } = await import("../web/screens.js");
  const room = new Room("ROOM1", () => 0, () => 0);
  room.connect("handler", {});
  room.connect("agent", {});
  for (let i = 0; i < MISSIONS.length; i += 1) {
    room.command("handler", { type: "ready" });
    room.command("agent", { type: "ready" });
    clearCurrentMission(room);
    room.command("handler", { type: "ready" });
    room.command("agent", { type: "ready" });
  }

  for (const role of ["handler", "agent"]) {
    const state = room.snapshot(role);
    assert.equal(state.phase, "finale");
    const screen = renderScreen(gameView(state));
    const text = textContent(screen);
    assert.ok(text.includes("DECLASSIFIED"));
    assert.ok(text.includes("Case Closed"));
    assert.ok(text.includes("Campaign totals"));
    assert.ok(text.includes(`${state.campaign.signal}%`));
    assert.ok(text.includes(state.campaign.most_jammed.word));
    assert.ok(text.includes("TRANSMISSION ENDED"));
    assert.equal(text.includes("H E L L O"), false);
    assert.ok(text.includes("Replay campaign"));
    for (const mission of MISSIONS) {
      assert.ok(text.includes(mission.name), `missing ${mission.name}`);
      assert.ok(text.includes(mission.briefing), `missing briefing for ${mission.name}`);
    }
  }

  const cleanState = {
    ...room.snapshot("agent"),
    campaign: { ...room.snapshot("agent").campaign, intercepts: 0, signal: 100, most_jammed: null },
  };
  assert.ok(textContent(renderScreen(gameView(cleanState))).includes("None · clean channel"));
});
