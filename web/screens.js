// Builds each screen from the latest server snapshot. No game state lives here.
import { CALLSIGNS, MESSAGE_LIMIT, REDACTED, WORD_GROUPS } from "./radio.js";

const MAP_TILES = {
  "?": ["unknown", ""],
  ".": ["street", ""],
  "#": ["wall", ""],
  "D": ["package", "CAFÉ"],
  "X": ["decoy", "CAFÉ"],
  "E": ["drop", ""],
  "P": ["park", "PARK"],
  "T": ["station", "STN"],
  "S": ["start", "START"],
};

function node(tag, attributes, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes ?? {})) {
    element.setAttribute(key, value);
  }
  element.append(...children.filter((child) => child != null));
  return element;
}

function button(text, action, { disabled = false, style = "", value = "", label } = {}) {
  const element = node("button", { type: "button", class: style, "data-action": action },
    text);
  if (value !== "") element.dataset.value = value;
  if (label) element.setAttribute("aria-label", label);
  element.disabled = disabled;
  return element;
}

function caption(text) {
  return node("span", { class: "caption" }, text);
}

function status(text) {
  return node("p", { class: "status", role: "status" }, text);
}

function number(value) {
  return String(value).padStart(2, "0");
}

function station() {
  return node("header", { class: "station" },
    "THE BUREAU · KESSEL · 1974",
    node("span", { class: "station-meta" },
      caption("CH 7.215 MHz"),
      button("[LOCK]", "lock", { style: "lock-btn", label: "Lock station and re-run clearance captcha" })));
}

function stamp(text, success = false) {
  return node("span", { class: success ? "stamp success" : "stamp" }, text);
}

function closeButton(game) {
  return button("×", "confirm-leave", { disabled: !game.online, label: "Close room" });
}

function roomFooter(game, text) {
  return node("div", { class: "room-footer" }, status(text), closeButton(game));
}

function lobby(game) {
  const paper = node("section", { class: "paper case-file lobby" },
    stamp("CONFIDENTIAL"), caption("LOST IN TRANSMISSION"), node("h1", null, "Open a channel"));
  if (game.state) {
    paper.append(
      caption("ROOM CODE"),
      node("div", { class: "room-code" },
        node("strong", null, game.state.code),
        button(game.copied ? "Copied" : "Copy", "copy", { style: game.copied ? "primary" : "" })),
      node("p", null, "Share this code with Wren to open the case file."),
      status(game.status || "Waiting for Wren to connect."));
    return node("div", { class: "screen" }, station(), paper,
      button("Close room", "confirm-leave", { disabled: !game.online }));
  }

  const input = node("input", {
    id: "room-code", name: "code", type: "text", autocomplete: "off",
    autocapitalize: "characters", spellcheck: "false", placeholder: "ENTER ROOM CODE", maxlength: 5,
    "aria-label": "Room code",
  });
  input.value = game.code;
  const join = node("button", { type: "submit", id: "join-room" }, "Join room · Wren");
  join.disabled = !game.online || game.code.length !== 5;
  paper.append(
    node("p", null, "Magpie reads the map. Wren works the street. Orders and reports go over the radio."),
    button("Create room · Magpie", "create", { style: "primary", disabled: !game.online }),
    node("form", { id: "join-form", class: "join-form" }, input, join),
    button("How to play", "tutorial"),
    status(game.status));
  return node("div", { class: "screen" }, station(), paper);
}

function metric(label, value) {
  return node("div", null, node("dt", null, label), node("dd", null, String(value)));
}

function briefing(game) {
  const { state } = game;
  const handler = state.role === "handler";
  const partner = handler ? "agent" : "handler";
  const paper = node("section", { class: "paper case-file" },
    stamp("CONFIDENTIAL"), caption(`CASE FILE ${number(state.mission)}`), node("h1", null, state.name),
    node("blockquote", null, `“${state.briefing}”`),
    node("dl", { class: "briefing-details" },
      metric("Objective", state.objective), metric("Rounds", state.round_limit),
      metric("Guards", "1, on patrol"), metric("Interference", state.interference)),
    node("p", null, handler
      ? "You are MAGPIE, the handler. You see the map. You do not see Wren."
      : "You are WREN, the agent. You see the street around you. Magpie has the map."),
    node("p", null, handler ? "Partner: WREN, on the street." : "Partner: MAGPIE, on the radio."),
    node("p", { class: "caption" }, "No talking. Everything goes over the radio."));
  const partnerStatus = `${CALLSIGNS[partner]} is on the channel${state.ready.includes(partner) ? " and ready" : ""}.`;
  return node("div", { class: "screen" }, station(), paper,
    roomFooter(game, game.status || partnerStatus), readyButton(game, "Ready · Open channel"));
}

function readyButton(game, text) {
  const ready = game.state.ready.includes(game.state.role);
  return button(ready ? "Waiting for partner" : text, "ready",
    { style: "primary", disabled: !game.available || ready });
}

