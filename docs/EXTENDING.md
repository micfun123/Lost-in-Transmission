# Extending the game

Step-by-step recipes for the most common changes: adding levels, editing maps, adding radio words, tuning difficulty, and adding new actions, map tiles or files.

It assumes you've read [How it works](HOW-IT-WORKS.md). The [code reference](CODE.md) explains each function mentioned here.

After any change, run `npm test`, then play it in two tabs with `npm start` (http://localhost:8000).

## Contents

- [Add a new level](#add-a-new-level)
- [Edit an existing map](#edit-an-existing-map)
- [Add or change radio words](#add-or-change-radio-words)
- [Tune difficulty](#tune-difficulty)
- [Add a new map tile](#add-a-new-map-tile)
- [Add a new action for Wren](#add-a-new-action-for-wren)
- [Add a new message type](#add-a-new-message-type)
- [Add a file the browser loads](#add-a-file-the-browser-loads)
- [Change the tutorial](#change-the-tutorial)

## Add a new level

Each level is one JSON file in `levels/`. The game plays them in **filename order**, so start each name with a number: `01-dead-drop.json`, `02-the-courier.json`, and so on. Moving on to the next case, the "Next case · …" label, the end of the campaign and the tests all follow the files automatically. **Adding a level means adding a file.** No code changes.

### 1. Create the file

Copy an existing level and edit it. This is a working 4th level, `levels/04-night-train.json`:

```json
{
  "name": "Night Train",
  "briefing": "A key was left at the red café. Get it to the bank before the night shift changes.",
  "package": "key",
  "destination": "bank",
  "decoy": "paper",
  "risk": "Severe",
  "dropLabel": "BANK",
  "grid": [
    "S...#...",
    ".##.#.T.",
    "...X....",
    "#.#.###.",
    "..#...D.",
    ".##.#.#.",
    "......#.",
    ".#.#...E"
  ],
  "patrol": [[5, 2], [6, 2], [7, 2], [7, 3], [7, 4]],
  "solution": {
    "route": ["down", "down", "right", "right", "right", "down", "down", "right", "right", "right", "take", "right", "down", "down", "down", "drop"],
    "peakSuspicion": 25
  }
}
```

| Field | Rules |
|---|---|
| `name` | Shown on the briefing and debrief, and as "Next case · …" on the debrief before it. |
| `briefing` | Magpie's briefing text. (Wren always gets a fixed generic briefing.) |
| `package`, `destination`, `decoy` | Lower-case nouns. They appear in the objective ("Key → bank"), the bag display, the map legend and the result text. **They must be words in `web/radio.js`** (here: `KEY`, `BANK`, `PAPER`), so players can say them over the radio. |
| `risk` | Free text shown as "Interference" on the briefing. It's a label only: ECHO's strength comes from the level's position (see [below](#echo-gets-stronger-every-level)). |
| `dropLabel` | The short label on the drop square on the map, at most about 4 letters (`FTN`, `STN`, `PARK`). |
| `grid` | **Exactly 8 rows of exactly 8 characters**, written top to bottom so the file looks like the map. See [map letters](#map-letters). |
| `patrol` | The guard's route as `[x, y]` squares. See [patrol rules](#patrol-rules). |
| `solution.route` | One way to beat the level: the moves (`up`, `down`, `left`, `right`) and actions (`take`, `drop`, `use`, `wait`) from `S` to the package, `take`, then on to `E` and `drop`. The test plays it; players never see it. |
| `solution.peakSuspicion` | The suspicion that route ends with. The test checks this, so a change to the map or guard that makes the level harder gets noticed. |

JSON can't contain comments. If you want notes about a level, add a `"notes"` field: the game ignores fields it doesn't use.

### 2. Run `npm test`

For every level file, the tests:

1. **Check the file** against the [level rules](#level-rules), with an error that names the file and the problem.
2. **Play its solution** through the real game rules, using the fake clock. The solution must deliver the package within 8 rounds and end with exactly `peakSuspicion`. If you don't know the suspicion value, put `0`, run the test, and copy the "actual" value from the failure.

The server runs the same check when it starts. **A bad level stops the server** instead of crashing a game halfway through:

```
Error: levels/04-night-train.json: "patrol" square 2 must be next to square 1
```

Because GitHub runs the tests before deploying, a broken level can't reach the live site.

Then play it through once in two tabs (`npm start`). The checks prove the level *can* be finished, not that it's fun.

### Level rules

These are all checked automatically:

- `name`, `briefing`, `package`, `destination`, `decoy`, `risk` and `dropLabel` are present and not empty.
- `package`, `destination` and `decoy` are radio words.
- The grid is 8×8 and only uses known [map letters](#map-letters).
- The grid has exactly one each of `S`, `D`, `X` and `E`.
- The patrol has at least 2 squares. Each one is on the map, not a wall, and next to the one before it.
- Wren can walk from `S` to `D` and from `S` to `E`.
- (In the tests) The solution finishes the level with the stated peak suspicion.

### Map letters

| Letter | Meaning | How many |
|---|---|---|
| `.` | Street | Any |
| `#` | Wall | Any |
| `S` | Wren's start | **Exactly one** |
| `D` | Package (labelled CAFÉ) | **Exactly one** |
| `X` | Decoy (also labelled CAFÉ) | **Exactly one** |
| `E` | Drop point (labelled with `dropLabel`) | **Exactly one** |
| `P`, `T` | Park / station landmark. Wren can walk on them; they're labels to talk about. | Optional |

Positions are `[x, y]`, with `[0, 0]` the top-left square (A1), `x` going right and `y` going down. So the tile at `[x, y]` is in row `y`, at character `x`. To add a new letter, see [Add a new map tile](#add-a-new-map-tile).

The decoy and package both show **CAFÉ** on every map, so players can't tell them apart from the label. That's deliberate.

### Patrol rules

- The guard walks the list forward then back (A→B→C→B→A…), one square each time Wren spends a point. A route of *n* squares repeats every `2(n − 1)` points.
- Wren is spotted when the guard is on or next to their square. So a route along a corridor Wren must pass through makes the level harder.

### ECHO gets stronger every level

ECHO jams up to *(level number)* learned words per message, set by `missionIndex + 1` in `Room.transmit`. A 4th level jams up to 4, a 5th up to 5. With messages of at most 6 tiles, levels past 3 get very hard quickly. To cap it, change that line in `transmit`:

```js
const blocked = new Set(learned.slice(0, Math.min(3, this.missionIndex + 1)));
```

### Reorder or remove levels

Rename the files to change the order, or delete a file to remove the level. Nothing else refers to levels by number. (Rooms in progress are lost on the restart anyway.)

## Edit an existing map

Edit `grid` or `patrol` in that level's file. If the change breaks the saved solution (a wall on the path, or the guard now spotting Wren more or less often), `npm test` fails for that level. Update `solution.route` or `solution.peakSuspicion` to match.

## Add or change radio words

Edit `WORD_GROUPS` in `web/radio.js`.

- **Adding a word** to an existing group makes it sendable straight away. The server builds its allowed-word list from these groups, and the browser shows them as buttons.
- **Groups** are the tabs in the message composer. Six words per group fills the 3-column grid neatly. A new group appears as a new tab automatically.
- **Removing or renaming a word** also removes it from what the server accepts. Check that the tests don't send it (they use `GO`, `YES`, `NORTH` and similar).
- Words are shown exactly as written, in upper case. Keep them short, since tiles are small on phones.

## Tune difficulty

All of these are in `operation.js`:

| To change | Where |
|---|---|
| Time limit | `MISSION_MS` (milliseconds) |
| Rounds per level | `ROUND_LIMIT` |
| Wren's points per round | `ACTION_POINTS` |
| Suspicion when spotted | `this.raiseSuspicion(25)` in `spendPoint` |
| Suspicion for taking the decoy | `this.raiseSuspicion(15)` in `act` |
| Suspicion removed by using the decoy | `this.suspicion - 15` in `act` |
| When ECHO learns a word | `this.words.get(term) >= 2` in `transmit` (the number of earlier messages before a word can be jammed) |
| How many words ECHO jams | `this.missionIndex + 1` in `transmit` |
| Decrypt keys per level | One per player: `this.keys = new Set(ROLES)` in `prepareCase`, used up in `decrypt` |
| Message length | `MESSAGE_LIMIT` in `web/radio.js` (the composer always shows that many slots) |

Several tests check exact numbers (for example peak suspicion, or which word gets jammed), so expect to update them along with these values.

## Add a new map tile

For example, a `B` for "bank" landmark:

1. **`operation.js`:** add the letter to `TILES`, or the level check rejects any level that uses it.
2. **`web/screens.js`:** add it to `MAP_TILES` as `"B": ["bank", "BANK"]`: the CSS class, then the label drawn on the square. The two lists must match, because the browser can't draw a letter that's missing here.
3. **`web/style.css`:** give it a colour next to the other tiles: `.tile.bank { background: #6a5a8c; }`
4. **Optional:** add it to the legend in `mapLegend`.
5. **Wall or not?** Wren's movement in `Room.move` only blocks `#`, so any new letter can be walked on. For a new kind of obstacle, change that check.

## Add a new action for Wren

For example, a `hide` action that lowers suspicion but ends Wren's turn:

1. **Rules (`operation.js`):**
   - Add `"hide"` to the list `["take", "drop", "use", "wait"]` in `Room.command`, so it reaches `act`.
   - Add a branch in `act` that does the work.
   - Either let it fall through to `this.spendPoint()` at the end, or `return [true, ""]` early if it shouldn't cost a point.
   - Return `[false, "message"]` to refuse with a notice.
2. **Button (`web/screens.js`):** add `"hide"` to the `actions` list in `agentControls`. The button's action name *is* the message type: clicking it sends `{ "type": "hide" }`, with no change needed in `game.js`.
3. **Keyboard (optional):** add a key in `Game.onKey` in `web/game.js`, next to the `e` → `interact` mapping.
4. **Log:** call `this.record("…")` in your branch, so it shows in the debrief's transmission log.
5. **Test:** add a case in `test/operation.test.js` using the `command(room, "agent", "hide")` helper.

The actions grid is 2 columns wide, so an odd number of actions leaves a gap. Adjust `.actions` in `style.css` if needed.

## Add a new message type

Anything that isn't a Wren action, such as a "ping" both players can send:

1. **Server:** player messages in a room go through `Room.command` in `operation.js`. Add a check near the top, before the "Wren only" section, with your own role and phase checks. Return `[true, ""]` if the state changed, so both players get a fresh snapshot.
2. **New state the browser needs to see** goes into `Room.snapshot`. Keep the `snake_case` naming style, and put role-only data in the `handler`/`agent` branches.
3. **Reset it per level** in `prepareCase`, or leave it out of there if it should carry over between levels (as ECHO's `words` does).
4. **Browser:** a `button(text, "ping")` in `screens.js` will just work. `Game.command` sends unknown actions straight to the server as `{ type }`. Only add a case in `command` if it needs extra fields or browser-only handling.
5. Add the message to the protocol table in [How it works](HOW-IT-WORKS.md#messages-between-browser-and-server).

Messages sent when a player is *not* in a room (`create`, `join`, `resume`) are handled in `Multiplayer.receive` in `server.js` instead.

## Add a file the browser loads

The server only serves files listed in `ASSETS` in `server.js` (a safety measure). For any new script, stylesheet, image, font or sound:

1. Put it in `web/` (art in `web/assets/art/`, sound in `web/assets/audio/`, and so on).
2. Add its path and content type to `ASSETS`, for example `["/assets/art/guard.png", "image/png"]`. Images and fonts are cached for a day, everything else is re-checked on each visit.
3. Reference it with the same path in `index.html`, `style.css` or a script.
4. Optionally add it to the asset list in `test/server.test.js`, so a typo in the path fails the tests.

Changes to `index.html` need a server restart, because it's read once at startup. Other files are read fresh on every request.

## Change the tutorial

The tutorial is the `#tutorial` dialog in `web/index.html`. Each step is a `<section>`, and only the first one is shown without `hidden`.

- **Edit a step:** change the text in its `<section>`.
- **Add or remove a step:** add or remove a `<section hidden>`, **and update the step count**, which is written by hand in the dialog's caption: `<span id="tutorial-step">1</span> / 5`. Back, Next and Play follow the number of sections automatically.
- **Mini maps:** `<div class="tut-map" data-map="..#.E .#D.. ...#. #.... .W.#.">` draws a 5×5 map. Rows are separated by spaces, and the letters are the same as the game's. Add `data-fog="x,y"` to show only the 3×3 around that square.
- **Animations** are the `.tut-*` rules and `@keyframes tut-*` at the end of `style.css`. Each loops over 4 s. Write the element's normal style as the *finished* picture, because that's what players see when their device asks for reduced motion.
- **To show the tutorial again to everyone** (say, after a big rules change), change `TUTORIAL_KEY` in `web/game.js`, for example to `"lost-in-transmission-tutorial-2"`. Every player's "seen" mark then no longer matches, so it opens again on their next visit.
