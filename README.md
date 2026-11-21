# Lost in Transmission

Hackathon game made with **Godot 4.7** using **GDScript**.

## Getting started

1. Install Godot 4.7.x (the standard build is fine; the .NET/Mono build also works).
2. Clone this repo, open Godot, click **Import**, and pick `project.godot`.
3. Press **F5** to run. You should be able to move the Godot icon around with WASD/arrows and bump into a grey box.

## Controls (Input Map)

Defined in *Project > Project Settings > Input Map*. Use these action names in code rather than checking keys directly.

| Action | Keys | Gamepad |
| --- | --- | --- |
| `move_left/right/up/down` | WASD, arrows | Left stick |
| `interact` | E, Space | A |
| `restart` | R | — |

## Project layout

```
assets/        art, audio (music/sfx), fonts. Drop files here, Godot imports them.
scenes/        one folder per "thing"; keep its .tscn and .gd side by side
  main.tscn    the scene that runs on F5 (set in Project Settings > Application > Run)
  player/      player.tscn + player.gd
  levels/      level scenes
  ui/          menus, HUD
scripts/
  autoload/game.gd   global state, reachable from anywhere as `Game` (score, scene changes)
```

## Working together without merge pain

Godot scene files (`.tscn`) are text, but merging two people's edits to the **same scene** usually goes badly.

- **Split work by scene.** If one person builds the player and the other builds a level, you'll almost never conflict. Make small things their own scenes (enemy, pickup, door) and *instance* them into levels.
- **Say it out loud** before editing a shared scene like `main.tscn` or `project.godot`.
- **Pull before you start, commit and push often** (several times a day). Small commits = small conflicts.
- Use a branch per feature (`git switch -c player-dash`), merge into `main` when it works.
- Commit the `.uid` and `.import` files Godot creates — they belong in git. Never commit `.godot/`.
- If a scene conflict happens: keep one person's version (`git checkout --theirs path/to/scene.tscn`) and redo the smaller change in the editor.

## Hackathon week plan (suggested)

| Day | Goal |
| --- | --- |
| 1 | Pick the idea. Do a Godot tutorial together (see below). Get the core action working with placeholder boxes. |
| 2–3 | Core loop playable start to finish, even if ugly: start → play → win/lose → restart. |
| 4–5 | Content: levels, enemies/puzzles, sounds. Real art replaces boxes. |
| 6 | **Feature freeze.** Polish, title screen, bug fixing, playtest with someone else. |
| 7 | Export builds, upload, write description. Submit early! |

Scope tip: pick an idea you think takes 3 days. It will take 7.

## Learning resources

- Official "Your first 2D game" tutorial — do this first (~2 hrs): https://docs.godotengine.org/en/stable/getting_started/first_2d_game/index.html
- GDScript basics: https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html
- Free assets: https://kenney.nl/assets, https://opengameart.org, sounds via https://sfxr.me
- Pixel art? Set *Project Settings > Rendering > Textures > Default Texture Filter* to **Nearest** so it isn't blurry.

## Exporting

*Project > Export* → add a preset (Windows / Linux / Web) → the editor will offer to download export templates the first time. Export to `build/` (ignored by git).