function header(state) {
  return node("header", { class: "game-header" },
    node("div", { class: "header-row" }, caption(`${state.role.toUpperCase()} · CASE ${number(state.mission)}`),
      node("span", null, `ROUND ${state.round} / ${state.round_limit}`)),
    node("div", { class: "header-row" }, node("h1", null, CALLSIGNS[state.role]),
      node("span", { id: "timer", class: "caption", "aria-label": "Time remaining" }),
      node("div", { class: "suspicion" }, caption("SUSPICION"),
        node("meter", { min: 0, max: 100, value: state.suspicion, "aria-label": "Suspicion" }),
        node("strong", null, String(state.suspicion)))));
}

function coordinate([x, y]) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function isAt(location, x, y) {
  return location?.[0] === x && location[1] === y;
}

function map(state) {
  const rows = state.grid.map((row, y) => node("div", { role: "row" },
    ...[...row].map((tile, x) => {
      const [terrain, label] = MAP_TILES[tile];
      const classes = ["tile", terrain];
      let mark = tile === "E" ? state.drop_label : label;
      if (tile === "S" && state.role === "agent") mark = "";
      if (state.patrol?.some((location) => isAt(location, x, y))) classes.push("patrol");
      if (isAt(state.last_seen?.position, x, y)) {
        classes.push("last-seen");
        mark = "?";
      }
      if (isAt(state.position, x, y)) {
        classes.push("wren");
        mark = "W";
      } else if (isAt(state.guard, x, y)) {
        classes.push("guard");
        mark = "G";
      }
      const title = [coordinate([x, y]), ...classes.slice(1)].join(" · ");
      return node("span", { role: "cell", class: classes.join(" "), title, "aria-label": title }, mark);
    })));
  return node("div", { class: "map", role: "table", "aria-label": "Street map",
    style: `--cols: ${state.grid[0].length}; --rows: ${state.grid.length}` }, ...rows);
}

function mapLegend(state) {
  const labels = [
    ["last-seen", "Last seen"], ["patrol", "Guard route"],
    ["package", `${state.package[0].toUpperCase()}${state.package.slice(1)}`], ["drop", "Drop point"],
  ];
  const sighting = state.last_seen;
  return node("aside", { class: "map-legend" },
    caption("LEGEND"), node("ul", null, ...labels.map(([style, label]) =>
      node("li", null, node("span", { class: `tile ${style}`, "aria-hidden": "true" }), label))),
    node("div", { class: "camera" }, caption("CCTV · CAM 2"),
      sighting ? `Wren crossed ${coordinate(sighting.position)} · Round ${sighting.round}` : "No sighting yet"));
}

function tiles(words, highlighted = []) {
  return node("div", { class: "tiles" }, ...words.map((word, index) => {
    const redacted = word === REDACTED;
    const style = redacted ? "word redacted" : highlighted.includes(index) ? "word intercepted" : "word";
    return node("span", { class: style, ...(redacted && { "aria-label": "Intercepted tile", title: "Intercepted tile" }) },
      redacted ? "███" : word);
  }));
}

function incoming(packet) {
  return node("section", { class: "paper incoming" }, packet
    ? node("div", { class: "split" }, caption(`FROM ${packet.sender} · RX ${number(packet.number)}`),
      caption(`R${number(packet.round)}`))
    : caption("INCOMING RADIO"),
  packet ? tiles(packet.tiles) : node("p", null, "No transmission received yet"));
}

function echo(text) {
  return node("div", { class: "echo" }, node("strong", null, "▒ ECHO"), text);
}

function keyButton(game, label = "Key") {
  return button(`${label} ×${Number(game.state.key)}`, "decrypt",
    { style: "key", disabled: !game.canDecrypt });
}

function composer(game, heading) {
  const enabled = game.composing;
  const { draft, category } = game;
  const slots = Array.from({ length: MESSAGE_LIMIT }, (_, index) => {
    const word = draft[index];
    if (!word) return node("span", { class: "slot", "aria-hidden": "true" });
    return button(word, "remove", { style: "word", value: String(index),
      disabled: !enabled, label: `Remove ${word}` });
  });
  const categories = Object.keys(WORD_GROUPS).map((name) => {
    const choice = button(name, "category", { value: name, disabled: !enabled, style: name === category ? "selected" : "" });
    choice.setAttribute("aria-pressed", String(name === category));
    return choice;
  });
  const words = WORD_GROUPS[category].map((word) => button(word, "tile", {
    value: word, disabled: !enabled || draft.length === MESSAGE_LIMIT,
  }));
  const waiting = game.state.role === "handler" && game.state.stage !== "order";
  return node("section", { class: "composer" },
    node("div", { class: "split" }, caption(heading), caption(`${draft.length} / ${MESSAGE_LIMIT} TILES`)),
    node("div", { class: `draft tiles${enabled ? " active" : ""}`, "aria-label": "Draft transmission" }, ...slots),
    node("div", { class: "categories", "aria-label": "Word categories" }, ...categories),
    node("div", { class: "word-bank" }, ...words),
    roomFooter(game, game.status || (waiting ? "Waiting for WREN." : "")),
    node("div", { class: "transmit" }, keyButton(game),
      button("Transmit", "transmit", { style: "primary", disabled: !enabled || draft.length === 0 })));
}

