from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from server import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "scores.db")) as client:
        yield client


def entry(score=100, name="Player", game_id=None):
    return {"game_id": game_id or str(uuid4()), "name": name, "score": score}


def test_frontend(client):
    assert client.get("/").status_code == 200
    assert "Top 10" in client.get("/").text
    assert client.get("/app.mjs").status_code == 200
    assert client.get("/core/game.mjs").status_code == 200
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/server.py").status_code == 404


def test_save_and_persist(tmp_path):
    path = tmp_path / "scores.db"
    with TestClient(create_app(path)) as client:
        assert client.post("/api/leaderboard", json=entry(name="  Ali  ")).status_code == 201
    with TestClient(create_app(path)) as client:
        assert client.get("/api/leaderboard").json() == [{"rank": 1, "name": "Ali", "score": 100}]


def test_top_ten_and_ties(client):
    for score in range(100, 1100, 100):
        assert client.post("/api/leaderboard", json=entry(score)).status_code == 201
    assert client.post("/api/leaderboard", json=entry(100)).status_code == 409
    assert client.post("/api/leaderboard", json=entry(50)).status_code == 409
    assert client.post("/api/leaderboard", json=entry(2000)).status_code == 201
    rows = client.get("/api/leaderboard").json()
    assert len(rows) == 10
    assert rows[0]["score"] == 2000
    assert rows[-1]["score"] == 200


def test_duplicate_and_update(client):
    item = entry()
    assert client.post("/api/leaderboard", json=item).status_code == 201
    assert client.post("/api/leaderboard", json=item).status_code == 409
    assert not client.get("/api/leaderboard/qualify", params={"score": 100, "game_id": item["game_id"]}).json()["qualifies"]
    item["score"] = 200
    assert client.post("/api/leaderboard", json=item).status_code == 201
    assert len(client.get("/api/leaderboard").json()) == 1


@pytest.mark.parametrize("changes", [{"name": " "}, {"name": "x" * 25}, {"name": "a\nb"},
    {"score": -1}, {"score": 0}, {"score": True}, {"score": 1.5}, {"score": "100"}, {"game_id": "invalid"}])
def test_validation(client, changes):
    assert client.post("/api/leaderboard", json=entry() | changes).status_code == 422


def test_qualification_rechecked(client):
    candidate = entry(100)
    assert client.get("/api/leaderboard/qualify", params={"score": 100, "game_id": candidate["game_id"]}).json()["qualifies"]
    for _ in range(10):
        client.post("/api/leaderboard", json=entry(200))
    assert client.post("/api/leaderboard", json=candidate).status_code == 409
