# Zürich multiplayer prototype

The original Zürich map viewer and Colyseus prototype now run together. The workspace contains the integrated game. The existing React page hosts plain TypeScript gameplay modules and a single Three.js scene. Rapier handles relevant entity contacts; shared map queries keep terrain movement deterministic. No database or authentication system is required.

## Run locally

Use Node **22.12+** (Node 24 also works). From `Team67/`:

```sh
npm install
npm run dev
```

Open **http://localhost:5173** in two tabs. Create a room with a code, then join that same code in another tab (up to 40 players). Choose CS Student, Student Athlete, or Albert Einstein. Players spawn on clear terrain near Hauptbahnhof, alongside three single-seat carts and a six-seat shuttle. The project contains only the game client, multiplayer server, and shared code.

Enter your name (1-24 characters), choose a character, and create or join a room. Rooms follow **Lobby ? Running ? Finished**. In the room lobby, everyone must press **Ready** before the round starts; readiness can be cancelled while waiting. Joining an ongoing round opens a waiting screen instead of spawning a player.

Rounds last **three minutes** by default (`ROUND_DURATION_MS` on the server). The host can also end the round from the game menu. At the end, every connected member sees the same results, sorted by hits landed, including players who left during the round. The host can return everyone to the lobby; waiting members can then ready up and play. If the host leaves, host duties pass to another connected member. Gameplay and vehicle claims are disabled outside a running round and for waiting members.

Click **Click to play** to capture the cursor. Mouse / trackpad looks, **WASD** runs, **Shift** sprints, **Space** jumps, **C** slides while sprinting, **E** rides/exits, **F / click** punches. **F5 / V** cycles first-person, rear, and front views. **Esc** opens the quick menu (bob, sensitivity, leave). **Inspect map** from the lobby/menu leaves the room; **Join multiplayer** returns to the lobby.

Carts are claimed exclusively by one player. Their driver can run over foot players. The shuttle starts its **10-second countdown** when the first passenger boards, follows a shared terrain route toward ETH, and automatically disembarks riders on arrival. Later boarders do not reset the countdown. An empty shuttle cancels its countdown; passengers cannot exit while it travels. Board again at ETH for the return trip. The route is roughly two minutes each way, rather than the old short flat-plane trip.

## Commands

Run these from `Team67/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Colyseus on 2567 and Vite on 5173, both bound to the network |
| `npm run build` | Regenerate shared map queries from the checked-in GLB, type-check, build `apps/client/dist` |
| `npm start` | One Node process serves the built game and Colyseus on 2567 |
| `npm run bots -- 30` | 30 headless players using native inputs (set ROOM_CODE to join a visible room) |
| `npm test` | Shared collision, interpolation, live server, vehicle, and map regression checks |
| `npm run check` | TypeScript checks across the workspace |
| `npm run lint` | Frontend ESLint |
| `npm run world:build` | Regenerate terrain/building queries and shuttle route, entirely offline |

`npm run dev` from `apps/client/` also starts both services. Use the root workspace install and lockfile. `npm run dev:client` inside `apps/client/` starts only Vite for work with an already running server. `vite preview` alone serves static files and does not provide the multiplayer service.

## Environment and production

| Variable | Used by | Meaning |
| --- | --- | --- |
| `VITE_COLYSEUS_URL` | Vite development client | Defaults to `ws://localhost:2567`; copy `apps/client/.env.example` to `apps/client/.env.local` to override |
| `PORT` | Node server | Defaults to 2567 |
| `COLYSEUS_URL` | Bots | Defaults to `ws://localhost:2567` |
| `GAME_WORLD=flat` | Server/bots regression tests | Old flat prototype world; leave unset for the Zürich frontend |

```sh
npm run build
npm start
```

Open **http://localhost:2567**. On another device on the same LAN, open `http://<server-LAN-IP>:2567` and allow that port through the host firewall. Production derives its WebSocket URL from the page's host and port, using `wss:` with HTTPS. No client environment override is required in production. For Vite development from another device, set `VITE_COLYSEUS_URL=ws://<server-LAN-IP>:2567` and restart Vite; otherwise its default points at that device's own localhost.

