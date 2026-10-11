# Zürich map and multiplayer client

The existing React/Vite/Three.js map viewer now hosts the multiplayer prototype. Gameplay stays in small plain TypeScript modules under `src/multiplayer/`, with the shared workspace package supplying movement, protocol, collision math and map queries. The map loader remains independent of gameplay.

## Run

From the repository root (`Team67/`):

```sh
npm install
npm run dev
```

Open http://localhost:5173 in multiple tabs. Click the scene, then WASD to move, Shift to sprint, Space to jump, E to ride/exit, drag to turn and scroll to zoom. Inspect map switches to the original orbit/pan viewer and leaves multiplayer. Join multiplayer reconnects. Root `npm run build && npm start` serves the game and Colyseus together on http://localhost:2567.

Use the **root lockfile**. From `apps/client/`, `npm run dev` also starts both services; `npm run dev:client` starts Vite alone. `npm run lint` checks the frontend. `npm run preview` does not start Colyseus; use root production start to test the complete game. For development on a second device, set `VITE_COLYSEUS_URL` in `apps/client/.env.local` to the server's LAN address. Production uses the page's own host/port automatically.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Page, game viewer and source credit |
| `src/scene/MapViewer.tsx` | Renderer, camera, lights, one animation loop, inspect/play lifecycle |
| `src/multiplayer/MapGame.ts` | Connect gameplay modules to the map scene |
| `src/multiplayer/net.ts` | Colyseus connection, messages, clock synchronization |
| `src/multiplayer/localPlayer.ts` | Focused input and shared local movement |
| `src/multiplayer/remotePlayers.ts` | Snapshots, interpolation, capsule meshes, cosmetic separation |
| `src/multiplayer/vehicles.ts` | Cart prediction, remote vehicles, seats, interaction prompts |
| `src/multiplayer/effects.ts` | Delayed collision particles and generated audio |
| `src/maps/zurich/loadZurichMap.ts` | Map fetching/parsing and GPU disposal |
| `../../packages/shared/src/world.ts` | Shared terrain/building queries and route sampling |
| `../../scripts/build-world.ts` | Offline map preprocessing from the existing GLB |

All gameplay uses the coordinate contract below. The approximate 2 m ground/building grid supplies terrain height and obstruction queries without a physics engine. The HB–ETH shuttle follows a generated clear route, rather than cutting through the map in a straight line. This does not supply detailed doors, bridges, rooftop movement or road geometry.

The existing React shell is retained. All game resources and connections are cleaned up on unmount, including StrictMode remounts. The legacy Python backend and todo components have been removed.

## Official data and coordinates

The geometry is from Stadt Zürich / Geomatik + Vermessung:

- [Bauten – Kombinierte Darstellung heute (3D)](https://data.stadt-zuerich.ch/dataset/geo_bauten___kombinierte_darstellung_heute): existing buildings, combining detailed roofs and block models.
- [Digitales Terrainmodell (TIN) (3D)](https://data.stadt-zuerich.ch/dataset/geo_digitales_terrainmodell__tin_): the ground surface.

Both datasets are published under **CC0**. This is actual city geometry,
with plain materials; no aerial imagery, street textures or fabricated
buildings. The crop is **1,050 × 700 metres**, containing HB and ETH Zentrum:

```text
Source: CH1903+ / LV95 (EPSG:2056), metres
Bounds: [2682950, 1247650, 2684000, 1248350]  (min E, min N, max E, max N)
Origin: [2683475, 1248000, 400]              (E, N, elevation)
Three.js X = easting - 2683475              (east)
Three.js Y = elevation - 400               (up)
Three.js Z = 1248000 - northing             (south; north is -Z)
```

Subtracting a shared origin keeps GPU coordinates small. Preserve this
conversion for later assets so they align. Landmark coordinates in
`area.json` are approximate reference points, not rendered game objects.

The shipped GLB is about **12.3 MiB**, containing 151,132 building triangles
and 48,429 terrain triangles. Source-feature counts in the provenance are
before cropping. Clipping can leave open faces at the edge of the map.
The asset is a fixed snapshot: the browser never calls the city's GIS API.

## Re-import or change the crop

Edit `src/maps/zurich/area.json`, then run:

```sh
npm run map:import
```

This needs internet access to the official WFS services. The importer requests
only the configured bounds with 100 m padding, triangulates each 3D face on
its dominant plane (including vertical walls and polygon holes), clips it,
converts to local coordinates, and writes the GLB plus provenance. It merges
duplicate vertices while preserving face normals. It does not run during
`npm ci`, the production build, or deployment.

If you already downloaded both EPSG:2056 GeoJSON collections, pass them in
buildings/terrain order to avoid another request:

```sh
npm run map:import -- /path/buildings.geojson /path/terrain.geojson
```

Ensure input files cover the entire crop. Commit the regenerated asset and
provenance alongside any bounds/origin changes.

## Deployment

Root `docker-compose.yml` builds from the npm workspace root, serves the build via Caddy on public ports 80/443, and runs Colyseus as its second service. Set `DOMAIN` in the root `.env` to the public DNS name. Caddy obtains TLS certificates and routes matchmaking and WebSocket upgrade requests to Colyseus over the private Docker network. No Python backend or `/api` proxy is required. The root README documents the hackathon portal's WebSocket limitation; test a direct endpoint supporting WebSockets for multiplayer.

After changing/re-importing the map, run `npm run world:build` from the root and commit the generated shared JSON together with the GLB/provenance. Root production builds regenerate this data offline; they never contact GIS services.
