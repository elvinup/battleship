"""FastAPI application — Battleship backend."""
from __future__ import annotations

import os
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ai import ai_take_turn
from game_logic import all_ships_sunk, build_ship_grid, random_placement
from models import (
    CreateLobbyRequest, FireRequest, GamePhase, GameState,
    LobbyFireRequest, LobbyPlaceRequest, LobbyState, LobbyStatus,
    NewGameRequest, PlacedShip,
)
from redis_client import (
    GAME_TTL_SECONDS, LOBBY_TTL_SECONDS,
    append_move, clear_moves, load_game, load_lobby, read_moves,
    save_game, save_lobby, RedisUnavailableError,
)


def _is_hit(cell: list[int], ships: list[PlacedShip]) -> bool:
    return (cell[0], cell[1]) in build_ship_grid(ships)

app = FastAPI(title="Battleship API")


@app.exception_handler(RedisUnavailableError)
async def redis_unavailable_handler(request: Request, exc: RedisUnavailableError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/game", response_model=GameState)
def new_game(req: NewGameRequest) -> GameState:
    """Create a new game. The server places enemy ships randomly."""
    state = GameState(
        game_id=str(uuid.uuid4()),
        mode=req.mode,
        phase=GamePhase.playing,
        player_ships=req.player_ships,
        enemy_ships=random_placement(),
        player_hits=[],
        enemy_hits=[],
        current_turn="player",
    )
    save_game(state)
    return state


@app.get("/api/game/{game_id}", response_model=GameState)
def get_game(game_id: str) -> GameState:
    """Fetch current game state (survives page refresh via Redis)."""
    state = load_game(game_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return state


@app.post("/api/game/{game_id}/fire", response_model=GameState)
def fire(game_id: str, req: FireRequest) -> GameState:
    """
    Player fires at (row, col) on the enemy board.
    After a valid shot the AI immediately takes its turn.
    Returns the updated game state.
    """
    state = load_game(game_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Game not found")
    if state.phase == GamePhase.finished:
        raise HTTPException(status_code=400, detail="Game already finished")
    if state.current_turn != "player":
        raise HTTPException(status_code=400, detail="Not the player's turn")

    target = [req.row, req.col]
    if target in state.enemy_hits:
        raise HTTPException(status_code=400, detail="Cell already targeted")

    moves_key = f"game:{game_id}:moves"

    # ── Player's shot ──────────────────────────────────────────────────────────
    state.enemy_hits.append(target)
    player_hit = _is_hit(target, state.enemy_ships)

    if all_ships_sunk(state.enemy_ships, state.enemy_hits):
        state.phase = GamePhase.finished
        state.winner = "player"
        append_move(moves_key, GAME_TTL_SECONDS,
                    actor="player", row=target[0], col=target[1],
                    hit=int(player_hit), result="win")
        save_game(state)
        return state

    append_move(moves_key, GAME_TTL_SECONDS,
                actor="player", row=target[0], col=target[1],
                hit=int(player_hit), result="hit" if player_hit else "miss")

    # ── AI's turn ──────────────────────────────────────────────────────────────
    state.current_turn = "ai"
    new_hits = ai_take_turn(state.player_ships, state.player_hits)
    state.player_hits.extend(new_hits)

    ai_won = all_ships_sunk(state.player_ships, state.player_hits)
    for cell in new_hits:
        cell_hit = _is_hit(cell, state.player_ships)
        result = "win" if ai_won else ("hit" if cell_hit else "miss")
        append_move(moves_key, GAME_TTL_SECONDS,
                    actor="ai", row=cell[0], col=cell[1],
                    hit=int(cell_hit), result=result)

    if ai_won:
        state.phase = GamePhase.finished
        state.winner = "ai"
    else:
        state.current_turn = "player"

    save_game(state)
    return state


# ── Multiplayer lobby routes ───────────────────────────────────────────────────

@app.post("/api/lobby", response_model=LobbyState)
def create_lobby(req: CreateLobbyRequest) -> LobbyState:
    """Player 1 creates a lobby and submits their ships. Returns a short lobby ID."""
    lobby_id = uuid.uuid4().hex[:6].upper()
    state = LobbyState(
        lobby_id=lobby_id,
        status=LobbyStatus.waiting,
        player1_ships=req.ships,
    )
    save_lobby(state)
    return state


@app.get("/api/lobby/{lobby_id}", response_model=LobbyState)
def get_lobby(lobby_id: str) -> LobbyState:
    """Fetch current lobby state (used for polling and page-refresh restore)."""
    state = load_lobby(lobby_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    return state


@app.post("/api/lobby/{lobby_id}/place", response_model=LobbyState)
def lobby_place(lobby_id: str, req: LobbyPlaceRequest) -> LobbyState:
    """
    Player 2 submits their ships to join the lobby.
    Once both players have ships placed the status transitions to 'playing'.
    """
    state = load_lobby(lobby_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    if state.status == LobbyStatus.playing:
        raise HTTPException(status_code=400, detail="Game already started")
    allowed = (LobbyStatus.waiting, LobbyStatus.rematching)
    if req.player == 2 and state.status not in allowed:
        raise HTTPException(status_code=400, detail="Lobby not accepting players")

    if req.player == 1:
        state.player1_ships = req.ships
    else:
        state.player2_ships = req.ships

    if state.player1_ships and state.player2_ships:
        state.status = LobbyStatus.playing

    save_lobby(state)
    return state


@app.post("/api/lobby/{lobby_id}/fire", response_model=LobbyState)
def lobby_fire(lobby_id: str, req: LobbyFireRequest) -> LobbyState:
    """A player fires at the opponent's board."""
    state = load_lobby(lobby_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    if state.status != LobbyStatus.playing:
        raise HTTPException(status_code=400, detail="Game not in progress")

    expected_turn = f"player{req.player}"
    if state.current_turn != expected_turn:
        raise HTTPException(status_code=400, detail="Not your turn")

    target = [req.row, req.col]
    moves_key = f"lobby:{lobby_id}:moves"

    if req.player == 1:
        if target in state.player1_hits:
            raise HTTPException(status_code=400, detail="Cell already targeted")
        state.player1_hits.append(target)
        cell_hit = _is_hit(target, state.player2_ships)
        if all_ships_sunk(state.player2_ships, state.player1_hits):
            state.status = LobbyStatus.finished
            state.winner = "player1"
            result = "win"
        else:
            state.current_turn = "player2"
            result = "hit" if cell_hit else "miss"
        append_move(moves_key, LOBBY_TTL_SECONDS,
                    actor="player1", row=target[0], col=target[1],
                    hit=int(cell_hit), result=result)
    else:
        if target in state.player2_hits:
            raise HTTPException(status_code=400, detail="Cell already targeted")
        state.player2_hits.append(target)
        cell_hit = _is_hit(target, state.player1_ships)
        if all_ships_sunk(state.player1_ships, state.player2_hits):
            state.status = LobbyStatus.finished
            state.winner = "player2"
            result = "win"
        else:
            state.current_turn = "player1"
            result = "hit" if cell_hit else "miss"
        append_move(moves_key, LOBBY_TTL_SECONDS,
                    actor="player2", row=target[0], col=target[1],
                    hit=int(cell_hit), result=result)

    save_lobby(state)
    return state


@app.post("/api/lobby/{lobby_id}/rematch", response_model=LobbyState)
def lobby_rematch(lobby_id: str) -> LobbyState:
    """Reset hits and winner so both players can play again with the same ships."""
    state = load_lobby(lobby_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    if state.status == LobbyStatus.rematching:
        return state
    if state.status != LobbyStatus.finished:
        raise HTTPException(status_code=400, detail="Game is not finished yet")

    state.player1_ships = None
    state.player2_ships = None
    state.player1_hits = []
    state.player2_hits = []
    state.winner = None
    state.current_turn = "player1"
    state.status = LobbyStatus.rematching

    clear_moves(f"lobby:{lobby_id}:moves")
    save_lobby(state)
    return state


# ── Move history ───────────────────────────────────────────────────────────────

@app.get("/api/game/{game_id}/moves")
def get_game_moves(game_id: str) -> dict:
    """Chronological move log for a single-player game (Redis Stream)."""
    if load_game(game_id) is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return {"game_id": game_id, "moves": read_moves(f"game:{game_id}:moves")}


@app.get("/api/lobby/{lobby_id}/moves")
def get_lobby_moves(lobby_id: str) -> dict:
    """Chronological move log for the current multiplayer round."""
    if load_lobby(lobby_id) is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    return {"lobby_id": lobby_id, "moves": read_moves(f"lobby:{lobby_id}:moves")}
