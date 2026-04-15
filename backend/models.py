from __future__ import annotations
from pydantic import BaseModel
from typing import List, Optional, Literal
from enum import Enum


class Orientation(str, Enum):
    horizontal = "horizontal"
    vertical = "vertical"


class ShipType(BaseModel):
    id: str
    name: str
    length: int


class PlacedShip(BaseModel):
    ship_type: ShipType
    row: int
    col: int
    orientation: Orientation


class GameMode(str, Enum):
    single = "single"
    multi = "multi"


class GamePhase(str, Enum):
    playing = "playing"
    finished = "finished"


class GameState(BaseModel):
    game_id: str
    mode: GameMode
    phase: GamePhase
    player_ships: List[PlacedShip]
    enemy_ships: List[PlacedShip]
    # Cells the AI has fired at on the player's board
    player_hits: List[List[int]] = []
    # Cells the player has fired at on the enemy's board
    enemy_hits: List[List[int]] = []
    winner: Optional[Literal["player", "ai"]] = None
    current_turn: Literal["player", "ai"] = "player"


# ── Request bodies (single-player) ────────────────────────────────────────────

class NewGameRequest(BaseModel):
    mode: GameMode
    player_ships: List[PlacedShip]


class FireRequest(BaseModel):
    row: int
    col: int


# ── Multiplayer lobby ──────────────────────────────────────────────────────────

class LobbyStatus(str, Enum):
    waiting   = "waiting"    # player 1 placed ships, waiting for player 2
    playing   = "playing"    # both players ready
    finished  = "finished"
    rematching = "rematching"  # rematch requested — both players re-placing ships


class LobbyState(BaseModel):
    lobby_id: str
    status: LobbyStatus
    # Ships are None until that player has submitted them
    player1_ships: Optional[List[PlacedShip]] = None
    player2_ships: Optional[List[PlacedShip]] = None
    # player1 fires at player2's board; player2 fires at player1's board
    player1_hits: List[List[int]] = []
    player2_hits: List[List[int]] = []
    current_turn: Literal["player1", "player2"] = "player1"
    winner: Optional[Literal["player1", "player2"]] = None


class CreateLobbyRequest(BaseModel):
    ships: List[PlacedShip]


class LobbyPlaceRequest(BaseModel):
    player: Literal[1, 2]
    ships: List[PlacedShip]


class LobbyFireRequest(BaseModel):
    player: Literal[1, 2]
    row: int
    col: int
