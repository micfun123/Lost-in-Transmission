# Lost in Transmission

Hackathon game made with **Python** and **Pygame Community Edition**, with browser builds packaged by **Pygbag**.

## Getting started

Install Python 3.10 or newer. From the repository root, create a virtual environment and install the dependencies.

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

In Windows PowerShell, activate the environment with `.\.venv\Scripts\Activate.ps1`.

## Playing locally

Run the desktop version with `python game/main.py`.

For the browser version, run `python -m pygbag --title "Lost in Transmission" game`, then open [localhost:8000](http://localhost:8000) and click the launch prompt. The first run needs an internet connection to fetch Pygbag's WebAssembly runtime.

Move with **WASD**, the **arrow keys**, or the **left stick** on a connected gamepad. Press **R** to reset. The camera follows the player, and the grey box blocks movement.

## Project layout

```
game/
  main.py    desktop and browser entry point
  assets/    art, audio, and fonts bundled with the game
```

Use a branch per feature and coordinate changes to shared files. Keep new game modules and assets under `game/` so Pygbag packages them together. The game loop yields each frame with `await asyncio.sleep(0)` to let the browser process input and redraw.

## Hackathon week plan (suggested)

| Day | Goal |
| --- | --- |
| 1 | Pick the idea. Do a Pygame tutorial together. Get the core action working with placeholder boxes. |
| 2–3 | Core loop playable start to finish, even if ugly: start → play → win/lose → restart. |
| 4–5 | Content: levels, enemies/puzzles, sounds. Real art replaces boxes. |
| 6 | **Feature freeze.** Polish, title screen, bug fixing, playtest with someone else. |
| 7 | Export builds, upload, write description. Submit early! |

Scope tip: pick an idea you think takes 3 days. It will take 7.

## Learning resources

- [Pygame CE documentation](https://pyga.me/docs/)
- [Pygbag quick-start guide](https://pygame-web.github.io/wiki/pygbag/)
- Free assets from [Kenney](https://kenney.nl/assets), [OpenGameArt](https://opengameart.org), and [sfxr](https://sfxr.me).

## Exporting

```sh
python -m pygbag --build --archive --title "Lost in Transmission" game
```

Serve `game/build/web/` over HTTP for a static web deployment, or upload `game/build/web.zip` as an HTML game on itch.io.
