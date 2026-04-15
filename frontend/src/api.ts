/**
 * Backend API client.
 * The server uses snake_case; these types mirror the wire format exactly.
 */

import { PlacedShip } from './types';

const API_BASE = 'http://localhost:8000';

// ── Wire types (snake_case from Python backend) ────────────────────────────

export interface ApiShipType {
  id: string;
  name: string;
  length: number;
}

export interface ApiPlacedShip {
  ship_type: ApiShipType;
  row: number;
  col: number;
  orientation: 'horizontal' | 'vertical';
}

export interface ApiGameState {
  game_id: string;
  mode: 'single' | 'multi';
  phase: 'playing' | 'finished';
  player_ships: ApiPlacedShip[];
  enemy_ships: ApiPlacedShip[];
  /** Cells the AI has fired at on the player's board */
  player_hits: [number, number][];
  /** Cells the player has fired at on the enemy's board */
  enemy_hits: [number, number][];
  winner: 'player' | 'ai' | null;
  current_turn: 'player' | 'ai';
}

// ── Converters ─────────────────────────────────────────────────────────────

export function toApiShips(ships: PlacedShip[]): ApiPlacedShip[] {
  return ships.map(s => ({
    ship_type: { id: s.shipType.id, name: s.shipType.name, length: s.shipType.length },
    row: s.row,
    col: s.col,
    orientation: s.orientation,
  }));
}

export interface ApiLobbyState {
  lobby_id: string;
  status: 'waiting' | 'playing' | 'finished' | 'rematching';
  player1_ships: ApiPlacedShip[] | null;
  player2_ships: ApiPlacedShip[] | null;
  /** Player 1's shots on player 2's board */
  player1_hits: [number, number][];
  /** Player 2's shots on player 1's board */
  player2_hits: [number, number][];
  current_turn: 'player1' | 'player2';
  winner: 'player1' | 'player2' | null;
}

// ── API calls ───────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error(
      'Could not reach the game server. Make sure the backend is running and Redis is up (`docker-compose up redis`).',
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export function newGame(
  mode: 'single' | 'multi',
  playerShips: PlacedShip[],
): Promise<ApiGameState> {
  return request<ApiGameState>('/api/game', {
    method: 'POST',
    body: JSON.stringify({ mode, player_ships: toApiShips(playerShips) }),
  });
}

export function getGame(gameId: string): Promise<ApiGameState> {
  return request<ApiGameState>(`/api/game/${gameId}`);
}

export function fireAt(
  gameId: string,
  row: number,
  col: number,
): Promise<ApiGameState> {
  return request<ApiGameState>(`/api/game/${gameId}/fire`, {
    method: 'POST',
    body: JSON.stringify({ row, col }),
  });
}

// ── Lobby (multiplayer) ─────────────────────────────────────────────────────

export function createLobby(ships: PlacedShip[]): Promise<ApiLobbyState> {
  return request<ApiLobbyState>('/api/lobby', {
    method: 'POST',
    body: JSON.stringify({ ships: toApiShips(ships) }),
  });
}

export function getLobby(lobbyId: string): Promise<ApiLobbyState> {
  return request<ApiLobbyState>(`/api/lobby/${lobbyId}`);
}

export function lobbyPlace(
  lobbyId: string,
  player: 1 | 2,
  ships: PlacedShip[],
): Promise<ApiLobbyState> {
  return request<ApiLobbyState>(`/api/lobby/${lobbyId}/place`, {
    method: 'POST',
    body: JSON.stringify({ player, ships: toApiShips(ships) }),
  });
}

export function lobbyRematch(lobbyId: string): Promise<ApiLobbyState> {
  return request<ApiLobbyState>(`/api/lobby/${lobbyId}/rematch`, { method: 'POST' });
}

export function lobbyFire(
  lobbyId: string,
  player: 1 | 2,
  row: number,
  col: number,
): Promise<ApiLobbyState> {
  return request<ApiLobbyState>(`/api/lobby/${lobbyId}/fire`, {
    method: 'POST',
    body: JSON.stringify({ player, row, col }),
  });
}
