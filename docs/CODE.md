# Code reference

This is a file-by-file guide to every class and function: what it does, what it takes and returns, and what calls it. For the game rules, the message protocol and deployment, read [How it works](HOW-IT-WORKS.md) first. This page assumes you know those. To add levels or features, see [Extending the game](EXTENDING.md).

Line links point at `main` when this was written. If they drift, search for the function name.

## Contents

- [Conventions used everywhere](#conventions-used-everywhere)
- [`web/radio.js`](#webradiojs): shared word list
- [`operation.js`](#operationjs): game rules
- [`server.js`](#serverjs): web and WebSocket server
- [`web/game.js`](#webgamejs): browser client
- [`web/screens.js`](#webscreensjs): screen building
- [`web/style.css`](#webstylecss)
- [Tests](#tests)
- [How a click becomes a move](#how-a-click-becomes-a-move): one action traced end to end

## Conventions used everywhere

- **Roles vs call signs.** In code, the two roles are always `"handler"` and `"agent"`. The names players see, `MAGPIE` and `WREN`, only come from `CALLSIGNS` in `web/radio.js`.
- **Positions are `[x, y]` arrays.** `x` is the column (0–7, left to right) and `y` is the row (0–7, top to bottom). The map is a list of 8 strings, so the tile at a position is `grid[y][x]`. On screen, positions show as chess-style labels: `A1` is the top-left square.
- **Rule methods return `[changed, notice]`.** `changed` is `true` if the game state changed, in which case the server sends both players a new snapshot. `notice` is a message for the player who acted, or `""`. A blocked move returns `[false, ""]`: nothing happens and no message is shown.
- **Time comes from an injected `now()`.** `Room` and `createGameServer` take a `now` function, which defaults to `performance.now()` and returns milliseconds. Tests pass a fake clock so they can jump forward in time without waiting.
- **Snapshot fields use `snake_case`** (`round_limit`, `last_seen`), and everything else in the JavaScript uses `camelCase`. That's because the message format was kept from the old Python server. Don't rename snapshot fields unless you change both `operation.js` and `web/` together.
- **No build step.** The browser loads `web/*.js` exactly as written, so code there must run in a browser without being bundled first. `web/radio.js` is loaded by both the browser and Node, so it must not use anything that only exists in one of them.

## `web/radio.js`

The radio vocabulary, loaded by both the browser and the server.

| Export | Meaning |
|---|---|
| `WORD_GROUPS` | 7 categories (ACTION, DIRECTION, PLACE, COLOUR, ITEM, NUMBER, REPORT) of 6 words each. The browser shows these as tabs. The server builds its allowed-word list from them, so adding a word here is enough to make it sendable. |
| `MESSAGE_LIMIT` | 6. The most tiles in one message. |
| `REDACTED` | `"[STATIC]"`. What a jammed tile is replaced with in what the receiver hears. The browser draws it as `███`. |
| `CALLSIGNS` | `{ handler: "MAGPIE", agent: "WREN" }`. Its keys also set the list of roles (`ROLES` in `operation.js`). |

## `operation.js`

All the game rules. It doesn't touch the network: `server.js` passes each player command in and sends snapshots out.

### Constants

| Name | Meaning |
|---|---|
| `ROLES` | `["handler", "agent"]`, from `CALLSIGNS`. |
| `WORDS` | A set of every allowed radio word. `transmit` rejects anything else. |
| `DIRECTIONS` | Maps `up`/`down`/`left`/`right` to an `[dx, dy]` step. |
| `OUTCOMES` | The three end-of-case phases: `cleared`, `failed`, `complete`. |
| `MISSION_MS`, `ROUND_LIMIT`, `ACTION_POINTS` | 10 minutes, 8 rounds, 4 points. |
| [`MISSIONS`](../operation.js#L13) | The three cases. Each has `name`, `briefing`, `package`, `destination`, `decoy`, `risk` (shown as "Interference"), `grid` (8 strings), and `patrol` (a list of `[x, y]`). |

### Helper functions

| Function | Does |
|---|---|
| [`site(mission, marker)`](../operation.js#L37) | Returns the `[x, y]` of the first tile with that letter (`"S"`, `"D"`, `"X"` or `"E"`). Used when a case starts. |
| [`samePosition(a, b)`](../operation.js#L42) | `true` if two positions match. `b` may be `null` (an item that has been picked up), which returns `false`. |
| [`redactionCount(tiles)`](../operation.js#L46) | Counts `[STATIC]` tiles in a message. |
| [`signalScore(sent, blocked)`](../operation.js#L50) | The debrief signal %: `round(100 × (sent − blocked) / sent)`, or 100 if nothing was sent. |

### `class Room`

One `Room` is one game between two players. It holds everything about that game.

**State it keeps.** These carry over between cases:
- `code`
- `tokens` (role → secret reconnect token)
- `peers` (role → the server's client object for that player)
- `missionIndex` (0–2)
- `words` (word → number of messages it has appeared in; this is ECHO's memory)
- `emptySince`

Everything else is reset at the start of each case by `prepareCase()`.

| Method | Does | Called by |
|---|---|---|
| [`constructor(code, now)`](../operation.js#L55) | Sets up an empty room on case 1, in the `lobby` phase. | `Multiplayer.createRoom` |
| [`get mission`](../operation.js#L67) | The current entry from `MISSIONS`. | Throughout |
| [`get paired`](../operation.js#L71) | `true` when both players are connected. Most actions, and the mission clock, need this. | `command`, `expireMission`, `snapshot` |
| [`get guard`](../operation.js#L75) | The guard's current square. Walks the patrol route forward then back ("ping-pong"), using `patrolStep`, which goes up by one for every point Wren spends. For a route of length *n*, it repeats every `2(n−1)` steps. | `spendPoint`, `snapshot` |
| [`connect(role, peer)`](../operation.js#L82) | Adds a player. Creates their token the first time. Moves `lobby` → `briefing` once both are in. If the clock was paused, it pushes the deadline back by how long the pause lasted. Returns the token. | `Multiplayer.join` |
| [`disconnect(role)`](../operation.js#L95) | Removes a player and clears their *ready*. If a case is running, it pauses the clock. If the room is now empty, it records when (for the 10-minute clean-up). | `Multiplayer.disconnect` |
| [`prepareCase()`](../operation.js#L102) | Resets everything for a fresh attempt at `missionIndex`: stage, round, points, all positions, bag, guard, suspicion, keys, decoded tiles, transmissions, activity log, ready list, clock and result. **Leaves `words` alone**, which is why ECHO remembers words across cases and retries. | `constructor`, `confirm` |
| [`confirm(role)`](../operation.js#L127) | Marks a player ready. Once both are ready: on the briefing it starts the case and the clock. After a case it goes to the next case (`cleared`), back to case 1 with ECHO's memory wiped (`complete`), or retries (`failed`), then calls `prepareCase()`. | `command` |
| [`expireMission()`](../operation.js#L145) | If a case is running, both players are connected and time is up, it fails the case and returns `true`. It doesn't fire while paused, so a disconnect can't run out the clock. | `Multiplayer.receive`, `Multiplayer.maintainRooms` |
| [`finish(phase, result)`](../operation.js#L151) | Ends the case with an outcome and a result sentence. Recording `finishedAt` freezes the timer that the snapshot reports. | `act`, `raiseSuspicion`, `transmit`, `expireMission` |
| [`command(role, data)`](../operation.js#L157) | **The single entry point for player actions.** See [below](#how-command-decides). | `Multiplayer.receive` |
| [`move(direction)`](../operation.js#L178) | Moves Wren one square if the direction is valid, on the map, and not a wall, then spends a point. | `command` |
| [`act(action)`](../operation.js#L189) | `take`, `drop`, `use`, `wait`. Handles the bag, the decoy's suspicion changes and delivery. Delivery costs a point *without* calling `spendPoint()`, so the guard doesn't move and Wren can't be spotted on the winning action. Every other successful action ends with `spendPoint()`. | `command` |
| [`record(text)`](../operation.js#L231) | Adds a line to `activity[round]`. The debrief's transmission log shows the last line of each round. | `act`, `spendPoint`, `decrypt` |
| [`raiseSuspicion(amount)`](../operation.js#L235) | Adds suspicion (up to 100), tracks the peak, and fails the case at 100. | `act`, `spendPoint` |
| [`spendPoint()`](../operation.js#L241) | Uses one action point and moves the guard one step. If the guard is then within one square of Wren (not counting diagonals), it updates `lastSeen` and, the first time this round, adds +25 suspicion. | `move`, `act` |
| [`transmit(role, tiles)`](../operation.js#L254) | Sends a radio message. Checks it's this role's turn (`order` → handler, `report` → agent) and that the tiles are 1–6 allowed words. **Applies ECHO**: of the words already in 2+ earlier messages, jams the most-used (case number) of them. Only *then* adds this message's words to ECHO's memory. Saves both `sent` and `heard`, then moves the stage on. A handler's order goes to `moves`. An agent's report starts the next round, or fails the case if it was round 8. | `command` |
| [`decrypt(role)`](../operation.js#L283) | Uses the player's one key for this case. Records in `decoded` which tile of their latest incoming message to reveal (the first `[STATIC]` one). | `command` |
| [`incoming(role)`](../operation.js#L293) | The latest message sent *by the other role*, as this role heard it, with any decrypted tile filled back in. Returns `{ number, round, sender, tiles }` or `null`. | `decrypt`, `snapshot` |
| [`snapshot(role)`](../operation.js#L305) | Builds the `state` message for one role. Shared fields go to both. Then Magpie gets the full map, patrol and CCTV sighting, and Wren gets a fogged map (`?` outside 3×3), position, bag, points, and the guard only if nearby. After a case ends, both also get the debrief data. `seconds` is counted from `finishedAt`, else `pausedAt`, else now, so the clock looks frozen when the case is over or paused. | `Multiplayer.publish` |

#### How `command` decides

[`command`](../operation.js#L157) runs these checks in order, and the first one that matches decides the result:

1. Partner not connected → *"Waiting for your partner."*
2. `ready` on the briefing or a debrief → `confirm`.
3. Not in a running case → *"The channel is on hold."*
4. `decrypt` → `decrypt`. Either player, at any stage.
5. `radio` → `transmit`, which checks whose turn it is itself.
6. Anything else must be Wren during the `moves` stage → otherwise *"Wait for the next order."*
7. `end_moves` → stage becomes `report`.
8. No points left → *"No action points left this round."*
9. `move` → `move`. `interact` becomes `take` or `drop`, depending on whether the bag is empty. `take`/`drop`/`use`/`wait` → `act`.
10. Anything else → *"That action is unavailable."*

## `server.js`

Serves the website, runs the WebSocket, and keeps track of rooms. It uses Node's built-in `http` module plus the `ws` package.

### Constants

| Name | Meaning |
|---|---|
| `CODE_ALPHABET` | 32 easy-to-read characters for room codes (no `I`, `O`, `0`, `1`). |
| `MAX_ROOMS`, `EMPTY_ROOM_MS` | 100 rooms at most. Empty rooms are deleted after 10 minutes. |
| `TITLE`, `DESCRIPTION` | Used in the link-preview tags. |
| `INDEX` | `web/index.html`, **read once at startup**. After editing it, restart the server. Other files are read fresh on every request. |
| [`ASSETS`](../server.js#L17) | **The list of files the browser is allowed to download**, each with its content type. Anything not listed returns 404. A new file in `web/` must be added here. |

### Functions

| Function | Does |
|---|---|
| [`embedTags(request)`](../server.js#L31) | Builds the link-preview `<meta>` tags (Open Graph and Twitter) with full URLs. The URL uses `https` if the request came through the proxy (an `X-Forwarded-Proto: https` or `X-Forwarded-For` header), and `http` otherwise. Values are escaped for HTML. |
| [`servePage(request, response)`](../server.js#L55) | The HTTP handler. Non-GET/HEAD requests get 405. Anything after `?` is ignored. `/` returns `INDEX` with `<!-- LINK_PREVIEW -->` replaced by the tags (with `no-cache`, so a deploy shows up straight away). Files in `ASSETS` are read from `web/`; images and fonts are cached for a day, scripts and CSS use `no-cache`. Everything else gets 404. |
| [`sameOrigin(request)`](../server.js#L213) | Allows a WebSocket only if its `Origin` matches the page's host, so other websites can't connect to the game. A missing `Origin` is allowed; that's how the tests connect, since browsers always send one. |
| [`createGameServer(now)`](../server.js#L223) | Builds and returns the HTTP server (not yet listening). Connects the `/ws` upgrade, which answers 404 for other paths and 403 for other websites. Starts two timers: a 20 s heartbeat that pings every socket and drops those that didn't answer the last ping, and the 500 ms room check. Both stop when the server closes. Tests call this with `listen(0)` to get a free port. |

The block at the bottom only runs when you start `node server.js` directly (not when tests import it). It reads `--host` and `--port`, checks the port is a whole number from 0 to 65535, and starts listening.

### `class Multiplayer`

Keeps `rooms` (code → `Room`) and connects sockets to rooms. Each connection gets a plain client object, `{ socket, room, role }`, which is also what `Room.peers` stores.

| Method | Does |
|---|---|
| [`send(socket, data)`](../server.js#L86) | Sends JSON if the socket is open. If more than 128 KB is waiting to go out (a stuck client), it drops the connection instead of buffering forever. |
| [`notice(client, text)`](../server.js#L95) | Sends a `notice`. |
| [`publish(room)`](../server.js#L99) | Sends each connected player their own `room.snapshot(role)`. |
| [`join(client, room, role)`](../server.js#L103) | Links the client to the room, calls `room.connect`, sends `joined` with the token, then publishes. |
| [`disconnect(client)`](../server.js#L111) | Runs when a socket closes. Tells the room and publishes, so the partner sees "Partner disconnected". |
| [`closeRoom(client)`](../server.js#L120) | For `leave`: sends `left` to both players (with a message for the one who didn't close it) and deletes the room. |
| [`createRoom(client)`](../server.js#L135) | Refuses if 100 rooms exist. Otherwise picks random codes (from `crypto.randomInt`) until it finds an unused one, creates the `Room`, and joins the client as handler. |
| [`receive(client, data)`](../server.js#L149) | **Routes every message.** `leave` → `closeRoom`. If the client is in a room: first `expireMission()`, so a late action can't sneak in after time ran out, then `room.command()`, then publish if anything changed. If the client isn't in a room: `create`, `join` (fails if the code is unknown or Wren's role is taken), or `resume` (matches the token to a role nobody is connected as). |
| [`attach(socket)`](../server.js#L185) | Sets up a new socket. Ignores binary messages, invalid JSON, and messages without a text `type`. Drops the connection on socket errors, and calls `disconnect` on close. |
| [`maintainRooms()`](../server.js#L201) | Every 500 ms: deletes rooms that have been empty for 10 minutes, and ends cases whose time has run out (publishing the result). |

## `web/game.js`

The browser side. It loads as a module, sets up the tutorial, and creates one `Game`.

### Module-level code

| Name | Does |
|---|---|
| `SESSION_KEY` | The `sessionStorage` key that holds `{ code, token }` for reconnecting. It's kept per browser tab. |
| `TUTORIAL_KEY` | The `localStorage` key that marks the tutorial as seen. It's kept per browser. |
| `MOVEMENT_KEYS` | Arrow keys and WASD → directions. |
| [`readSession()` / `saveSession(session)`](../web/game.js#L13) | Read and write the reconnect details. Storage errors (private mode, blocked storage) are ignored, and the tab keeps the session in memory instead. |
| [`setupTutorial(dialog)`](../web/game.js#L31) | Fills in the tutorial's small maps from `data-map` (rows separated by spaces) and an optional `data-fog="x,y"` (hide everything outside the 3×3 around that square). Connects Back and Next, and turns Next into **Play** on the last step. Returns an `open()` function that resets to step 1, opens the dialog, and marks it as seen. |
| `openTutorial` | That `open()` function. Called from the lobby's *How to play* button, and automatically at startup if `TUTORIAL_KEY` isn't set. |

### `class Game`

Holds the client's state:
- `state`: the latest snapshot from the server, or `null` when in the lobby
- `stateAt`: when that snapshot arrived, used by the timer
- `socket`, `session`, `resuming`
- `notice`
- `code`: the room code being typed
- `copied`
- `draft`: the message being written
- `category`: the word tab being shown

**Event handling** is set up once in the [constructor](../web/game.js#L69), on the `#game` element:
- **Clicks:** any `button[data-action]` calls `command(action, value)`. Screens never attach their own click handlers.
- **Typing the room code:** only letters and digits are kept, uppercased and cut to 5 characters. The Join button is updated *directly*, without a full redraw, so the text field keeps focus and the phone keyboard stays open.
- **Submitting the join form** → `command("join")`.
- **Closing the leave dialog** with *Close room* → `command("leave")`.
- **Key presses** → `onKey`.

| Member | Does |
|---|---|
| [`get online`](../web/game.js#L108) | The socket is open and not waiting for a resume to finish. Buttons that need the server are disabled when this is `false`. |
| [`get available`](../web/game.js#L112) | Online, and both players are connected. |
| [`get composing`](../web/game.js#L116) / [`get moving`](../web/game.js#L121) | Whether it's this player's turn to write a message, or (Wren only) to move. |
| [`get canDecrypt`](../web/game.js#L126) | The key is unused and the latest incoming message has static. |
| [`get status`](../web/game.js#L130) | The status line, in priority order: connecting or reconnecting, "Partner disconnected", then the latest notice. |
| [`connect()`](../web/game.js#L140) | Opens the WebSocket (`wss:` on HTTPS). When it opens, it sends `resume` if there's a saved session. When it closes, it freezes the timer display and tries again in 2 s, forever. |
| [`send(message)`](../web/game.js#L161) | Sends JSON if connected. Returns whether it sent. |
| [`receive(message)`](../web/game.js#L167) | Handles server messages. `joined` saves the session. `state` stores the snapshot, and on a new screen (phase, stage or case changed) it clears the draft and notice and scrolls to the top. `left`/`resume_failed` clear the session and go back to the lobby. `notice` shows the text. |
| [`copyCode()`](../web/game.js#L208) | Copies the room code to the clipboard, shows *Copied* for 2 s, or shows a notice if copying fails. If the room changed while it was copying, it does nothing. |
| [`command(action, value)`](../web/game.js#L226) | **Every button goes through here.** Some actions are handled in the browser only: `tutorial`, `copy`, `confirm-leave` (opens the dialog), and `category`/`tile`/`remove` (editing the draft). Everything else becomes a server message: `transmit` → `radio` with the draft, `join` gets the code, `move` gets the direction. If the send works, it clears the notice and redraws. |
| [`onKey(event)`](../web/game.js#L266) | Keyboard shortcuts. It ignores held-down repeats, IME input, modifier keys, and anything while a dialog is open. In a text field, only Escape (to leave the field) is handled. Enter does whatever fits the screen. WASD/arrows move and E interacts, only while Wren can move. |
| [`remainingSeconds()`](../web/game.js#L297) / [`updateTimer()`](../web/game.js#L301) | The timer counts down locally from the snapshot's `seconds` minus the time since it arrived. `updateTimer` runs every 250 ms and only changes the `#timer` text, without a full redraw. |
| [`render()`](../web/game.js#L310) | Rebuilds the whole screen with `renderScreen(this)` and swaps it in. Then it puts focus back on the matching element (same `id`, or same `data-action` + `data-value`) and restores the text cursor, so keyboard and screen-reader users don't lose their place. |

## `web/screens.js`

Turns the `Game` object into page elements. It only reads `game`; it never changes it or talks to the server. Everything is built with [`node()`](../web/screens.js#L17), which creates elements and adds text as plain text. No `innerHTML` is used anywhere, so text from the server can't inject HTML or scripts.

### Small building blocks

| Function | Builds |
|---|---|
| [`node(tag, attributes, ...children)`](../web/screens.js#L17) | Any element. Empty (`null`/`undefined`) children are skipped. |
| [`button(text, action, options)`](../web/screens.js#L26) | A button with `data-action`, and optionally `data-value`, a CSS class, `disabled`, and an `aria-label`. This `data-action` is what `Game.command` receives. |
| `caption`, `status`, `number`, `stamp`, `metric` | A small caption, a status line (`role="status"`, so screen readers announce it), a two-digit number (`01`), the rubber-stamp label, and a label/value pair. |
| `station`, `closeButton`, `roomFooter`, `readyButton`, `keyButton` | The "THE BUREAU" header line, the × close button, the status + close row, the Ready button (shows "Waiting for partner" once pressed), and the decrypt key button (`×1` / `×0`). |

### Screens

| Function | Screen |
|---|---|
| [`renderScreen(game)`](../web/screens.js#L323) | **The only export.** Picks a screen from `state.phase`: no state or `lobby` → `lobby`, `briefing`, `active`, otherwise `debrief`. |
| [`lobby(game)`](../web/screens.js#L63) | Before joining: create, room code field, join, and how to play. After creating a room: the code, Copy, waiting status, and Close room. |
| [`briefing(game)`](../web/screens.js#L99) | The case file: name, briefing text, objective, rounds, guards, interference, your role, your partner's status, and Ready. |
| [`active(game)`](../web/screens.js#L260) | A running case. Magpie, and Wren while writing a report, get the map, incoming message, ECHO line and message composer. Wren while moving gets the map and `agentControls`. |
| [`debrief(game)`](../web/screens.js#L304) | Outcome stamp, signal / rounds / peak suspicion, the result sentence, the worst intercept, the transmission log, and Ready labelled *Next case*, *Retry case* or *Replay campaign*. Also shows a "H E L L O" message from an unknown sender, as flavour. |

### Pieces of the play screens

| Function | Builds |
|---|---|
| [`header(state)`](../web/screens.js#L125) | Role, case, round, call sign, the `#timer` element (filled in by `updateTimer`), and the suspicion meter. |
| [`map(state)`](../web/screens.js#L144) | The 8×8 grid. [`MAP_TILES`](../web/screens.js#L4) turns letters into CSS classes and labels, and `DROP_LABELS` names the drop point for each case (FTN, STN, PARK). It adds the patrol outline, the last-seen `?`, Wren `W` and guard `G`. Each square has a coordinate tooltip and label, such as `C4 · wall`. |
| [`mapLegend(state)`](../web/screens.js#L169) | Magpie's legend and the CCTV line ("Wren crossed C4 · Round 2"). |
| [`tiles(words, highlighted)`](../web/screens.js#L182) | A row of word tiles. `[STATIC]` is drawn as `███` with an "Intercepted tile" label. Tiles listed in `highlighted` are shown in red (used by the worst intercept). |
| [`incoming(packet)`](../web/screens.js#L191) | The paper card with the latest received message. |
| [`echo(text)`](../web/screens.js#L199) | The "▒ ECHO" line, which changes when the incoming message has static. |
| [`composer(game, heading)`](../web/screens.js#L208) | The 6 draft slots (tap a word to remove it), category tabs, the word bank, the key, and Transmit. Every part is disabled when it's not your turn. |
| [`agentControls(game)`](../web/screens.js#L236) | Action points, bag, incoming message, the arrow pad, Take/Drop/Wait/Use, the decrypt key, and *End moves*. |
| [`worstIntercept(entries)`](../web/screens.js#L278) / [`transmissionLog(state)`](../web/screens.js#L294) | The debrief's worst message (sent vs heard) and the full per-round log. |
| `coordinate([x, y])`, `isAt(location, x, y)` | `[2, 3]` → `"C4"`, and a position check that copes with `null`. |

## `web/style.css`

One stylesheet. In rough order:

1. **Fonts:** IBM Plex Mono for text, Special Elite for titles.
2. **Colours:** CSS variables on `:root` (`--paper`, `--ink`, `--amber`, `--red` and so on). Use these instead of new hex values.
3. **Base elements:** buttons (44 px minimum height, so they're easy to tap) and focus outlines.
4. **The paper "case file" look,** then the lobby (including the full-screen menu height, `100svh`), briefing, map tiles, radio tiles, composer, Wren's controls, debrief and dialogs.
5. **The tutorial** (`.tut-*`) at the end. Each animation loops every 4 s, and the element's normal style is the *finished* picture. Under `prefers-reduced-motion`, animations are switched off and players see that finished picture.

## Tests

`npm test` runs every file in `test/` with Node's built-in test runner.

- **`test/operation.test.js`** tests `Room` directly, without any network. It has three helpers:
  - `pairedRoom(now)`: a room with both players connected, using a fake clock
  - `command(room, role, type, extra)`: sends an action and checks it worked
  - `ready(room)`: readies both players

  The tests play full case routes, check ECHO and the decrypt key, and move the fake clock forward to test pausing.
- **`test/server.test.js`** starts a real server on a free port (`startServer`), and connects real WebSocket clients through a `connect()` helper. Its `receive(type)` waits for the next message of that type. One test checks the HTTP side: the page, preview tags, files, and 404s. The other plays a create/join/move/reconnect/leave session.

When you change rules, add or update a test in `operation.test.js`. It's fast and doesn't need a server.

## How a click becomes a move

Following one action through every file:

1. Wren taps **→**. The button was built by `agentControls` with `data-action="move"` and `data-value="right"`.
2. The click handler in `Game`'s constructor calls `command("move", "right")`. That isn't a browser-only action, so it sends `{"type":"move","direction":"right"}` over the WebSocket.
3. On the server, `attach` parses the JSON and passes it to `Multiplayer.receive`. The client is in a room, so it runs `room.expireMission()` and then `room.command("agent", data)`.
4. `command` checks the partner is connected, the case is running, it's Wren's `moves` stage and points are left, then calls `move("right")`. That updates `position` and calls `spendPoint()`, which moves the guard and maybe spots Wren.
5. `command` returns `[true, ""]`, so `publish` sends **each player their own** `snapshot`: Wren's with the new fogged view, Magpie's with the full map.
6. In each browser, `receive` stores the snapshot and calls `render()`. `renderScreen` rebuilds the screen, and the tile moves.
