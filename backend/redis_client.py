"""Redis helpers for persisting game state."""
from __future__ import annotations

import os
from typing import Optional

import redis

from models import GameState, LobbyState

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
GAME_TTL_SECONDS = 60 * 60 * 24  # 24 hours

_client: Optional[redis.Redis] = None


class RedisUnavailableError(RuntimeError):
    """Raised when Redis cannot be reached."""


def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _client


def _exec(fn):
    """Run a Redis call and convert connection errors into RedisUnavailableError."""
    try:
        return fn()
    except redis.RedisError as exc:
        raise RedisUnavailableError(
            f"Cannot connect to Redis at {REDIS_URL}. "
            "Make sure Redis is running."
        ) from exc


def save_game(state: GameState) -> None:
    _exec(lambda: get_client().setex(
        f"game:{state.game_id}:cells",
        GAME_TTL_SECONDS,
        state.model_dump_json(),
    ))


def load_game(game_id: str) -> Optional[GameState]:
    data = _exec(lambda: get_client().get(f"game:{game_id}:cells"))
    if data is None:
        return None
    return GameState.model_validate_json(data)


# ── Lobby (multiplayer) ────────────────────────────────────────────────────────

LOBBY_TTL_SECONDS = 60 * 60 * 2  # 2 hours


def save_lobby(state: LobbyState) -> None:
    _exec(lambda: get_client().setex(
        f"lobby:{state.lobby_id}",
        LOBBY_TTL_SECONDS,
        state.model_dump_json(),
    ))


def load_lobby(lobby_id: str) -> Optional[LobbyState]:
    data = _exec(lambda: get_client().get(f"lobby:{lobby_id}"))
    if data is None:
        return None
    return LobbyState.model_validate_json(data)
