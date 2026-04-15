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


# ── Move history (Redis Streams) ───────────────────────────────────────────────
#
# Each game/lobby has an append-only stream of moves at:
#   game:{game_id}:moves        (single-player)
#   lobby:{lobby_id}:moves      (multiplayer)
#
# Stream entry IDs are server-assigned (`<ms>-<seq>`), so the timestamp comes
# for free and entries can be range-queried by time with XRANGE.

def append_move(stream_key: str, ttl_seconds: int, **fields) -> None:
    """Append one move to a stream and refresh its TTL."""
    payload = {k: str(v) for k, v in fields.items()}

    def op():
        client = get_client()
        client.xadd(stream_key, payload)
        client.expire(stream_key, ttl_seconds)

    _exec(op)


def read_moves(stream_key: str) -> list[dict]:
    """Return all moves in chronological order. Each entry includes its ms timestamp."""
    entries = _exec(lambda: get_client().xrange(stream_key))
    out: list[dict] = []
    for entry_id, fields in entries:
        ts_ms = int(entry_id.split("-")[0])
        out.append({"id": entry_id, "ts_ms": ts_ms, **fields})
    return out


def clear_moves(stream_key: str) -> None:
    """Drop the stream entirely (used on rematch to start a fresh history)."""
    _exec(lambda: get_client().delete(stream_key))
