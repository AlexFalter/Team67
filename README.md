# Zürich Chase

A small multiplayer game on the official Zürich 3D city model (HB ↔ ETH). Vite + React + three.js client,
Colyseus 0.18 server, one shared TypeScript package. Up to 40 players per room.

## Run

Node 22.12+ (24 works). From the repository root:

```sh
npm install
npm run dev        # Colyseus on :2567 + Vite on :5173
```

Open http://localhost:5173 in two or three tabs, enter a name, pick a character, create a room in one tab
and join its code in the others. Everyone presses **Ready**; rounds last three minutes.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Server (watch) and Vite dev server |
| `npm run build` | Regenerate the world grid JSON, type-check, build `apps/client/dist` |
| `npm start` | One Node process serves the built client and Colyseus on `PORT` (default 2567) |
| `npm test` | Movement, interpolation/clock, vehicle rules, live server rooms |
| `npm run check` / `npm run lint` | TypeScript / ESLint |
| `npm run bots -- 30` | 30 headless players (`ROOM_CODE=ABCD` joins a room, else one is created and printed) |
| `docker compose up -d --build` | Caddy (client, port 80 → 8080 inside) + Colyseus behind it |

Environment: `PORT` (server), `ROUND_DURATION_MS` (server, default 180000), `COLYSEUS_URL` (bots),
`VITE_COLYSEUS_URL` (dev client; production derives `ws(s)://` from the page origin).

**Testing bad networks:** add `?lag=150&jitter=30&loss=2` to the page URL (one-way delay ms each direction,
random extra delay, % of messages stalled like a TCP retransmit). **F3** (or backquote) shows the debug overlay:
fps, CPU ms, draw calls, triangles, RTT, jitter, clock offset, interpolation delay and buffer depth,
corrections per second. `?theme=summer` switches the map theme.

## Controls

Click to capture the mouse. Mouse look · **WASD** move · **Shift** sprint · **Space** jump (hold to hop) ·
**F** / click punch · **E** enter/leave a vehicle · **R** running shoes · **V** / **F5** first person / rear /
front view · **Esc** menu (sensitivity, camera bob, end round for the host, leave). **Inspect map** in the menu
orbits the map without connecting; **Practice offline** runs the controller with no server.

## Game rules

- Lobby → Running → Finished. Everyone in the lobby must be ready (ready can be cancelled). The host can end
  the round early; when the host leaves the role passes on. Players joining mid-round wait without an entity.
- Results are shared, sorted by hits landed, include players who left, and stay until the host returns the
  room to the lobby.
- A punch hits in a 90° cone up to 2.4 m (1.5 s cooldown) and knocks down for 5 s. Buildings block punches.
  Players only push each other apart.
- Carts (single seat) run over foot players. Bikes fall and throw their rider on impact. The shuttle has six
  seats: the first passenger starts a 10 s countdown, an empty shuttle cancels it, it drives the terrain route
  HB → ETH (~2 min), nobody can get off on the way, everyone is set down on arrival, and it then waits for the
  trip back. The shuttle and the traffic car keep moving and knock riders off carts and bikes.

## Architecture

```
packages/shared/src   constants.ts (all tuning) · movement.ts (pure step) · world.ts (height grid)
                      vehicles.ts · rules.ts · protocol.ts · zurich-world.json (generated)
apps/server/src       index.ts · GameRoom.ts (rooms, rounds, validation, combat) · vehicles.ts · state.ts · bots.ts
apps/client/src       App.tsx (menus only) · engine/ (renderer, loop, map) · game/ (play mode) · net/ (connection)
```

- **One movement step.** `step(body, input, dt, world)` in `packages/shared/src/movement.ts` is pure and
  allocation-free: Quake-style ground acceleration and friction, capped air acceleration (air strafing),
  coyote time, jump buffering, hold-to-hop with no friction on the landing tick, axis-separated collision
  against the 2 m height grid (`height`, `blocked`). The client, the bots and the tests use the same code.
- **Client feel.** The local player runs at a fixed 60 Hz with render interpolation between ticks. Mouse look
  is applied from raw pointer-lock deltas (`unadjustedMovement`) in the event handler, never smoothed. The
  first-person camera sits exactly on the interpolated body. The local player is never interpolated toward
  the network; rare server corrections leave a render offset that decays in ~150 ms.
- **Authority.** Clients own their movement and send a compact pose array at 30 Hz, stamped with the
  estimated server time. The server validates speed, ground and building columns and corrects bad reports
  (rate-limited). It owns phases, punches (lag-compensated against a short pose history), knockdowns, seats,
  the shuttle schedule and scores. State is flat: one players map of numbers, a small vehicles map, the
  room phase; patches at 30 Hz, simulation tick at 60 Hz.
- **Remote smoothness.** The clock comes from ping/pong (minimum-RTT sample, slewed, never jumping). Remote
  players are drawn on one timeline behind the server clock with cubic Hermite interpolation (positions and
  velocities) over a 16-sample ring, extrapolating at most 100 ms and then holding. The delay is 100 ms on a
  good link and adapts to how late samples really arrive, so `?lag=` never runs the buffer dry. The server
  restamps client samples with their minimum uplink delay: precise spacing, minimal latency. The shuttle and
  traffic are computed from the server schedule, so they are exact on every client.
- **Rendering.** `Engine` owns the renderer and the single `setAnimationLoop`; React never re-renders while
  playing (the HUD writes DOM text at ≤ 10 Hz). Avatars are instanced: 8 segments × 3 characters = 24 draw
  calls for any number of players. The map's City tiles are merged in pairs per material at load time, the
  ground and trees only receive shadows, and the street-level view distance is 700 m with fog: a street-level
  sweep stays at ≤ ~250 draw calls and ~1.4–1.6 M triangles. Camera collision uses `three-mesh-bvh` on map
  meshes only.

The map pipeline (Blender scripts, theme JSON, provenance) is documented in
[apps/client/README.md](apps/client/README.md) and `apps/client/assets-src/zurich/README.md`. Coordinates:
`X = E − 2683475`, `Y = h − 400`, `Z = 1248000 − N` (metres, north is −Z).
