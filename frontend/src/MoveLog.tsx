import React, { useState } from 'react';
import { MoveEntry, getGameMoves, getLobbyMoves } from './api';
import './MoveLog.css';

type Source =
  | { kind: 'game'; gameId: string }
  | { kind: 'lobby'; lobbyId: string; playerNumber: 1 | 2 };

interface Props {
  source: Source;
}

const COLS = 'ABCDEFGHIJ';

function formatCell(row: number, col: number): string {
  return `${COLS[col] ?? '?'}${row + 1}`;
}

function formatActor(actor: string, playerNumber?: 1 | 2): string {
  if (actor === 'player') return 'You';
  if (actor === 'ai') return 'AI';
  if (actor === 'player1') return playerNumber === 1 ? 'You' : 'Opponent';
  if (actor === 'player2') return playerNumber === 2 ? 'You' : 'Opponent';
  return actor;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour12: false });
}

export default function MoveLog({ source }: Props) {
  const [moves, setMoves] = useState<MoveEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadIfNeeded() {
    if (moves !== null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data =
        source.kind === 'game'
          ? await getGameMoves(source.gameId)
          : await getLobbyMoves(source.lobbyId);
      setMoves(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load move log');
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (e.currentTarget.open) loadIfNeeded();
  }

  const playerNumber =
    source.kind === 'lobby' ? source.playerNumber : undefined;

  return (
    <details className="move-log" onToggle={handleToggle}>
      <summary>Move Log</summary>
      <div className="move-log-body">
        {loading && <p className="move-log-status">Loading…</p>}
        {error && <p className="move-log-status error">{error}</p>}
        {moves && moves.length === 0 && (
          <p className="move-log-status">No moves recorded.</p>
        )}
        {moves && moves.length > 0 && (
          <ol className="move-list">
            {moves.map((m, i) => {
              const row = parseInt(m.row, 10);
              const col = parseInt(m.col, 10);
              const isHit = m.hit === '1';
              return (
                <li key={m.id} className={`move move-${m.result}`}>
                  <span className="move-num">#{i + 1}</span>
                  <span className="move-time">{formatTime(m.ts_ms)}</span>
                  <span className="move-actor">
                    {formatActor(m.actor, playerNumber)}
                  </span>
                  <span className="move-cell">{formatCell(row, col)}</span>
                  <span className={`move-result ${isHit ? 'hit' : 'miss'}`}>
                    {m.result}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </details>
  );
}
