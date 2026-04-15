"""AI turn logic.

Strategy (hunt / target):
- HUNT mode: pick a random unhit cell.
- TARGET mode: when a ship has been hit but not yet sunk, focus fire on it.
    1. If we have 2+ hits in a line, keep extending in that direction (or
       reverse if the end is blocked / already tried).
    2. If we only have a single isolated hit, probe an adjacent unhit cell.
- Either way, exactly ONE cell is fired per turn.
"""
from __future__ import annotations

import random
from typing import List, Optional, Set, Tuple

from models import PlacedShip
from game_logic import BOARD_SIZE, get_ship_cells


def _find_partial_hit_cells(
    player_ships: List[PlacedShip],
    hit_set: Set[Tuple[int, int]],
) -> Optional[List[Tuple[int, int]]]:
    """Return the hit cells of the first ship that is damaged but not yet sunk."""
    for ship in player_ships:
        cells = get_ship_cells(ship)
        ship_hits = [c for c in cells if c in hit_set]
        if 0 < len(ship_hits) < ship.ship_type.length:
            return ship_hits
    return None


def _target_next(
    ship_hits: List[Tuple[int, int]],
    hit_set: Set[Tuple[int, int]],
) -> Optional[Tuple[int, int]]:
    """
    Given the already-hit cells of an unsunk ship, return the best next cell.

    - 2+ hits on the same row → extend the horizontal run.
    - 2+ hits on the same col → extend the vertical run.
    - Single hit → try each neighbour in a fixed order.
    """
    rows = {r for r, _ in ship_hits}
    cols = {c for _, c in ship_hits}

    def in_bounds(r: int, c: int) -> bool:
        return 0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE

    def untried(r: int, c: int) -> bool:
        return in_bounds(r, c) and (r, c) not in hit_set

    # ── Horizontal run ────────────────────────────────────────────────────────
    if len(rows) == 1:
        row = next(iter(rows))
        sorted_cols = sorted(c for _, c in ship_hits)
        if untried(row, sorted_cols[-1] + 1):
            return (row, sorted_cols[-1] + 1)
        if untried(row, sorted_cols[0] - 1):
            return (row, sorted_cols[0] - 1)

    # ── Vertical run ──────────────────────────────────────────────────────────
    if len(cols) == 1:
        col = next(iter(cols))
        sorted_rows = sorted(r for r, _ in ship_hits)
        if untried(sorted_rows[-1] + 1, col):
            return (sorted_rows[-1] + 1, col)
        if untried(sorted_rows[0] - 1, col):
            return (sorted_rows[0] - 1, col)

    # ── Single hit (or direction fully blocked) — try any neighbour ───────────
    for r, c in ship_hits:
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            if untried(r + dr, c + dc):
                return (r + dr, c + dc)

    return None


def ai_take_turn(
    player_ships: List[PlacedShip],
    existing_hits: List[List[int]],
) -> List[List[int]]:
    """
    Fire exactly one cell and return it as a single-element list.
    """
    hit_set: Set[Tuple[int, int]] = {(h[0], h[1]) for h in existing_hits}

    # ── Target mode: finish off a damaged ship first ──────────────────────────
    partial = _find_partial_hit_cells(player_ships, hit_set)
    if partial:
        target = _target_next(partial, hit_set)
        if target:
            return [list(target)]

    # ── Hunt mode: random unhit cell ──────────────────────────────────────────
    unhit = [
        (r, c)
        for r in range(BOARD_SIZE)
        for c in range(BOARD_SIZE)
        if (r, c) not in hit_set
    ]
    if not unhit:
        return []

    return [list(random.choice(unhit))]
