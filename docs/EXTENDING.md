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

Levels ("cases") are entries in the `MISSIONS` list in `operation.js`. The game plays them in list order. Moving on to the next case, the "Next case · …" label, and the end of the campaign all follow the length of the list automatically. A new level touches **three places**: the mission data, the drop-point label, and the campaign test.

### 1. Add the mission to `MISSIONS` (`operation.js`)

Add an entry at the end of the list. This example is a working 4th case: the map is playable, and the item and place are already radio words.

```js
  {
    name: "Night Train",
    briefing: "A key was left at the red café. Get it to the bank before the night shift changes.",
    package: "key", destination: "bank", decoy: "paper", risk: "Severe",
    grid: ["S...#...", ".##.#.T.", "...X....", "#.#.###.", "..#...D.", ".##.#.#.", "......#.", ".#.#...E"],
    patrol: [[5, 2], [6, 2], [7, 2], [7, 3], [7, 4]],
  },
```

| Field | Rules |
|---|---|
| `name` | Shown on the briefing and debrief, and as "Next case · …" on the debrief before it. |
| `briefing` | Magpie's briefing text. (Wren always gets a fixed generic briefing.) |
| `package`, `destination`, `decoy` | Lower-case nouns. They appear in the objective ("Key → bank"), the bag display and the result text. **Make them words in `web/radio.js`** (here: `KEY`, `BANK`, `PAPER`), so players can say them over the radio. |
| `risk` | Free text shown as "Interference" on the briefing. It's a label only: ECHO's strength comes from the level's position in the list (see [below](#echo-gets-stronger-every-level)). |
| `grid` | **Exactly 8 strings of exactly 8 characters.** See [map rules](#map-rules). |
| `patrol` | The guard's route as `[x, y]` squares. See [patrol rules](#patrol-rules). |

### 2. Name the drop point (`web/screens.js`)

The drop point (`E`) shows a short label on Magpie's map, picked by level number from `DROP_LABELS`. Add one for the new level, at most about 4 letters, or its drop square shows no label:

```js
const DROP_LABELS = ["FTN", "STN", "PARK", "BANK"];
```

### 3. Update the campaign test (`test/operation.test.js`)

The test `plays all three cases…` walks Wren through every level and expects the **3rd** to finish the campaign. With a 4th level it fails until you:

1. Add a route for the new level to `routes`. A route is the list of moves and actions from `S` to the package, `take`, then on to `E` and `drop`. For the example above:
   ```js
   ["down", "down", "right", "right", "right", "down", "down", "right", "right", "right", "take",
     "right", "down", "down", "down", "drop"],
   ```
   The test's loop already handles ending rounds and sending radio messages between moves.
2. Change `index === 2 ? "complete"` to `index === routes.length - 1 ? "complete"`.
3. Replace `assert.equal(result.peak_suspicion, index * 25);` with an explicit list, one value per level: how much suspicion that route ends up with. With the example level it's
   ```js
   assert.equal(result.peak_suspicion, [0, 25, 50, 25][index]);
   ```
   (the example route is spotted once, by the guard near the bank). If you don't know your route's value, run the test once and read the "expected/actual" in the failure.
4. The ECHO line `[index ? REDACTED : "GO"]` only assumes `GO` is already learned from case 2 onwards, so it still holds.

These exact steps were checked: with the example level added, the campaign test passes.

### Map rules

| Letter | Meaning | How many |
|---|---|---|
| `.` | Street | Any |
| `#` | Wall | Any |
| `S` | Wren's start | **Exactly one** |
| `D` | Package (labelled CAFÉ) | **Exactly one** |
| `X` | Decoy (also labelled CAFÉ) | **Exactly one** |
| `E` | Drop point | **Exactly one** |
| `P`, `T` | Park / station landmark. Wren can walk on them; they're labels to talk about. | Optional |

Things that break the game:
- **A missing `S`, `D`, `X` or `E` crashes the room when the case starts.** The decoy is required.
- **Any other letter crashes the browser** when it draws the map. To add one, see [Add a new map tile](#add-a-new-map-tile).
- **The map must be 8×8.** The page always draws 8 columns and 8 rows, and the coordinates only run A–H and 1–8.
- **Nothing checks that the map can be finished.** Make sure Wren can walk from `S` to `D` and from `D` to `E`. The route needs to fit within 8 rounds × 4 action points = 32 points, *including* `take` and `drop`, and leave slack for wrong turns and the decoy.

Remember the grid is written row by row, top to bottom: `grid[y][x]`, with `[0, 0]` the top-left square (A1).

### Patrol rules

- **At least 2 squares.** A one-square route crashes the game on Wren's first move.
- Each square should be a street (`.`) and **next to the previous one** (up, down, left or right). The guard is placed exactly on these squares in order, so a gap makes it appear to teleport.
- The guard walks the list forward then back (A→B→C→B→A…), one square each time Wren spends a point. A route of *n* squares repeats every `2(n − 1)` points.
- Wren is spotted when the guard is on or next to their square. So a route that runs along a corridor Wren must pass through makes the level harder.

### ECHO gets stronger every level

ECHO jams up to *(level number)* learned words per message, set by `missionIndex + 1` in `Room.transmit`. A 4th level jams up to 4, a 5th up to 5. With messages of at most 6 tiles, levels past 3 get very hard quickly. To cap it, change that line in `transmit`:

```js
const blocked = new Set(learned.slice(0, Math.min(3, this.missionIndex + 1)));
```

### Other things that change with level number

- `mapLegend` in `web/screens.js` calls the package "Briefcase" on level 1 and "Package" on every other level.
- The decoy and package both show **CAFÉ** on every map (`MAP_TILES` in `web/screens.js`), so players can't tell them apart from the label. That's deliberate.

### Checklist

- [ ] Mission added to the end of `MISSIONS`, with an 8×8 grid containing one `S`, `D`, `X` and `E`
- [ ] Patrol has 2+ street squares, each next to the last
- [ ] Item and place nouns exist in `web/radio.js`
- [ ] `DROP_LABELS` has a label for the new level
- [ ] The campaign test has a route for it and uses `routes.length - 1`
- [ ] `npm test` passes, and you've played it through once in two tabs

## Edit an existing map

Change the strings in that mission's `grid` (and its `patrol` if needed), following the [map rules](#map-rules). If you move `S`, `D` or `E`, or put a wall on the existing path, **update that level's route** in the campaign test. The routes in `test/operation.test.js` follow the current maps step by step.

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

1. **`web/screens.js`:** add it to `MAP_TILES` as `"B": ["bank", "BANK"]`: the CSS class, then the label drawn on the square. Without this, the browser crashes on any map containing `B`.
2. **`web/style.css`:** give it a colour next to the other tiles: `.tile.bank { background: #6a5a8c; }`
3. **Optional:** add it to the legend in `mapLegend`.
4. **Wall or not?** Wren's movement in `Room.move` only blocks `#`, so any new letter can be walked on. For a new kind of obstacle, change that check.

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