function agentControls(game) {
  const { state } = game;
  const enabled = game.moving && state.points > 0;
  const points = Array.from({ length: state.point_limit }, (_, i) =>
    node("span", { class: i < state.points ? "point charged" : "point" }));
  const arrows = [["up", "↑"], ["left", "←"], ["right", "→"], ["down", "↓"]];
  const actions = ["take", "drop", "wait", "use"];
  return [
    node("div", { class: "action-points" },
      caption("ACTION POINTS"),
      node("span", { class: "points", role: "img", "aria-label": `${state.points} of ${state.point_limit} action points` }, ...points),
      node("span", null, `BAG: ${state.bag ?? "empty"}`)),
    incoming(state.incoming),
    node("div", { class: "controls" },
      node("div", { class: "direction-pad" }, caption("MOVE"), ...arrows.map(([direction, text]) =>
        button(text, "move", { value: direction, style: direction, disabled: !enabled, label: `Move ${direction}` }))),
      node("div", { class: "actions" },
        ...actions.map((action) => button(action, action, { disabled: !enabled })),
        keyButton(game, "Decrypt key"))),
    roomFooter(game, game.status || (state.stage === "order" ? "MAGPIE is composing an order." : "")),
    button("End moves · Write report", "end_moves", { style: "primary", disabled: !game.moving }),
  ];
}

function active(game) {
  const { state } = game;
  let body;
  if (state.role === "handler" || state.stage === "report") {
    const handler = state.role === "handler";
    const mapArea = handler
      ? node("div", { class: "map-and-legend" }, map(state), mapLegend(state))
      : node("div", { class: "report-map" }, map(state));
    const intercepted = state.incoming?.tiles.includes(REDACTED);
    body = [mapArea, incoming(state.incoming),
      echo(intercepted ? "▓ ░ · · intercept detected" : "· · · ▓ ░ · · listening"),
      composer(game, handler ? "NEW ORDER" : "FIELD REPORT")];
  } else {
    body = [map(state), ...agentControls(game)];
  }
  return node("div", { class: "screen active-screen" }, header(state), ...body);
}

function worstIntercept(entries) {
  let worst;
  let mostBlocked = 0;
  for (const entry of entries) {
    const blocked = entry.heard.flatMap((word, index) => word === REDACTED ? [index] : []);
    if (blocked.length > mostBlocked) {
      worst = node("section", { class: "intercept" },
        caption(`WORST INTERCEPT · ROUND ${entry.round}`),
        node("div", null, caption("SENT"), tiles(entry.sent, blocked)),
        node("div", null, caption("HEARD"), tiles(entry.heard)));
      mostBlocked = blocked.length;
    }
  }
  return worst;
}

function transmissionLog(state) {
  const entries = state.transmissions.map((entry) =>
    node("li", null, caption(`R${entry.round} · ${CALLSIGNS[entry.sender]}`),
      node("p", null, entry.sent.join(" ")),
      node("p", { class: "heard" }, `→ ${entry.heard.map((tile) => tile === REDACTED ? "███" : tile).join(" ")}`),
      node("p", { class: "caption" }, state.activity[entry.round]?.at(-1) ?? "")));
  return node("section", { class: "transmission-log" }, node("h2", { class: "caption" }, "Transmission log"),
    entries.length > 0 ? node("ol", null, ...entries) : node("p", null, "No transmissions recorded."));
}

function debrief(game) {
  const { state } = game;
  const failed = state.phase === "failed";
  const action = failed ? "Retry case" : state.phase === "complete" ? "Replay campaign" : `Next case · ${state.next_case}`;
  const paper = node("section", { class: "paper case-file debrief" },
    stamp(failed ? "COVER BLOWN" : "COMPLETED", !failed),
    caption(`DEBRIEF · CASE ${number(state.mission)}`), node("h1", null, state.name),
    node("dl", { class: "debrief-details" },
      metric("Signal", `${state.signal}%`), metric("Rounds", `${state.round} / ${state.round_limit}`),
      metric("Peak susp.", state.peak_suspicion)),
    node("p", { class: "result" }, state.result), worstIntercept(state.transmissions), transmissionLog(state));
  return node("div", { class: "screen" }, paper,
    node("div", { class: "echo incoming-echo" },
      node("div", null, caption("INCOMING · SENDER UNKNOWN"), node("strong", null, "H E L L O")),
      closeButton(game)),
    game.status ? status(game.status) : null,
    readyButton(game, action));
}

export function renderScreen(game) {
  const phase = game.state?.phase;
  if (!phase || phase === "lobby") return lobby(game);
  if (phase === "briefing") return briefing(game);
  if (phase === "active") return active(game);
  return debrief(game);
}
