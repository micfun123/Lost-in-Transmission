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

test("finale screen steps through totals, each case one by one, and Station PO1 addendum for both roles", async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement };
  t.after(() => {
    globalThis.document = previousDocument;
  });

  const { finaleStepCount, renderScreen } = await import("../web/screens.js");
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

  const totalSteps = MISSIONS.length + 2;
  for (const role of ["handler", "agent"]) {
    const state = room.snapshot(role);
    assert.equal(state.phase, "finale");
    assert.equal(finaleStepCount(state), totalSteps);

    // Page 1: Case Closed + campaign totals.
    const page1 = renderScreen(gameView(state, { finaleStep: 0 }));
    const page1Text = textContent(page1);
    assert.ok(page1Text.includes("DECLASSIFIED"));
    assert.ok(page1Text.includes(`PAGE 1 / ${totalSteps}`));
    assert.ok(page1Text.includes("Case Closed"));
    assert.ok(page1Text.includes("Campaign totals"));
    assert.ok(page1Text.includes(`${state.campaign.signal}%`));
    assert.ok(page1Text.includes(state.campaign.most_jammed.word));
    assert.ok(page1Text.includes("Next · Case 01"));
    assert.ok(page1Text.includes("TRANSMISSION ENDED"));
    assert.equal(page1Text.includes("H E L L O"), false);
    assert.equal(findAll(page1, (node) => node.attrs?.["data-action"] === "finale-next").length, 1);
    assert.equal(findAll(page1, (node) => node.attrs?.["data-action"] === "ready").length, 0);

    // Pages 2..9: Each case revealed one by one.
    MISSIONS.forEach((mission, index) => {
      const step = index + 1;
      const caseScreen = renderScreen(gameView(state, { finaleStep: step }));
      const caseText = textContent(caseScreen);
      const caseNum = String(index + 1).padStart(2, "0");
      assert.ok(caseText.includes(`CASE FILE ${caseNum} OF ${String(MISSIONS.length).padStart(2, "0")}`));
      assert.ok(caseText.includes(`PAGE ${step + 1} / ${totalSteps}`));
      assert.ok(caseText.includes(mission.name));
      assert.ok(caseText.includes(mission.briefing));
      const nextMission = MISSIONS[index + 1];
      if (nextMission) {
        assert.equal(caseText.includes(nextMission.briefing), false);
        assert.ok(caseText.includes(`Next · Case ${String(index + 2).padStart(2, "0")}`));
      } else {
        assert.ok(caseText.includes("Next · Addendum"));
      }
      assert.equal(findAll(caseScreen, (node) => node.attrs?.["data-action"] === "finale-back").length, 1);
      assert.equal(findAll(caseScreen, (node) => node.attrs?.["data-action"] === "finale-next").length, 1);
      assert.equal(findAll(caseScreen, (node) => node.attrs?.["data-action"] === "ready").length, 0);
    });

    // Final page: Station PO1 addendum + Replay campaign.
    const lastPage = renderScreen(gameView(state, { finaleStep: totalSteps - 1 }));
    const lastText = textContent(lastPage);
    assert.ok(lastText.includes(`PAGE ${totalSteps} / ${totalSteps}`));
    assert.ok(lastText.includes("STATION PO1"));
    assert.ok(lastText.includes("Next Directive"));
    assert.ok(lastText.includes("ADDENDUM · STATION PO1"));
    assert.ok(lastText.includes("blowing up Southampton"));
    assert.ok(lastText.includes("Replay campaign"));
    assert.equal(findAll(lastPage, (node) => node.attrs?.["data-action"] === "finale-back").length, 1);
    assert.equal(findAll(lastPage, (node) => node.attrs?.["data-action"] === "ready").length, 1);
  }

  const cleanState = {
    ...room.snapshot("agent"),
    campaign: { ...room.snapshot("agent").campaign, intercepts: 0, signal: 100, most_jammed: null },
  };
  assert.ok(textContent(renderScreen(gameView(cleanState, { finaleStep: 0 }))).includes("None · clean channel"));
});
