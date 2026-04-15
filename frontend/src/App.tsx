import React, { useState, useEffect, useRef } from 'react';
import Board, { FiredCell } from './Board';
import ShipSelector, { GameMode, GamePhase } from './ShipSelector';
import LobbyPopup from './LobbyPopup';
import { SHIP_TYPES, ShipType, PlacedShip, Orientation, isValidPlacement } from './types';
import {
  newGame, fireAt, getGame, ApiGameState, ApiPlacedShip,
  createLobby, getLobby, lobbyPlace, lobbyFire, lobbyRematch, ApiLobbyState,
} from './api';
import './App.css';

const GAME_ID_KEY    = 'battleship_game_id';
const LOBBY_ID_KEY   = 'battleship_lobby_id';
const PLAYER_NUM_KEY = 'battleship_player_number';
const PLACEMENT_KEY  = 'battleship_placement';

function buildOccupiedSet(ships: ApiPlacedShip[]): Set<string> {
  const s = new Set<string>();
  for (const ship of ships) {
    for (let i = 0; i < ship.ship_type.length; i++) {
      const r = ship.orientation === 'vertical'   ? ship.row + i : ship.row;
      const c = ship.orientation === 'horizontal' ? ship.col + i : ship.col;
      s.add(`${r},${c}`);
    }
  }
  return s;
}

function toFiredCells(hits: [number, number][], shipSet: Set<string>): FiredCell[] {
  return hits.map(([row, col]) => ({ row, col, hit: shipSet.has(`${row},${col}`) }));
}

function apiShipsToLocal(ships: ApiPlacedShip[]): PlacedShip[] {
  return ships.map(s => ({
    shipType: s.ship_type,
    row: s.row,
    col: s.col,
    orientation: s.orientation,
  }));
}

