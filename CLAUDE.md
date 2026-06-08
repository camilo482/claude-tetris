# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step. Open directly or serve statically:

```powershell
# Windows
start index.html

# Local server (recommended)
python3 -m http.server 8000
# then open http://localhost:8000
```

## Architecture

Three files, no dependencies, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px), sidebar panel (score/lines/level/next-piece preview), and overlay div for pause/game-over states.
- **`style.css`** — Dark/retro aesthetic. Uses CSS variables, flexbox, `backdrop-filter`.
- **`game.js`** — All game logic (~300 lines). Key functions:
  - `init()` → creates board matrix, spawns first piece, starts `requestAnimationFrame` loop
  - `loop(timestamp)` → accumulates `dt`, drops piece when `dt ≥ dropInterval`, calls `draw()`
  - `collide()` → bounds + overlap check used by movement, rotation, and lock
  - `tryRotate()` → rotates via transpose+row-reverse (`rotateCW`), then wall-kicks ±1/±2 cols
  - `lockPiece()` → stamps piece into board matrix, calls `clearLines()`, spawns next piece
  - `clearLines()` → scans bottom-up, splices complete rows, unshifts empty row at top
  - `draw()` → renders grid, locked blocks, ghost piece (`globalAlpha=0.2`), current piece, next-piece canvas

**Board model**: `ROWS×COLS` matrix; `0` = empty, `1–7` = piece color index.

**Speed formula**: `dropInterval = max(100, 1000 − (level − 1) × 90)` ms. Level increments every 10 lines.

**Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × level. Hard drop +2pts/cell, soft drop +1pt/row.

## Key tunable constants in `game.js`

| Constant | Default | Note |
|----------|---------|------|
| `COLS` / `ROWS` | 10 / 20 | Also update canvas `width`/`height` in `index.html` (`COLS×BLOCK` / `ROWS×BLOCK`) |
| `BLOCK` | 30 | Pixels per cell |
| `COLORS` | 7 colors | Index matches piece type |
| `LINE_SCORES` | `[0,100,300,500,800]` | Points for 1–4 line clears |
