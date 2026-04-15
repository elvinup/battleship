import React from 'react';
import { ShipType, Orientation } from './types';
import './ShipSelector.css';

export type GameMode = 'single' | 'multi';
export type GamePhase = 'placement' | 'playing';

interface Props {
  ships: ShipType[];
  placedIds: Set<string>;
  selectedShip: ShipType | null;
  orientation: Orientation;
  gamePhase: GamePhase;
  gameMode: GameMode;
  loading?: boolean;
  isFinished?: boolean;
  onRematch?: () => void;
  /** True when this player has joined a lobby as Player 2 and is placing ships */
  isPlayer2Placing?: boolean;
  /** Controlled value for the "join lobby" text input */
  joinLobbyInput?: string;
  onJoinLobbyInputChange?: (val: string) => void;
  onJoinLobby?: () => void;
  onReady?: () => void;
  onSelect: (ship: ShipType) => void;
  onRotate: () => void;
  onReset: () => void;
  onPlay: () => void;
  onSetMode: (mode: GameMode) => void;
  onQuit: () => void;
}

export default function ShipSelector({
  ships,
  placedIds,
  selectedShip,
  orientation,
  gamePhase,
  gameMode,
  loading = false,
  isFinished = false,
  onRematch,
  isPlayer2Placing = false,
  joinLobbyInput = '',
  onJoinLobbyInputChange,
  onJoinLobby,
  onReady,
  onSelect,
  onRotate,
  onReset,
  onPlay,
  onSetMode,
  onQuit,
}: Props) {
  const allPlaced = placedIds.size === ships.length;
  const isPlaying = gamePhase === 'playing';

  return (
    <div className="ship-selector">
      <h2 className="selector-title">
        {isPlaying ? 'Fleet' : 'Place Your Ships'}
      </h2>

      <div className="ship-list">
        {ships.map(ship => {
          const isPlaced = placedIds.has(ship.id);
          const isSelected = selectedShip?.id === ship.id;
          return (
            <button
              key={ship.id}
              className={`ship-btn ${isPlaced ? 'placed' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => !isPlaced && !isPlaying && onSelect(ship)}
              disabled={isPlaced || isPlaying}
            >
              <span className="ship-name">{ship.name}</span>
              <span className="ship-cells">
                {Array.from({ length: ship.length }, (_, i) => (
                  <span key={i} className="ship-cell-dot" />
                ))}
              </span>
              <span className="ship-length">{ship.length}</span>
              {isPlaced && <span className="placed-badge">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="controls">
        {!isPlaying && (
          <>
            <button className="ctrl-btn" onClick={onRotate} disabled={!selectedShip}>
              ↻ Rotate ({orientation === 'horizontal' ? 'H' : 'V'})
            </button>

            {/* Mode toggle — hidden once P2 has joined a lobby */}
            {!isPlayer2Placing && (
              <div className="mode-toggle">
                <button
                  className={`mode-btn ${gameMode === 'single' ? 'active' : ''}`}
                  onClick={() => onSetMode('single')}
                >
                  vs AI
                </button>
                <button
                  className={`mode-btn ${gameMode === 'multi' ? 'active' : ''}`}
                  onClick={() => onSetMode('multi')}
                >
                  Multiplayer
                </button>
              </div>
            )}

            {/* Player 2 in lobby: Ready button only */}
            {isPlayer2Placing ? (
              <button
                className="ctrl-btn play"
                onClick={onReady}
                disabled={!allPlaced || loading}
              >
                {loading ? 'Joining…' : '✓ Ready'}
              </button>
            ) : (
              <button
                className="ctrl-btn play"
                onClick={onPlay}
                disabled={!allPlaced || loading}
              >
                {loading
                  ? 'Starting…'
                  : gameMode === 'multi' ? '▶ Create Lobby' : '▶ Play'}
              </button>
            )}

            {/* Join lobby section — shown in multiplayer mode when not P2 already */}
            {gameMode === 'multi' && !isPlayer2Placing && (
              <div className="join-lobby">
                <p className="join-lobby-label">— or join a lobby —</p>
                <div className="join-lobby-row">
                  <input
                    className="join-lobby-input"
                    type="text"
                    placeholder="Lobby code"
                    maxLength={6}
                    value={joinLobbyInput}
                    onChange={e => onJoinLobbyInputChange?.(e.target.value.toUpperCase())}
                  />
                  <button
                    className="join-lobby-btn"
                    onClick={onJoinLobby}
                    disabled={joinLobbyInput.length < 1 || loading}
                  >
                    {loading ? '…' : 'Join'}
                  </button>
                </div>
              </div>
            )}

            {!isPlayer2Placing && (
              <button className="ctrl-btn danger" onClick={onReset}>
                Reset Board
              </button>
            )}
          </>
        )}

        {isPlaying && (
          <>
            {isFinished && (
              <button className="ctrl-btn rematch" onClick={onRematch} disabled={loading}>
                ↺ Rematch
              </button>
            )}
            <button className="ctrl-btn danger" onClick={onQuit} disabled={loading}>
              ✕ Quit Game
            </button>
          </>
        )}
      </div>

      {!isPlaying && selectedShip && (
        <p className="hint">
          Click a cell to place <strong>{selectedShip.name}</strong>{' '}
          ({orientation})
        </p>
      )}
      {!isPlaying && !selectedShip && !allPlaced && (
        <p className="hint">Select a ship above to place it.</p>
      )}
      {!isPlaying && allPlaced && !isPlayer2Placing && (
        <p className="hint ready">
          All ships placed!{' '}
          {gameMode === 'multi' ? 'Press Create Lobby to start.' : 'Press Play to start.'}
        </p>
      )}
      {!isPlaying && allPlaced && isPlayer2Placing && (
        <p className="hint ready">All ships placed! Press Ready when done.</p>
      )}
      {isPlaying && (
        <p className="hint">
          {gameMode === 'single' ? 'Playing vs AI' : 'Multiplayer'}
        </p>
      )}
    </div>
  );
}
