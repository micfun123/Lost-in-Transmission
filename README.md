# Lost in Transmission

A pygame game that runs on desktop and in the browser via [pygbag](https://github.com/pygame-web/pygbag).

## Layout

```
main.py           # entry point (pygbag requires this name)
assets/
  images/
  sounds/         # use .ogg for web compatibility
  fonts/
requirements.txt
```

## Setup

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run on desktop

```sh
python main.py
```

## Run in the browser

```sh
pygbag .
```

Then open http://localhost:8000.

## Build for web

```sh
pygbag --build .
```

Output goes to `build/web/` (ready for itch.io or GitHub Pages).

## Notes for pygbag

- Keep the main loop `async` and call `await asyncio.sleep(0)` once per frame.
- Load assets with relative paths (e.g. `assets/images/player.png`).
- Use `.ogg` for audio.
