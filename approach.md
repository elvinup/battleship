# Approach

## Starting point

Before writing any code, I sketched out the technologies I wanted on each side: React with TypeScript for the frontend, FastAPI for the backend, and Redis for persistence. React/TS gives me strong typing across component boundaries, FastAPI gets a clean Python API up in minutes with automatic schema validation via Pydantic, and Redis fit the shape of the data I expected to be working with (mostly transient game state with a natural TTL).

From there I mapped out the major features the backend would need to cover like game creation, ship placement, firing, win detection, AI logic for single-player, and lobby management for multiplayer. Writing this list out first, rather than jumping straight into prompts, let me organize my thoughts and hand Claude Code a coherent set of requirements instead of feeding it features all at once and abusing context.

## Frontend first

I deliberately built the frontend before touching backend logic. Two reasons: it kept the working context narrow (smaller files, fewer cross-cutting concerns), and it forced me to nail the user-facing flow such as placement, firing, game over, rematch. This was before committing to API shapes. Once the UI was solid, the backend's job was just to support what the frontend already needed, which kept the API concise.

## Data model up front

I defined the Redis data model before writing the persistence layer. Every game, single-player or multiplayer, gets its own ID, and that ID is the key under which state lives. The frontend stores the ID in localStorage so refreshes restore the session exactly. You don't lose your board if you accidentally close the tab.

The two persistence patterns I ended up using:

- **JSON blobs under a single key** for `GameState` and `LobbyState`. The whole state object serializes to JSON and lives at `game:{id}` or `lobby:{id}` with a TTL (24h for SP, 2h for lobbies). One read, one write per move. Simple and fits the access pattern.
- **Redis Streams** for game history. When I added the move log, I picked Streams over embedding a list inside the JSON blob because Streams give me server-assigned timestamps for free and let me query historical moves by time range. The stream key (`game:{id}:moves` or `lobby:{id}:moves`) lives alongside the state and gets cleared on rematch so each round starts fresh.


## Spike

If I had to name what this project showcases, it's my ability to reach for the right system for each specific problem and tie them together without the codebase getting tangled. Redis isn't just a cache, it's the primary store for two different access patterns, and the choice of which primitive to use for which job was deliberate. 

The other half of the spike is keeping things organized and simple while still hitting the requirements. The backend is one main file plus small modules for game logic, AI, models, and persistence. The frontend keeps state in one place (`App.tsx`) and pushes presentation into focused components. 

## What I'd add with more time

The obvious next step is making the Redis layer highly available. Sentinel for failover, or a Cluster setup for horizontal scale could've been a nice touch. I scoped that out and decided it was overkill for the time I'd already invested. 

A few other things I'd want next: real authentication so players can't impersonate each other or inspect opponent state via the API and WebSockets to replace the 2-second polling loop.

## Considerations

A player can cheat by checking the Network tab and snooping on API calls to see the matrix of the enemy's list. This should be information purely on server side rather than on the client side.

If the game was a huge board, these would be the slow downs. Checking wins requires scanning all cells each time, which can be reduced from N^2 tto O(N) if we just decrement the ship cells left until 0. Another efficiency to improve would be the AI scanning for a spot to hit being N^2 which could be reduced with a set of available cells and removing them as they're taken, having to randomly choose what's left in the set rather than the whole board.

