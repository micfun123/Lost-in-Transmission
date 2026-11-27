import assert from "node:assert/strict";
import test from "node:test";
import { Room } from "../operation.js";

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

test("completed campaigns show the ending from both roles' perspectives", async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement };
  t.after(() => {
    globalThis.document = previousDocument;
  });

  const { renderScreen } = await import("../web/screens.js");
  const campaign = {
    cases: Array.from({ length: 8 }, (_, index) => ({
      mission: index + 1,
      name: `Case ${index + 1}`,
      package: "recording",
      destination: "embassy",
      briefing: `Briefing for case ${index + 1}.`,
      rounds: index + 1,
      signal: 80,
      peak_suspicion: 0,
    })),
    totals: {
      signal: 80, rounds: 36, retries: 1, messages: 48, intercepts: 4,
      peak_suspicion: 20, most_jammed_word: "GO", most_jammed_count: 3,
    },
  };
  for (const [role, heading] of [
    ["handler", "Magpie connects the evidence"],
    ["agent", "Wren gets the full picture"],
  ]) {
    const screen = renderScreen({
      state: { phase: "complete", role, mission: 8, ready: [], campaign },
      online: false,
      available: false,
      status: "",
    });
    const content = textContent(screen);
    assert.ok(content.includes(heading));
    assert.ok(content.includes("mole inside the Bureau"));
    assert.ok(content.includes("Southampton was hit"));
    assert.ok(content.includes("MOST JAMMED WORD"));
    assert.ok(content.includes("Briefing for case 8."));
    assert.equal(findAll(screen, (node) => node.attrs?.class?.split(" ").includes("campaign-case")).length, 8);
    assert.equal(findAll(screen, (node) => node.attrs?.class?.split(" ").includes("ending-paper")).length, 1);
  }
});
