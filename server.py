"""FastAPI frontend hosting and a casual, client-reported SQLite leaderboard."""
import os
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

ROOT = Path(__file__).resolve().parent


class Submission(BaseModel):
    game_id: UUID
    name: str = Field(min_length=1, max_length=24)
    score: int = Field(strict=True, gt=0, le=2147483647)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value or any(not c.isprintable() for c in value):
            raise ValueError("Use 1–24 printable characters")
        return value


def create_app(database=None):
    db_path = Path(database or os.environ.get("LEADERBOARD_DB", ROOT / "data/leaderboard.sqlite3"))

    @contextmanager
    def connection():
        db = sqlite3.connect(db_path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @asynccontextmanager
    async def lifespan(app):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                score INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
        yield

    app = FastAPI(title="2048", lifespan=lifespan)

    def leaders(db, exclude=None):
        return db.execute(
            "SELECT id, game_id, name, score, created_at FROM scores "
            "WHERE game_id != ? ORDER BY score DESC, id ASC LIMIT 10",
            (exclude or "",),
        ).fetchall()

    def qualifies(db, score, game_id):
        existing = db.execute("SELECT score FROM scores WHERE game_id = ?", (game_id,)).fetchone()
        if existing and score <= existing["score"]:
            return False
        rows = leaders(db, game_id)
        return score > 0 and (len(rows) < 10 or score > rows[-1]["score"])

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "2048"}

    @app.get("/api/leaderboard")
    def leaderboard():
        with connection() as db:
            return [{"rank": i + 1, "name": row["name"], "score": row["score"]}
                    for i, row in enumerate(leaders(db))]

    @app.get("/api/leaderboard/qualify")
    def qualification(score: int = Query(ge=0, le=2147483647), game_id: UUID = Query()):
        with connection() as db:
            return {"qualifies": qualifies(db, score, str(game_id))}

    @app.post("/api/leaderboard", status_code=201)
    def submit(entry: Submission):
        with connection() as db:
            db.execute("BEGIN IMMEDIATE")
            game_id = str(entry.game_id)
            if not qualifies(db, entry.score, game_id):
                raise HTTPException(409, "Score no longer qualifies or was already submitted")
            db.execute(
                "INSERT INTO scores(game_id, name, score) VALUES (?, ?, ?) "
                "ON CONFLICT(game_id) DO UPDATE SET name=excluded.name, score=excluded.score",
                (game_id, entry.name, entry.score),
            )
            db.execute("DELETE FROM scores WHERE id NOT IN "
                       "(SELECT id FROM scores ORDER BY score DESC, id ASC LIMIT 10)")
        return {"saved": True}

    @app.get("/")
    def index():
        return FileResponse(ROOT / "public/index.html", headers={"Cache-Control": "no-store"})

    app.mount("/core", StaticFiles(directory=ROOT / "src/core"), name="core")
    app.mount("/", StaticFiles(directory=ROOT / "public"), name="frontend")
    return app


app = create_app()

if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Run the 2048 game and leaderboard")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "4408")))
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)
