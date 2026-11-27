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

## Built with

The frontend is plain HTML, CSS and JavaScript, and the backend is a Node.js server with WebSockets. All the game rules run on the server, and each player is sent only what their role is allowed to see, so nobody can cheat by editing their browser. GitHub Actions runs the tests on every push and deploys automatically when a change is merged to `main`.

We started in Godot, moved to Pygame in the browser, and rewrote the whole game in JavaScript the same day when the Python runtime took about 90 seconds to load.

## Run it yourself

Use Node.js 24 or newer:

```sh
npm ci
npm start
```

Open http://localhost:8000 in two browser tabs, or on two devices with `npm start -- --host 0.0.0.0` and `http://YOUR_IP:8000`. Run `npm test` to check the game rules, the multiplayer server and every level's solution.

To run it with Docker, use `docker compose up -d --build`. It serves the game on http://127.0.0.1:8620.

For internet play, put it behind an HTTPS reverse proxy that forwards both the page and the `/ws` WebSocket upgrade. Rooms live in server memory, so a restart ends any games in progress.

## Docs

- [How it works](docs/HOW-IT-WORKS.md): rules, protocol, the build and deployment
- [Code reference](docs/CODE.md): a guide to the code, function by function
- [Extending the game](docs/EXTENDING.md): adding levels, words and features

## Team

Made by Michael Parker, Kieran Shaw and Abigail Hinchliffe.
