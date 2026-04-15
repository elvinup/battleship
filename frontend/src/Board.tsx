import React from 'react';
import { PlacedShip, ShipType, Orientation, getShipCells, isValidPlacement } from './types';
import './Board.css';

export interface FiredCell {
  row: number;
  col: number;
  hit: boolean;
}

interface Props {
  placedShips: PlacedShip[];
  selectedShip: ShipType | null;
  orientation: Orientation;
  onPlace: (row: number, col: number) => void;
  /** Hide ship cells (enemy board during play) */
  hidden?: boolean;
  /** Cells that have been fired at, with hit/miss result */
  firedCells?: FiredCell[];
  /** Called when a cell is clicked during the firing phase */
  onFire?: (row: number, col: number) => void;
  /** True when this board is the active firing target */
  firingMode?: boolean;
}

const COLS = 'ABCDEFGHIJ'.split('');

export default function Board({
  placedShips,
  selectedShip,
  orientation,
  onPlace,
  hidden = false,
  firedCells = [],
  onFire,
  firingMode = false,
}: Props) {
  const [hoverCell, setHoverCell] = React.useState<[number, number] | null>(null);

  // Build lookup: (r,c) -> ship id
  const occupiedMap = new Map<string, string>();
  for (const ship of placedShips) {
    for (const [r, c] of getShipCells(ship)) {
      occupiedMap.set(`${r},${c}`, ship.shipType.id);
    }
  }

  // Build fired lookup: (r,c) -> hit | miss
  const firedMap = new Map<string, boolean>();
  for (const fc of firedCells) {
    firedMap.set(`${fc.row},${fc.col}`, fc.hit);
  }

  // Ghost preview during placement phase
  const previewCells = new Set<string>();
  let previewValid = false;
  if (!firingMode && selectedShip && hoverCell) {
    const ghost: PlacedShip = {
      shipType: selectedShip,
      row: hoverCell[0],
      col: hoverCell[1],
      orientation,
    };
    previewValid = isValidPlacement(ghost, placedShips);
    for (const [r, c] of getShipCells(ghost)) {
      previewCells.add(`${r},${c}`);
    }
  }

  function cellClass(row: number, col: number): string {
    const key = `${row},${col}`;
    const classes: string[] = ['cell'];

    if (firedMap.has(key)) {
      classes.push(firedMap.get(key) ? 'hit' : 'miss');
    } else if (!hidden && occupiedMap.has(key)) {
      classes.push('occupied');
    } else if (!hidden && previewCells.has(key)) {
      classes.push(previewValid ? 'preview-valid' : 'preview-invalid');
    } else if (firingMode && hoverCell?.[0] === row && hoverCell?.[1] === col) {
      classes.push('fire-hover');
    }

    return classes.join(' ');
  }

  function handleClick(row: number, col: number) {
    if (firingMode && onFire) {
      if (!firedMap.has(`${row},${col}`)) onFire(row, col);
      return;
    }
    if (selectedShip) onPlace(row, col);
  }

  return (
    <div className="board-wrapper">
      <div className="board-grid">
        <div className="label-corner" />
        {COLS.map(c => (
          <div key={c} className="label-col">{c}</div>
        ))}

        {Array.from({ length: 10 }, (_, row) => (
          <React.Fragment key={row}>
            <div className="label-row">{row + 1}</div>
            {Array.from({ length: 10 }, (_, col) => (
              <div
                key={col}
                className={cellClass(row, col)}
                onMouseEnter={() => setHoverCell([row, col])}
                onMouseLeave={() => setHoverCell(null)}
                onClick={() => handleClick(row, col)}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
