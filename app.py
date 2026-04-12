from __future__ import annotations

import json
import math
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, request, session


BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
DATABASE_PATH = INSTANCE_DIR / "void_runner.sqlite3"
VALID_GAME_MODES = {"classic", "checkpoint", "testing"}


app = Flask(__name__, static_folder=".", static_url_path="/static")
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "void-runner-dev-secret")
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=3650)


def get_db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    INSTANCE_DIR.mkdir(exist_ok=True)
    with get_db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_games (
                player_id TEXT PRIMARY KEY,
                game_state TEXT NOT NULL,
                mode TEXT NOT NULL,
                current_level INTEGER NOT NULL,
                score REAL NOT NULL,
                shop_active INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )


def ensure_session_identity() -> None:
    session.permanent = True
    if "player_id" not in session:
        session["player_id"] = uuid.uuid4().hex
    if "high_score" not in session:
        session["high_score"] = 0.0


def get_saved_game_row():
    ensure_session_identity()
    with get_db_connection() as connection:
        row = connection.execute(
            """
            SELECT player_id, game_state, mode, current_level, score, shop_active, updated_at
            FROM saved_games
            WHERE player_id = ?
            """,
            (session["player_id"],)
        ).fetchone()
    return row


def build_saved_game_summary(row) -> dict | None:
    if row is None:
        return None

    current_level = int(row["current_level"])
    shop_active = bool(row["shop_active"])

    return {
        "mode": row["mode"],
        "currentLevel": current_level,
        "resumeLevel": current_level + 1 if shop_active else current_level,
        "score": float(row["score"]),
        "shopActive": shop_active,
        "updatedAt": row["updated_at"]
    }


def parse_game_state() -> dict:
    payload = request.get_json(silent=True) or {}
    game_state = payload.get("gameState")
    if not isinstance(game_state, dict):
        raise ValueError("Missing gameState payload.")

    selected_mode = game_state.get("selectedGameMode")
    if selected_mode not in VALID_GAME_MODES:
        raise ValueError("Saved game mode is invalid.")

    if not game_state.get("shopActive"):
        raise ValueError("Games can only be saved during the buy phase.")

    if game_state.get("gameOver"):
        raise ValueError("Cannot save after the run has ended.")

    player_state = game_state.get("player")
    if not isinstance(player_state, dict):
        raise ValueError("Saved game is missing player data.")

    current_level = int(game_state.get("currentLevel") or 1)
    score = float(game_state.get("score") or 0)
    if not math.isfinite(score):
        raise ValueError("Saved game score is invalid.")

    game_state["currentLevel"] = max(1, current_level)
    game_state["score"] = max(0.0, score)
    return game_state


@app.before_request
def bootstrap_session() -> None:
    ensure_session_identity()


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.get("/api/bootstrap")
def bootstrap():
    row = get_saved_game_row()
    return jsonify({
        "highScore": float(session.get("high_score", 0.0)),
        "savedGameSummary": build_saved_game_summary(row)
    })


@app.post("/api/high-score")
def update_high_score():
    payload = request.get_json(silent=True) or {}
    try:
        high_score = float(payload.get("highScore") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "High score is invalid."}), 400

    if not math.isfinite(high_score):
        return jsonify({"error": "High score is invalid."}), 400

    if high_score < 0:
        high_score = 0.0

    session["high_score"] = max(float(session.get("high_score", 0.0)), high_score)
    return jsonify({"highScore": float(session["high_score"])})


@app.get("/api/saved-game")
def load_saved_game():
    row = get_saved_game_row()
    if row is None:
        return jsonify({
            "savedGameSummary": None,
            "gameState": None
        })

    return jsonify({
        "savedGameSummary": build_saved_game_summary(row),
        "gameState": json.loads(row["game_state"])
    })


@app.post("/api/saved-game")
def save_game():
    try:
        game_state = parse_game_state()
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400

    updated_at = datetime.now(timezone.utc).isoformat()
    player_id = session["player_id"]
    serialized_state = json.dumps(game_state)

    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO saved_games (
                player_id,
                game_state,
                mode,
                current_level,
                score,
                shop_active,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                player_id,
                serialized_state,
                game_state["selectedGameMode"],
                int(game_state["currentLevel"]),
                float(game_state["score"]),
                1 if game_state.get("shopActive") else 0,
                updated_at
            )
        )

    row = get_saved_game_row()
    return jsonify({
        "savedGameSummary": build_saved_game_summary(row)
    })


@app.delete("/api/saved-game")
def delete_saved_game():
    with get_db_connection() as connection:
        connection.execute(
            "DELETE FROM saved_games WHERE player_id = ?",
            (session["player_id"],)
        )

    return jsonify({"savedGameSummary": None})


init_db()


if __name__ == "__main__":
    app.run(debug=True)
