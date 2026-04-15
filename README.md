# Battleship

A full-stack Battleship game with a React/TypeScript frontend and a Python FastAPI backend. Game state is persisted in Redis so sessions survive page refreshes.

---

## Project Layout

```
sentience/
├── frontend/                   React + TypeScript UI
│   ├── public/
│   └── src/
│       ├── api.ts              HTTP client — all calls to the backend
│       ├── App.tsx             Root component, game state management
│       ├── Board.tsx           10×10 grid (placement, hit/miss display, firing)
│       ├── ShipSelector.tsx    Ship picker, rotate, mode toggle, Play/Quit
│       ├── types.ts            Shared types + client-side placement helpers
│       ├── App.css
│       ├── Board.css
│       └── ShipSelector.css
│
├── backend/                    Python FastAPI backend
│   ├── main.py                 API routes (new game, get game, fire)
│   ├── game_logic.py           Ship placement, validation, win detection
│   ├── ai.py                   AI turn logic (random targeting + DFS sinking)
│   ├── models.py               Pydantic models (GameState, PlacedShip, etc.)
│   ├── redis_client.py         Save/load game state in Redis
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml          Spins up Redis + backend together
├── battleship.md               Original game spec
└── README.md
```

---

## Architecture

### Frontend (`frontend/`)

Built with Create React App (TypeScript). Runs on `http://localhost:3000`.

- **Placement phase** — click ships in the sidebar to select them, hover the board to preview, click to place. Ships can be rotated (H/V). Invalid placements (out-of-bounds, overlapping) are shown in red.
- **Mode toggle** — choose *vs AI* (default) or *Multiplayer* before pressing Play.
- **Playing phase** — click cells on the enemy board to fire. Hit cells turn red; misses show a grey dot. Your board shows incoming AI hits in the same style.
- **Game over** — a banner announces the winner. Quit Game resets everything back to placement.

### Backend (`backend/`)

FastAPI app. Runs on `http://localhost:8000`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/game` | Start a new game. Accepts player ship placements and game mode. Returns the full initial `GameState` including randomly placed enemy ships. |
| `GET` | `/api/game/{game_id}` | Fetch current game state. Used to restore state after a page refresh. |
| `POST` | `/api/game/{game_id}/fire` | Player fires at `{row, col}` on the enemy board. The server validates the shot, checks for a win, then immediately runs the AI turn and returns the updated state. |

### Game Logic (`game_logic.py`)

- `random_placement()` — places all 5 ships one by one in random orientations and positions, retrying on collision.
- `is_valid_placement()` — checks bounds and overlap.
- `all_ships_sunk()` — returns `True` when every cell of every ship appears in the hit list.

### AI Logic (`ai.py`)

1. Collect all cells the AI hasn't targeted yet.
2. Pick one at random.
3. **Miss** — record the cell and end the turn.
4. **Hit** — run a 4-directional DFS from the hit cell, following cells that belong to the same ship ID. Every cell in the connected component is marked hit in a single turn, sinking the entire ship immediately.
5. Return all newly hit cells to the caller.

### State Persistence (`redis_client.py`)

Game state is serialised to JSON and stored in Redis under the key `game:{game_id}` with a 24-hour TTL. Loading the page and supplying the same `game_id` restores the session exactly.

---

## Running Locally

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker (for Redis)

### 1. Start Redis

```bash
docker-compose up redis
```

To run the backend in Docker too:

```bash
docker-compose up
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# API available at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

### 3. Frontend

```bash
cd frontend
npm install
npm start
# App available at http://localhost:3000
```

---

## Ships

| Ship | Length |
|------|--------|
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

---

## Game Rules

- Each player has a hidden 10×10 grid.
- **Placement phase** — place all 5 ships; ships cannot overlap or extend beyond the grid.
- **Firing phase** — players alternate firing at coordinates. Each shot is either a hit or a miss. Sinking all cells of a ship sinks it.
- **Win condition** — first to sink all opponent ships wins.