Docker Compose runs two services: `client` (Caddy) and `server` (Colyseus). Caddy on **8080** forwards `/matchmake/*` and WebSocket upgrade requests to Colyseus and serves the frontend:

```sh
docker compose up -d --build --remove-orphans
```

Open http://localhost:8080. No `.env` file or API key is required. The service names have changed; `--remove-orphans` removes containers from the previous layout. View logs with `docker compose logs -f client server` and stop the game with `docker compose down`.

The original hackathon template documents that the **portal proxy rejects WebSockets with 502**. Caddy routing cannot fix a proxy upstream of it. Use direct LAN access, an SSH tunnel, or a deployment endpoint that supports WebSockets; portal compatibility must be verified separately. Inspection mode still works without a multiplayer connection.

## Architecture and authority

- `apps/client/src/scene/MapViewer.tsx`: map loading, renderer, camera, lights, resizing, one animation loop, inspect/play lifecycle.
- `apps/client/src/multiplayer/`: local movement/input, delayed remote interpolation, networking/clock sync, vehicles, particles/audio, and HUD. `MapGame.ts` wires these into the existing map scene.
- `apps/server/src/`: Colyseus 0.18 server, schema 5 state, collision referee, atomic vehicle occupancy, shuttle schedule, and bots.
- `packages/shared/src/`: constants, protocol types, capsule/cart collision math, movement, terrain and building queries, and route sampling.
- `scripts/build-world.ts`: derives `zurich-world.json` from the existing GLB, with a source hash and deterministic placements/route.

Networking follows main's client-owned movement: compact movement/vehicle reports at 20 Hz, server validation, ping/pong clock synchronization, and impulse messages with 20 Hz state patches. The feature's shared movement, camera, character rigs, and Rapier contacts are retained. Remote players/vehicles interpolate 100 ms behind estimated server time. Player contact only separates players; cone hits knock down for five seconds. Bikes fall/eject on impacts, heavy trams keep moving, and foot movement uses acceleration and momentum. The server owns occupancy, action cooldowns, transport schedules, and collision corrections. Banana dropping/throwing and peel slips are removed.

The map keeps its original LV95 conversion: **X = E − 2683475**, **Y = elevation − 400**, **Z = 1248000 − N**, in metres. Shared terrain uses bilinear heights on a **2 m grid**, and buildings use a sampled roof/footprint obstruction mask. This is a deliberately approximate hackathon collision surface: it blocks ordinary buildings and follows hills, but does not model doors, tunnels, bridges, rooftop walking, water, or detailed wall geometry. The shuttle route avoids sampled building footprints; it is not an imported road network. The original 60 × 60 plane is only used in regression tests.

The official GLB and source credit are preserved. Builds do not fetch GIS data. See [apps/client/README.md](apps/client/README.md) for provenance and explicit map re-import instructions. If the GLB changes, run `npm run world:build` and commit its generated JSON too.

## Late for ETH mini-games prototype

The complete modular single-player prototype is in [`mini-games/`](mini-games/README.md). Run it independently:

```sh
cd mini-games
npm ci
npm run dev
```

See its [module guide](mini-games/src/README.md), [feature export guide](mini-games/docs/feature-modules.md), and [map placement guide](mini-games/src/world/placements/README.md). Features include NPC encounters, bike and scooter interactions, ticket and Mate machines, phone tasks, and vehicle passenger systems. This prototype is available alongside the multiplayer app; the feature modules are not yet wired into multiplayer.

Dev mode is available under **Testing** before creating a room. Enable **Dev mode → Skip starting bus animation** to start everyone directly at the normal bus drop-off when the host starts the match. These preferences are saved on the browser and belong to the room creator; joining a room follows that room’s settings. Dev mode can also keep the intro enabled. The skip persists for subsequent rounds in the same room.
