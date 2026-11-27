<p align="center"><img src="web/logo.jpg" alt="Lost in Transmission logo" width="256"></p>

# Lost in Transmission

**A two-player co-op spy game where you can only talk over a radio that's being listened to.**

**[Play it in your browser](https://transmission.michaelrbparker.com)**: no install, works on phones and laptops.

## What is it?

Kessel, 1974. One player is **Magpie**, the handler, who sees the whole map, the guard's patrol route and the security cameras. The other is **Wren**, the agent in the field, who can only see the nine squares around them. Wren has to collect a package and deliver it before time runs out or suspicion gets too high.

You can't talk to each other. The only way to communicate is a radio of word tiles, with at most six words per message. An enemy listener called **ECHO** learns the words you keep repeating and turns them into static, and it remembers them from case to case. The more you rely on a phrase, the less of it gets through.

There are eight linked cases, and together they tell the story of a hunt for a mole inside the bureau.

## How to play

1. **Magpie** creates a room and shares the code or QR code. **Wren** joins on their own device.
2. Each round, Magpie sends an order of up to six word tiles.
3. Wren gets four action points to move (**WASD**, the **arrow keys** or the on-screen arrows), **Take** the package and **Drop** it at the delivery point. The guard moves with every point Wren spends.
4. Wren sends a field report back, and the next round starts.
5. Deliver the package within the round and time limits. A decoy can help Wren blend in, but taking it adds suspicion.
6. Each player has one key per case that reveals a redacted tile in the last message they received.

After each case, the debrief shows your signal score, the worst intercept and the full transmission log. If either player disconnects, the clock pauses, and reopening the tab puts them back in the room.

## Features

- **Each role sees something different.** Magpie sees everything and Wren sees a 3×3 patch of the map.
- **ECHO adapts to how you play.** It jams words you've used before by chance, limits how much static it adds per message, and forgets half of what it learned between cases.
- **Eight linked cases.** Maps range from 6×6 to 10×10, and the difficulty goes up and down rather than only climbing.
- **Form PO1-00.** Before reaching the lobby, players fill in a period-style entry clearance form: tune a radio dial and pick the genuine documents from the fakes.
- **Phone-first case-file design.** It has portrait screens, an animated how-to-play tutorial and QR code joining.

## Design choices

### The game

- **Word tiles instead of free chat.** Keeping messages to six tiles from a fixed vocabulary makes communication the puzzle. It also lets ECHO count exactly which words you rely on, and lets the server check every message.
- **Each player sees something different.** Magpie can see everything but can't move, and Wren can move but only sees a 3×3 patch of the map. Neither can win alone, so information has to flow both ways: orders go out, and field reports come back.
- **ECHO punishes habits, not players.** Repeating yourself is the natural thing to do over a radio, so that's what ECHO listens for. At first ECHO always jammed learned words, which locked players out of their own vocabulary. We changed it to jam by chance, and it can only turn up to half of a message into static. It also forgets half of what it learned between cases, so pressure builds without the next case being ruined before it starts.
- **One decrypt key per case.** If static hits the one word that matters, each player has one way to recover it. That makes the key a decision worth thinking about rather than an undo button.
- **Every step counts.** The guard moves with each action point Wren spends, so wasted moves are a real risk and Magpie's routes need to be efficient.
- **Difficulty goes up and down.** The eight cases change the map size (6×6 to 10×10), rounds, action points, time and ECHO strength. A hard case is followed by a breather instead of a steady climb.
- **A 1974 case-file look.** The paper-and-ink style, the redacted tiles and the Form PO1-00 entry clearance form at the door all keep players inside the setting before the game even starts.

### The tech

- **The server owns the game.** All the rules run on the Node.js server, and after every action each player is sent only what their role is allowed to see. Wren's browser never receives the full map, so editing the page can't reveal it.
- **Why Pygame and Pygbag first.** We started in Godot, but the team knew Python best, and the game had to be playable from a link with nothing to install. Pygame with [Pygbag](https://github.com/pygame-web/pygbag) gave us both: we could write the game in Python, and Pygbag packages it to run in the browser. It got us to a playable two-player prototype within the first afternoon.
- **Why we then moved to JavaScript.** Pygbag works by downloading a whole Python runtime into the browser, and players were waiting about 90 seconds on "Loading, please wait". Serving the runtime from our own server helped, but it was still too slow for a game you start by sharing a link with a friend. So we rewrote the whole game in plain JavaScript the same evening. It now opens instantly.
- **No framework and no build step.** The frontend is plain HTML, CSS and JavaScript, and the server has two dependencies (`ws` and `qrcode-generator`). That keeps the page light on phones and the code easy to follow.
- **Built for phones in the same room.** The screens are portrait, joining works by QR code so nobody types room codes, and there's an animated tutorial on first visit.
- **Dropped connections pause the game.** Phones lock and lose signal, so the clock stops when either player drops out, and reopening the tab puts them back in their role.
- **Nothing is saved to disk.** Rooms and ECHO's memory live in the server's memory. That keeps the server simple, but a restart or deploy ends any games in progress.
- **Levels are data that's checked.** Each case is a JSON file, and the server checks all of them when it starts. A broken level stops the server rather than crashing a game halfway through, and because GitHub runs the tests (including a playthrough of every level's solution) before deploying, a broken level can't reach the live site.

## Run it yourself

Use Node.js 24 or newer:

```sh
npm ci
npm start
```

Open http://localhost:8000 in two browser tabs, or on two devices with `npm start -- --host 0.0.0.0` and `http://YOUR_IP:8000`. Run `npm test` to check the game rules, the multiplayer server and every level's solution.

To run it with Docker, use `docker compose up -d --build`. It serves the game on http://127.0.0.1:8620. It also records anonymous play analytics (time per game and how far players get). See [Analytics](docs/HOW-IT-WORKS.md#analytics).

For internet play, put it behind an HTTPS reverse proxy that forwards both the page and the `/ws` WebSocket upgrade. Rooms live in server memory, so a restart ends any games in progress.

## Docs

- [How it works](docs/HOW-IT-WORKS.md): rules, protocol, the build and deployment
- [Code reference](docs/CODE.md): a guide to the code, function by function
- [Extending the game](docs/EXTENDING.md): adding levels, words and features

## Team

Made by:

- **Michael** ([@micfun123](https://github.com/micfun123))
- **Kieran** ([@JakeIV](https://github.com/JakeIV))
- **Abi** ([@AbigailHinchliffe](https://github.com/AbigailHinchliffe))
