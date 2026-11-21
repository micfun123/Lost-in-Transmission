<p align="center"><img src="web/logo.jpg" alt="Lost in Transmission logo" width="256"></p>

# Lost in Transmission

Two-player co-op spy game set in Kessel, 1974. Magpie guides Wren through three cases over a word-tile radio. ECHO learns recurring words and interferes with later transmissions.

## Run a local session

Use Node.js 24 or newer. From the repository root:

```sh
npm ci
npm start
```

Open the local game in two browser tabs or windows. One player creates a room as Magpie and shares the displayed code. The other joins as Wren using that code. [Local game](http://localhost:8000/)

Run `npm test` to check the game rules and multiplayer connection.

## Play

- Both players ready up on the briefing. Each round starts with **Magpie** transmitting an order of up to six word tiles.
- **Magpie** sees the complete map, the patrol route, and Wren's last camera sighting. **Wren** sees only the nine tiles around their current position.
- **Wren** has four action points per round. Move with **WASD**, the **arrow keys**, or the on-screen arrows. Use **Take** and **Drop** at the pickup and delivery points. A decoy adds suspicion when taken and can be used to blend in. The guard advances with each spent point.
- Close the move phase and send a word-tile field report to advance the round. ECHO learns recurring words from both players and remembers them across cases. Each player has one key per case to reveal a redacted tile in their latest incoming message.
- Deliver the package within eight rounds and ten minutes. The debrief shows the signal score, the worst intercept, and a transmission log. Both players confirm advances, retries, and campaign replay.
- The clock pauses if either player disconnects. Reopen the connection in the same browser tab to resume the room. Either player can close the room from the game.

## Play from separate devices

Run `npm start -- --host 0.0.0.0` and open `http://SERVER_IP:8000` on each device on the same network. For internet play, put the Node server behind an HTTPS reverse proxy that forwards both the game page and the WebSocket upgrade at `/ws` on the same hostname. Rooms and ECHO's memory live in server memory for the session.

## Project layout

- `web/index.html` and `web/style.css` define the browser page and case-file design.
- `web/game.js` handles controls and connects the browser to the multiplayer WebSocket.
- `web/screens.js` renders the lobby, briefing, role screens, and debrief.
- `web/radio.js` defines the word-tile vocabulary shared by the client and server.
- `operation.js` defines the mission maps, role visibility, objectives, and ECHO's radio rules.
- `server.js` serves the game and keeps multiplayer rooms in sync.
- `web/` also holds the link-preview logo and browser icons.

## Docker

```sh
docker compose up -d --build
```

The container serves the browser game and the `/ws` WebSocket on http://127.0.0.1:8620.

## Deploying

The game is hosted at https://transmission.michaelrbparker.com on the Hetzner server:

- The repo is cloned to `/root/lost-in-transmission` and runs with Docker Compose.
- The host nginx proxies the domain and WebSocket upgrades to port 8620 (`deploy/transmission.michaelrbparker.com.conf`).
- Cloudflare handles HTTPS.

Every push to `main` builds and deploys automatically through GitHub Actions. To deploy by hand:

```sh
ssh hetzner /root/lost-in-transmission/deploy/deploy.sh
```
