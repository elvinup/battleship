"""FastAPI application — Battleship backend."""
from __future__ import annotations

import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ai import ai_take_turn
from game_logic import all_ships_sunk, random_placement
from models import (
    CreateLobbyRequest, FireRequest, GamePhase, GameState,
    LobbyFireRequest, LobbyPlaceRequest, LobbyState, LobbyStatus,
    NewGameRequest,
)
from redis_client import load_game, load_lobby, save_game, save_lobby, RedisUnavailableError

app = FastAPI(title="Battleship API")


@app.exception_handler(RedisUnavailableError)
async def redis_unavailable_handler(request: Request, exc: RedisUnavailableError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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

    # ── Player's shot ──────────────────────────────────────────────────────────
    state.enemy_hits.append(target)

    if all_ships_sunk(state.enemy_ships, state.enemy_hits):
        state.phase = GamePhase.finished
        state.winner = "player"
        save_game(state)
        return state

    # ── AI's turn ──────────────────────────────────────────────────────────────
    state.current_turn = "ai"
    new_hits = ai_take_turn(state.player_ships, state.player_hits)
    state.player_hits.extend(new_hits)

    if all_ships_sunk(state.player_ships, state.player_hits):
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

    if req.player == 1:
        if target in state.player1_hits:
            raise HTTPException(status_code=400, detail="Cell already targeted")
        state.player1_hits.append(target)
        if all_ships_sunk(state.player2_ships, state.player1_hits):
            state.status = LobbyStatus.finished
            state.winner = "player1"
        else:
            state.current_turn = "player2"
    else:
        if target in state.player2_hits:
            raise HTTPException(status_code=400, detail="Cell already targeted")
        state.player2_hits.append(target)
        if all_ships_sunk(state.player1_ships, state.player2_hits):
            state.status = LobbyStatus.finished
            state.winner = "player2"
        else:
            state.current_turn = "player1"

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

    save_lobby(state)
    return state
