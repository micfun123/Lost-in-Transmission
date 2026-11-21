# Lost in Transmission

Two-player co-op spy game set in Kessel, 1974. The handler guides the agent through three missions over a text radio. ECHO listens for repeated words and interferes with later transmissions.

## Run a local session

Use Python 3.10 or newer. From the repository root:

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pygbag --build --ume_block 0 --title "Lost in Transmission" game
python server.py
```

In Windows PowerShell, activate the environment with `.\.venv\Scripts\Activate.ps1`.

Open the local preview in two browser tabs or windows. The lobby opens automatically once the browser loads the Pygbag WebAssembly runtime. One player creates a room as the handler, and the other joins as the agent using the displayed room code. [Local preview](http://localhost:8000/)

To use the desktop client, keep the server running and launch each client with `python game/main.py`. Set `LIT_SERVER_URL` to a different WebSocket endpoint when connecting a desktop client to another server.

## Play

- The **handler** sees the full map, including the real drop, decoys, and extraction. The map uses column letters and row numbers.
- The **agent** sees the surrounding streets. Move with **WASD**, the **arrow keys**, or the on-screen arrows. Press **E** or **Interact** to check a drop or extract. Three different decoys blow the agent's cover.
- Both players use the radio to exchange plans. Click the field or press **Enter** to type, then press **Enter** again to send. ECHO learns recurring words from both players and remembers them across missions.
- Recover the package and reach extraction before the ten-minute clock runs out. Both players confirm mission changes, retries, and campaign replay.
- The clock pauses if either player disconnects. Reopen the connection in the same browser tab to resume the room. Either player can close the room from the game.

## Play from separate devices

Run the server with `python server.py --host 0.0.0.0` and open `http://SERVER_IP:8000` on each device on the same network. For internet play, put the Python server behind an HTTPS reverse proxy that forwards both the game page and the WebSocket upgrade at `/ws` on the same hostname. Rooms and ECHO's memory live in server memory for the session.

## Project layout

- Keep the main loop `async` and call `await asyncio.sleep(0)` once per frame.
- Load assets with relative paths (e.g. `assets/images/player.png`).
- Use `.ogg` for audio.

## Docker

```sh
docker compose up -d --build
```

This builds the web version with pygbag and serves it with nginx on http://127.0.0.1:8620.

## Deploying

The game is hosted at https://transmission.michaelrbparker.com on the Hetzner server:

- The repo is cloned to `/root/lost-in-transmission` and runs with Docker Compose.
- The host nginx proxies the domain to port 8620 (`deploy/transmission.michaelrbparker.com.conf`).
- Cloudflare handles HTTPS.

To deploy the latest `main`:

```sh
ssh hetzner /root/lost-in-transmission/deploy/deploy.sh
```