export default function App() {
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>(() => {
    try {
      const saved = localStorage.getItem(PLACEMENT_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedShip, setSelectedShip] = useState<ShipType | null>(null);
  const [orientation, setOrientation]   = useState<Orientation>('horizontal');
  const [gamePhase, setGamePhase]       = useState<GamePhase>('placement');
  const [gameMode, setGameMode]         = useState<GameMode>('single');

  // Single-player AI game state
  const [gameState, setGameState] = useState<ApiGameState | null>(null);

  // Multiplayer lobby state
  const [lobbyState, setLobbyState]     = useState<ApiLobbyState | null>(null);
  const [playerNumber, setPlayerNumber] = useState<1 | 2 | null>(null);
  const [isLobbyWaiting, setIsLobbyWaiting] = useState(false); // P1 waiting screen
  const [isPlayer2Placing, setIsPlayer2Placing] = useState(false); // P2 in placement after joining
  const [joinLobbyInput, setJoinLobbyInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const gameId  = localStorage.getItem(GAME_ID_KEY);
    const lobbyId = localStorage.getItem(LOBBY_ID_KEY);
    const pNum    = localStorage.getItem(PLAYER_NUM_KEY);

    if (gameId) {
      setLoading(true);
      getGame(gameId)
        .then(state => {
          setPlacedShips(apiShipsToLocal(state.player_ships));
          setGameState(state);
          setGamePhase('playing');
          setGameMode(state.mode);
        })
        .catch(() => localStorage.removeItem(GAME_ID_KEY))
        .finally(() => setLoading(false));
    } else if (lobbyId && pNum) {
      setLoading(true);
      getLobby(lobbyId)
        .then(state => {
          const num = Number(pNum) as 1 | 2;
          setLobbyState(state);
          setPlayerNumber(num);
          setGameMode('multi');

          if (state.status === 'playing' || state.status === 'finished') {
            const myShips = num === 1 ? state.player1_ships : state.player2_ships;
            if (myShips) setPlacedShips(apiShipsToLocal(myShips));
            setGamePhase('playing');
          } else if (state.status === 'rematching') {
            setGamePhase('placement');
            setIsPlayer2Placing(true);
          } else if (num === 1) {
            // P1 still waiting
            setIsLobbyWaiting(true);
          } else {
            // P2 still placing
            setIsPlayer2Placing(true);
          }
        })
        .catch(() => {
          localStorage.removeItem(LOBBY_ID_KEY);
          localStorage.removeItem(PLAYER_NUM_KEY);
        })
        .finally(() => setLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll lobby state while waiting or playing multiplayer ─────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!lobbyState || gameMode !== 'multi') return;

    pollRef.current = setInterval(async () => {
      try {
        const fresh = await getLobby(lobbyState.lobby_id);
        setLobbyState(fresh);
        if (
          fresh.status === 'playing' &&
          gamePhase === 'placement' &&
          fresh.player1_ships &&
          fresh.player2_ships
        ) {
          const myShips = playerNumber === 1 ? fresh.player1_ships : fresh.player2_ships;
          if (myShips) setPlacedShips(apiShipsToLocal(myShips));
          setIsLobbyWaiting(false);
          setIsPlayer2Placing(false);
          setGamePhase('playing');
        } else if (fresh.status === 'rematching' && gamePhase === 'playing') {
          // Opponent triggered rematch — go back to placement
          setPlacedShips([]);
          localStorage.removeItem(PLACEMENT_KEY);
          setGamePhase('placement');
          setIsPlayer2Placing(true);
        }
      } catch { /* ignore transient errors */ }
    }, 2000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [lobbyState?.lobby_id, lobbyState?.status, gamePhase, gameMode, playerNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Placement helpers ─────────────────────────────────────────────────────
  const placedIds = new Set(placedShips.map(s => s.shipType.id));

  function handleSelect(ship: ShipType) {
    setSelectedShip(prev => (prev?.id === ship.id ? null : ship));
  }

  function handleRotate() {
    setOrientation(o => (o === 'horizontal' ? 'vertical' : 'horizontal'));
  }

  function handlePlace(row: number, col: number) {
    if (!selectedShip) return;
    const candidate: PlacedShip = { shipType: selectedShip, row, col, orientation };
    if (!isValidPlacement(candidate, placedShips)) return;
    const nextShips = [...placedShips, candidate];
    setPlacedShips(nextShips);
    localStorage.setItem(PLACEMENT_KEY, JSON.stringify(nextShips));
    const newIds = new Set(Array.from(placedIds).concat(selectedShip.id));
    setSelectedShip(SHIP_TYPES.find(s => !newIds.has(s.id)) ?? null);
  }

  function handleReset() {
    localStorage.removeItem(PLACEMENT_KEY);
    setPlacedShips([]);
    setSelectedShip(null);
    setOrientation('horizontal');
  }

  // ── Single-player: Play ───────────────────────────────────────────────────
  async function handlePlay() {
    setLoading(true);
    setError(null);
    try {
      if (gameMode === 'multi') {
        // Player 1 creates a lobby
        const state = await createLobby(placedShips);
        localStorage.setItem(LOBBY_ID_KEY, state.lobby_id);
        localStorage.setItem(PLAYER_NUM_KEY, '1');
        localStorage.removeItem(PLACEMENT_KEY);
        setLobbyState(state);
        setPlayerNumber(1);
        setIsLobbyWaiting(true);
      } else {
        const state = await newGame('single', placedShips);
        localStorage.setItem(GAME_ID_KEY, state.game_id);
        localStorage.removeItem(PLACEMENT_KEY);
        setGameState(state);
        setGamePhase('playing');
      }
      setSelectedShip(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to start game');
    } finally {
      setLoading(false);
    }
  }

  // ── Multiplayer: Join lobby (Player 2) ────────────────────────────────────
  async function handleJoinLobby() {
    if (!joinLobbyInput) return;
    setLoading(true);
    setError(null);
    try {
      const state = await getLobby(joinLobbyInput);
      if (state.status !== 'waiting') {
        setError('Lobby is not accepting new players.');
        return;
      }
      localStorage.setItem(LOBBY_ID_KEY, state.lobby_id);
      localStorage.setItem(PLAYER_NUM_KEY, '2');
      setLobbyState(state);
      setPlayerNumber(2);
      setIsPlayer2Placing(true);
      setJoinLobbyInput('');
    } catch (e: any) {
      setError(e.message ?? 'Lobby not found');
    } finally {
      setLoading(false);
    }
  }

  // ── Multiplayer: Player 2 submits ships ───────────────────────────────────
  async function handleReady() {
    if (!lobbyState || !playerNumber) return;
    setLoading(true);
    setError(null);
    try {
      const state = await lobbyPlace(lobbyState.lobby_id, playerNumber, placedShips);
      localStorage.removeItem(PLACEMENT_KEY);
      setLobbyState(state);
      if (state.status === 'playing') {
        setIsPlayer2Placing(false);
        setGamePhase('playing');
      }
      // else opponent hasn't placed yet — stay in placement phase and wait
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit ships');
    } finally {
      setLoading(false);
    }
  }

  // ── Rematch ───────────────────────────────────────────────────────────────
  async function handleRematch() {
    if (gameMode !== 'multi' || !lobbyState) {
      // Single-player rematch — start a new AI game with the same placement
      if (!gameState) return;
      setLoading(true);
      setError(null);
      try {
        const state = await newGame('single', placedShips);
        localStorage.setItem(GAME_ID_KEY, state.game_id);
        setGameState(state);
      } catch (e: any) {
        setError(e.message ?? 'Failed to start rematch');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Multiplayer rematch — kill polling first to avoid stale-closure races,
    // then synchronously reset placement state BEFORE awaiting the backend.
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    setPlacedShips([]);
    setSelectedShip(null);
    setOrientation('horizontal');
    localStorage.removeItem(PLACEMENT_KEY);
    setGamePhase('placement');
    setIsPlayer2Placing(true);
    setIsLobbyWaiting(false);

    setLoading(true);
    setError(null);
    try {
      const state = await lobbyRematch(lobbyState.lobby_id);
      setLobbyState(state);
    } catch (e: any) {
      setError(e.message ?? 'Failed to start rematch');
    } finally {
      setLoading(false);
    }
  }

  // ── Single-player: Fire ───────────────────────────────────────────────────
  async function handleFire(row: number, col: number) {
    if (!gameState || loading) return;
    setLoading(true);
    setError(null);
    try {
      setGameState(await fireAt(gameState.game_id, row, col));
    } catch (e: any) {
      setError(e.message ?? 'Failed to fire');
    } finally {
      setLoading(false);
    }
  }

  // ── Multiplayer: Fire ─────────────────────────────────────────────────────
  async function handleLobbyFire(row: number, col: number) {
    if (!lobbyState || !playerNumber || loading) return;
    setLoading(true);
    setError(null);
    try {
      setLobbyState(await lobbyFire(lobbyState.lobby_id, playerNumber, row, col));
    } catch (e: any) {
      setError(e.message ?? 'Failed to fire');
    } finally {
      setLoading(false);
    }
  }

  // ── Quit / Cancel ─────────────────────────────────────────────────────────
  function handleQuit() {
    if (pollRef.current) clearInterval(pollRef.current);
    localStorage.removeItem(GAME_ID_KEY);
    localStorage.removeItem(LOBBY_ID_KEY);
    localStorage.removeItem(PLAYER_NUM_KEY);
    localStorage.removeItem(PLACEMENT_KEY);
    setPlacedShips([]);
    setGameState(null);
    setLobbyState(null);
    setPlayerNumber(null);
    setIsLobbyWaiting(false);
    setIsPlayer2Placing(false);
    setSelectedShip(null);
    setOrientation('horizontal');
    setGamePhase('placement');
    setGameMode('single');
    setError(null);
  }

  // ── Derive board data ─────────────────────────────────────────────────────
  const isMulti   = gameMode === 'multi';
  const isPlaying = gamePhase === 'playing';

  // Single-player derived cells
  const spEnemyOcc  = gameState ? buildOccupiedSet(gameState.enemy_ships)  : new Set<string>();
  const spPlayerOcc = gameState ? buildOccupiedSet(gameState.player_ships) : new Set<string>();
  const spEnemyFired : FiredCell[] = gameState ? toFiredCells(gameState.enemy_hits  as [number,number][], spEnemyOcc)  : [];
  const spPlayerFired: FiredCell[] = gameState ? toFiredCells(gameState.player_hits as [number,number][], spPlayerOcc) : [];

  // Multiplayer derived cells
  const myShipsApi  = lobbyState ? (playerNumber === 1 ? lobbyState.player1_ships : lobbyState.player2_ships) : null;
  const oppShipsApi = lobbyState ? (playerNumber === 1 ? lobbyState.player2_ships : lobbyState.player1_ships) : null;
  const myHits      = lobbyState ? (playerNumber === 1 ? lobbyState.player1_hits  : lobbyState.player2_hits)  : [];
  const oppHits     = lobbyState ? (playerNumber === 1 ? lobbyState.player2_hits  : lobbyState.player1_hits)  : [];

  const mpOppOcc  = oppShipsApi ? buildOccupiedSet(oppShipsApi) : new Set<string>();
  const mpMyOcc   = myShipsApi  ? buildOccupiedSet(myShipsApi)  : new Set<string>();
  const mpEnemyFired : FiredCell[] = toFiredCells(myHits  as [number,number][], mpOppOcc);
  const mpPlayerFired: FiredCell[] = toFiredCells(oppHits as [number,number][], mpMyOcc);

  const enemyFiredCells  = isMulti ? mpEnemyFired  : spEnemyFired;
  const playerFiredCells = isMulti ? mpPlayerFired : spPlayerFired;

  const enemyShipsForBoard: PlacedShip[] = isMulti
    ? (oppShipsApi ? apiShipsToLocal(oppShipsApi) : [])
    : (gameState?.enemy_ships ? apiShipsToLocal(gameState.enemy_ships) : []);

  // Win/lose banners
  const spFinished = gameState?.phase === 'finished';
  const mpFinished = lobbyState?.status === 'finished';

  const winnerBanner = (() => {
    if (spFinished && gameState) {
      return gameState.winner === 'player' ? 'You win! All enemy ships sunk.' : 'You lose! The AI sunk your fleet.';
    }
    if (mpFinished && lobbyState) {
      const myKey = `player${playerNumber}`;
      return lobbyState.winner === myKey ? 'You win! All enemy ships sunk.' : 'You lose! Your fleet was destroyed.';
    }
    return null;
  })();
  const winnerIsMe = spFinished
    ? gameState?.winner === 'player'
    : lobbyState?.winner === `player${playerNumber}`;

  const canFire = isPlaying && !spFinished && !mpFinished && !loading && (
    isMulti
      ? lobbyState?.current_turn === `player${playerNumber}`
      : gameState?.current_turn === 'player'
  );

  const subtitleText = !isPlaying
    ? 'Placement Phase'
    : isMulti ? 'Multiplayer' : 'vs AI';

  const turnBanner = isPlaying && isMulti && !mpFinished && (
    lobbyState?.current_turn === `player${playerNumber}`
      ? "Your turn — fire!"
      : "Opponent's turn…"
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Battleship</h1>
        <p className="subtitle">{subtitleText}</p>
      </header>

      {winnerBanner && (
        <div className={`game-banner ${winnerIsMe ? 'win' : 'lose'}`}>
          {winnerBanner}
        </div>
      )}

      {turnBanner && <div className="turn-banner">{turnBanner}</div>}

      {error && <div className="error-banner">{error}</div>}

      {/* P1 lobby-code popup — floats over the boards */}
      {isLobbyWaiting && lobbyState && (
        <LobbyPopup lobbyId={lobbyState.lobby_id} onCancel={handleQuit} />
      )}

      <main className="app-main">
          <div className="board-section">
            <p className="board-label">Your Board</p>
            <Board
              placedShips={placedShips}
              selectedShip={!isPlaying ? selectedShip : null}
              orientation={orientation}
              onPlace={handlePlace}
              firedCells={playerFiredCells}
            />
          </div>

          <ShipSelector
            ships={SHIP_TYPES}
            placedIds={placedIds}
            selectedShip={selectedShip}
            orientation={orientation}
            gamePhase={gamePhase}
            gameMode={gameMode}
            loading={loading}
            isFinished={spFinished || mpFinished}
            onRematch={handleRematch}
            isPlayer2Placing={isPlayer2Placing}
            joinLobbyInput={joinLobbyInput}
            onJoinLobbyInputChange={setJoinLobbyInput}
            onJoinLobby={handleJoinLobby}
            onReady={handleReady}
            onSelect={handleSelect}
            onRotate={handleRotate}
            onReset={handleReset}
            onPlay={handlePlay}
            onSetMode={setGameMode}
            onQuit={handleQuit}
          />

          <div className="board-section">
            <p className="board-label">
              {isMulti ? `Player ${playerNumber === 1 ? 2 : 1}'s Board` : 'Enemy Board'}
            </p>
            <Board
              placedShips={enemyShipsForBoard}
              selectedShip={null}
              orientation={orientation}
              onPlace={() => {}}
              hidden={true}
              firedCells={enemyFiredCells}
              onFire={isMulti ? handleLobbyFire : handleFire}
              firingMode={canFire}
            />
          </div>
        </main>
    </div>
  );
}
