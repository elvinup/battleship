export type Orientation = 'horizontal' | 'vertical';

export interface ShipType {
  id: string;
  name: string;
  length: number;
}

export const SHIP_TYPES: ShipType[] = [
  { id: 'carrier',    name: 'Carrier',    length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser',    name: 'Cruiser',    length: 3 },
  { id: 'submarine',  name: 'Submarine',  length: 3 },
  { id: 'destroyer',  name: 'Destroyer',  length: 2 },
];

export interface PlacedShip {
  shipType: ShipType;
  row: number;
  col: number;
  orientation: Orientation;
}

/** Returns all cells occupied by a placed ship */
export function getShipCells(ship: PlacedShip): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < ship.shipType.length; i++) {
    const r = ship.orientation === 'vertical' ? ship.row + i : ship.row;
    const c = ship.orientation === 'horizontal' ? ship.col + i : ship.col;
    cells.push([r, c]);
  }
  return cells;
}

/** Randomly place all ships on a fresh board */
export function randomPlacement(): PlacedShip[] {
  const placed: PlacedShip[] = [];
  for (const shipType of SHIP_TYPES) {
    let success = false;
    while (!success) {
      const orientation: Orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const maxRow = orientation === 'vertical' ? 10 - shipType.length : 9;
      const maxCol = orientation === 'horizontal' ? 10 - shipType.length : 9;
      const row = Math.floor(Math.random() * (maxRow + 1));
      const col = Math.floor(Math.random() * (maxCol + 1));
      const candidate: PlacedShip = { shipType, row, col, orientation };
      if (isValidPlacement(candidate, placed)) {
        placed.push(candidate);
        success = true;
      }
    }
  }
  return placed;
}

/** Check if a placement fits on the board and doesn't overlap existing ships */
export function isValidPlacement(
  ship: Omit<PlacedShip, 'shipType'> & { shipType: ShipType },
  placedShips: PlacedShip[],
): boolean {
  const cells = getShipCells(ship);
  for (const [r, c] of cells) {
    if (r < 0 || r >= 10 || c < 0 || c >= 10) return false;
  }
  const occupiedSet = new Set(
    placedShips.flatMap(s => getShipCells(s).map(([r, c]) => `${r},${c}`)),
  );
  return cells.every(([r, c]) => !occupiedSet.has(`${r},${c}`));
}
