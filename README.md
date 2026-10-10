# Zürich multiplayer prototype

The original Zürich map viewer and Colyseus prototype now run together. The workspace contains the integrated game. The existing React page hosts plain TypeScript gameplay modules and a single Three.js scene. No physics engine, database, or new authentication system was added.

## Run locally

Use Node **22.12+** (Node 24 also works). From `Team67/`:

```sh
npm install
npm run dev
```

Open **http://localhost:5173** in two tabs. Each tab automatically joins a `race` room, with up to 40 players. Players spawn on clear terrain near Hauptbahnhof, alongside a single-seat car and a bike. The project contains only the game client, multiplayer server, and shared code.

Click the scene to focus input. **WASD** moves relative to the camera, **Shift** sprints, **Space** jumps, **E** boards/exits a nearby vehicle, dragging turns the camera, and scrolling zooms. Click **Inspect map** for the original orbit/pan view; this leaves the multiplayer room. **Join multiplayer** reconnects.

Cars and bikes are claimed exclusively by one player. Cars run over foot players and knock them down. Bikes fall on contact with players, vehicles, buildings, or map boundaries, ejecting their rider, then recover after 2.5 seconds. This branch keeps the basic collision foundation; banana throwing and other special mechanics are absent.

## Commands

Run these from `Team67/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Colyseus on 2567 and Vite on 5173, both bound to the network |
| `npm run build` | Regenerate shared map queries from the checked-in GLB, type-check, build `apps/client/dist` |
| `npm start` | One Node process serves the built game and Colyseus on 2567 |
| `npm run bots -- 30` | 30 headless players using the same map movement/impulse code |
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
- `apps/server/src/`: Colyseus 0.18 server, schema 5 state, collision referee, atomic vehicle occupancy, bike falls, and bots.
- `packages/shared/src/`: constants, protocol types, capsule/cart collision math, movement, terrain and building queries, and route sampling.
- `scripts/build-world.ts`: derives `zurich-world.json` from the existing GLB, with a source hash and deterministic placements/route.

Players and vehicle drivers simulate their own movement and send compact reports at 20 Hz. The server validates report speed/bounds, synchronizes state at 20 Hz, and checks player/player and vehicle/player contacts at 30 Hz. It sends impulses to affected clients and broadcasts timestamped bump effects. Clients apply impulses locally; remote players/vehicles render 100 ms behind estimated server time. Occupancy and bike ejection are server authoritative. The server does not simulate foot movement.

The map keeps its original LV95 conversion: **X = E − 2683475**, **Y = elevation − 400**, **Z = 1248000 − N**, in metres. Shared terrain uses bilinear heights on a **2 m grid**, and buildings use a sampled roof/footprint obstruction mask. This is a deliberately approximate hackathon collision surface: it blocks ordinary buildings and follows hills, but does not model doors, tunnels, bridges, rooftop walking, water, or detailed wall geometry. The shuttle route avoids sampled building footprints; it is not an imported road network. The original 60 × 60 plane is only used in regression tests.

The official GLB and source credit are preserved. Builds do not fetch GIS data. See [apps/client/README.md](apps/client/README.md) for provenance and explicit map re-import instructions. If the GLB changes, run `npm run world:build` and commit its generated JSON too.
