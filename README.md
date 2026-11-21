# Lost in Transmission

Two-player co-op spy game set in Kessel, 1974. Magpie guides Wren through three cases over a word-tile radio. ECHO learns recurring words and interferes with later transmissions.

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

- Both players ready up on the briefing. Each round starts with **Magpie** transmitting an order of up to six word tiles.
- **Magpie** sees the complete map, the patrol route, and Wren's last camera sighting. **Wren** sees only the nine tiles around their current position.
- **Wren** has four action points per round. Move with **WASD**, the **arrow keys**, or the on-screen arrows. Use **Take** and **Drop** at the pickup and delivery points. A decoy adds suspicion when taken and can be used to blend in. The guard advances with each spent point.
- Close the move phase and send a word-tile field report to advance the round. ECHO learns recurring words from both players and remembers them across cases. Each player has one key per case to reveal a redacted tile in their latest incoming message.
- Deliver the package within eight rounds and ten minutes. The debrief shows the signal score, the worst intercept, and a transmission log. Both players confirm advances, retries, and campaign replay.
- The clock pauses if either player disconnects. Reopen the connection in the same browser tab to resume the room. Either player can close the room from the game.

## Play from separate devices

Run the server with `python server.py --host 0.0.0.0` and open `http://SERVER_IP:8000` on each device on the same network. For internet play, put the Python server behind an HTTPS reverse proxy that forwards both the game page and the WebSocket upgrade at `/ws` on the same hostname. Rooms and ECHO's memory live in server memory for the session.

## Project layout

- `game/main.py` runs the Pygame client on desktop and in the browser.
- `game/screens.py` renders the portrait lobby, briefing, role screens, and debrief.
- `game/radio.py` defines the shared word-tile vocabulary.
- `game/transport.py` connects to the multiplayer WebSocket using the browser or desktop networking APIs.
- `operation.py` defines the mission maps, role visibility, objectives, and ECHO's radio rules.
- `server.py` hosts the client and keeps multiplayer rooms in sync.
