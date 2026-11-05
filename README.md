# 2048

Merge tiles to 2048 with undo and win-then-continue.

- **Kind:** game MVP
- **Genre / purpose:** Puzzle / sliding tiles
- **Architecture:** Pure reducer + DOM grid view
- **Runtime:** Python 3.12+ and `uv` for FastAPI; Node.js 22+ only for game tests.
- **Port:** 4408

## Run
```bash
./run.sh
```

Then open <http://127.0.0.1:4408>. FastAPI serves both the frontend and leaderboard API.
`GET /health` reports service health.

For remote access, run `./run.sh --host 0.0.0.0` (exposes the game on all interfaces).
Use `--port 4409` to change ports. Stop any old Node server using port 4408 first.
Optional settings can be copied from `.env.example` to `.env`; `run.sh` loads `.env`.

## Leaderboard
The shared top 10 is stored in `data/leaderboard.sqlite3`; back up that file to retain scores.
Change `LEADERBOARD_DB` to use another SQLite path. Equal scores keep earlier entries first.
At game over, reaching 2048, or before restarting, qualifying scores prompt for a name.
You can also use **Submit current score** while playing. Continuing a game updates its
existing entry when a higher score is submitted rather than creating duplicates.

Names are limited to 24 printable characters. The server rechecks qualification on submission.
Scores are client-reported: this is a casual leaderboard, not a cheat-proof competition.

## Test
```bash
npm test
uv run pytest
```

Python dependencies are installed automatically by `uv` on first launch.
The browser and JavaScript game tests need no npm dependencies.

## Layout
```
games/2048/
  server.py         FastAPI server and SQLite leaderboard
  run.sh            server launcher (uv)
  pyproject.toml    Python dependencies
  package.json      game tests and FastAPI start shortcut
  src/              logic; core/ is pure and DOM-free
  public/           browser entry point (web projects)
  tests/            node --test suites
```

## Notes

Pure reducer + DOM grid view. See `../../README.md` for the conventions shared by all 40 projects in
this corpus.
