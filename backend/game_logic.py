"""Core game logic: ship placement, validation, hit detection, win check."""
from __future__ import annotations

import random
from typing import Dict, List, Set, Tuple

from models import Orientation, PlacedShip, ShipType

BOARD_SIZE = 10

SHIP_DEFINITIONS: List[Dict] = [
    {"id": "carrier",    "name": "Carrier",    "length": 5},
    {"id": "battleship", "name": "Battleship", "length": 4},
    {"id": "cruiser",    "name": "Cruiser",    "length": 3},
    {"id": "submarine",  "name": "Submarine",  "length": 3},
    {"id": "destroyer",  "name": "Destroyer",  "length": 2},
]


def get_ship_cells(ship: PlacedShip) -> List[Tuple[int, int]]:
    cells: List[Tuple[int, int]] = []
    for i in range(ship.ship_type.length):
        r = ship.row + i if ship.orientation == Orientation.vertical else ship.row
        c = ship.col + i if ship.orientation == Orientation.horizontal else ship.col
        cells.append((r, c))
    return cells


def is_valid_placement(ship: PlacedShip, placed: List[PlacedShip]) -> bool:
    cells = get_ship_cells(ship)
    for r, c in cells:
        if not (0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE):
            return False
    occupied: Set[Tuple[int, int]] = set()
    for s in placed:
        occupied.update(get_ship_cells(s))
    return all(cell not in occupied for cell in cells)


def random_placement() -> List[PlacedShip]:
    placed: List[PlacedShip] = []
    for defn in SHIP_DEFINITIONS:
        ship_type = ShipType(**defn)
        while True:
            orientation = random.choice(list(Orientation))
            max_row = (BOARD_SIZE - ship_type.length
                       if orientation == Orientation.vertical
                       else BOARD_SIZE - 1)
            max_col = (BOARD_SIZE - ship_type.length
                       if orientation == Orientation.horizontal
                       else BOARD_SIZE - 1)
            row = random.randint(0, max_row)
            col = random.randint(0, max_col)
            candidate = PlacedShip(
                ship_type=ship_type, row=row, col=col, orientation=orientation
            )
            if is_valid_placement(candidate, placed):
                placed.append(candidate)
                break
    return placed


def build_ship_grid(ships: List[PlacedShip]) -> Dict[Tuple[int, int], str]:
    """Map of (row, col) -> ship_id for quick lookup."""
    grid: Dict[Tuple[int, int], str] = {}
    for ship in ships:
        for cell in get_ship_cells(ship):
            grid[cell] = ship.ship_type.id
    return grid


def all_ships_sunk(ships: List[PlacedShip], hits: List[List[int]]) -> bool:
    """True when every cell of every ship has been hit."""
    hit_set: Set[Tuple[int, int]] = {(h[0], h[1]) for h in hits}
    return all(cell in hit_set for ship in ships for cell in get_ship_cells(ship))
