# JasperDoku

A cozy logic puzzle starring Jasper the cat. No ads, unlimited hints and skips.

## Rules
Put one Jasper in every **color patch**, every **row** and every **column**.
Jaspers **never touch** each other, not even corner to corner.

- **Tap** a square once → ✕ (tap again to clear it)
- **Double-tap** → Jasper (a single tap never places Jasper, so it can never cost a treat)
- **Tap Jasper** once → takes Jasper off
- **Drag** across squares → cross out many at once (start on a ✕ to erase many)

**3 treats (lives):** placing Jasper on a wrong square flashes red, breaks a treat and crosses the square out. Out of treats → start the puzzle over (no refills). Each win pays the treats you have left (3, 2 or 1). Stars: 3 = no mistakes, 2 = one, 1 = more.

**Golden treat levels:** every 7–15 levels (the same level numbers on every phone, from a fixed seed: 9, 19, 28, 40, 49, 61…) there's an 8 × 8 golden level starring **Leo**, with only **one** treat. Leo follows exactly the same rules as Jasper. Lose the treat → start over on the same puzzle. A golden win pays **5 treats** on the very first try, **3** after a start-over.

## Play it on this PC
Double-click `start-jasperdoku.cmd`, then open http://localhost:5177
(Opening `index.html` directly also works, but the photo/offline features need the little server.)

## Put Jasper's real face in
Save a **square** photo of Jasper's face as `assets/jasper.jpg` (or `.png`).
It's picked up automatically - the cartoon placeholder is only used until then.

## Features
- First-time interactive tutorial (replay it from How to Play or Settings)
- 120+ levels growing from 5×5 to 10×10, with a "Level up!" celebration at each new board size
- Puzzles get harder as you go: each board size starts gentle and ends hard, and "Tricky" smaller boards (which need the hardest moves) are mixed in from level 13
- Look-alike colors (like pink and rose, or blue and sky) are kept from touching on every board
- Progress card on the home screen; All Levels screen with stars, best times and skipped levels
- Daily Puzzle with a month calendar, current and best streak, and catch-up for missed days
- 48 achievements in 7 sections (Levels, Skill, Speed, Daily, Golden, Rivals, Just for Fun), shown on the win screen as they unlock
- 3 treats (lives); unlimited hints that explain *why*, unlimited skips, undo, clear
- iOS-style Settings page: Auto/Light/Dark, sound on/off with Game sounds and Celebrations volume, auto-cross, timer, vibration (hidden on iPhone, which doesn't support it)
- Backup code to copy progress to a new phone, and restore from it
- Works offline and installs to the Home Screen with Jasper as the icon

## Hosting
GitHub Pages serves the `main` branch. Repo Settings → Pages → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`.

## For developers
- `js/engine.js` - generator, exact solver, logic solver and hint engine (no UI)
- `js/app.js` - screens, input, hints, saving (localStorage)
- `node tests/test-engine.js` - checks every generated puzzle has exactly one answer and is solvable by logic alone
- `node tools/serve.js` - local server on port 5177
