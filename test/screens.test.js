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

function gameView(state, extra = {}) {
  return {
    state, online: true, available: true, composing: false,
    moving: false, canDecrypt: false, draft: [], category: "PLACE", status: "",
    finaleStep: 0, ...extra,
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

test("finale screen steps through totals, full operation log, and Station PO1 addendum for both roles", async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement };
  t.after(() => {
    globalThis.document = previousDocument;
  });

  const { FINALE_STEPS, renderScreen } = await import("../web/screens.js");
  assert.equal(FINALE_STEPS, 3);
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

    // Stage 1: Case Closed + campaign totals.
    const stage1 = renderScreen(gameView(state, { finaleStep: 0 }));
    const stage1Text = textContent(stage1);
    assert.ok(stage1Text.includes("DECLASSIFIED"));
    assert.ok(stage1Text.includes("PAGE 1 / 3"));
    assert.ok(stage1Text.includes("Case Closed"));
    assert.ok(stage1Text.includes("Campaign totals"));
    assert.ok(stage1Text.includes(`${state.campaign.signal}%`));
    assert.ok(stage1Text.includes(state.campaign.most_jammed.word));
    assert.ok(stage1Text.includes("TRANSMISSION ENDED"));
    assert.equal(stage1Text.includes("H E L L O"), false);
    assert.equal(findAll(stage1, (node) => node.attrs?.["data-action"] === "finale-next").length, 1);
    assert.equal(findAll(stage1, (node) => node.attrs?.["data-action"] === "ready").length, 0);

    // Stage 2: Full operation log with all briefings.
    const stage2 = renderScreen(gameView(state, { finaleStep: 1 }));
    const stage2Text = textContent(stage2);
    assert.ok(stage2Text.includes("PAGE 2 / 3"));
    assert.ok(stage2Text.includes("The Kessel File"));
    for (const mission of MISSIONS) {
      assert.ok(stage2Text.includes(mission.name), `missing ${mission.name}`);
      assert.ok(stage2Text.includes(mission.briefing), `missing briefing for ${mission.name}`);
    }
    assert.equal(findAll(stage2, (node) => node.attrs?.["data-action"] === "finale-back").length, 1);
    assert.equal(findAll(stage2, (node) => node.attrs?.["data-action"] === "finale-next").length, 1);

    // Stage 3: Station PO1 addendum + Replay campaign.
    const stage3 = renderScreen(gameView(state, { finaleStep: 2 }));
    const stage3Text = textContent(stage3);
    assert.ok(stage3Text.includes("PAGE 3 / 3"));
    assert.ok(stage3Text.includes("STATION PO1"));
    assert.ok(stage3Text.includes("Next Directive"));
    assert.ok(stage3Text.includes("ADDENDUM · STATION PO1"));
    assert.ok(stage3Text.includes("blowing up Southampton"));
    assert.ok(stage3Text.includes("Replay campaign"));
    assert.equal(findAll(stage3, (node) => node.attrs?.["data-action"] === "finale-back").length, 1);
    assert.equal(findAll(stage3, (node) => node.attrs?.["data-action"] === "ready").length, 1);
  }

  const cleanState = {
    ...room.snapshot("agent"),
    campaign: { ...room.snapshot("agent").campaign, intercepts: 0, signal: 100, most_jammed: null },
  };
  assert.ok(textContent(renderScreen(gameView(cleanState, { finaleStep: 0 }))).includes("None · clean channel"));
});
