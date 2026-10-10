# Zürich Chase client

Vite + React + three.js. React draws only the menus and room screens; the game runs in one
`renderer.setAnimationLoop` owned by `Engine`, and the HUD is plain DOM written at ≤ 10 Hz.
See the root [README](../../README.md) for commands, controls and the networking design.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Menu, lobby, results and pause screens; owns the `Engine` and the room connection |
| `src/engine/Engine.ts` | Renderer, scene, lights, camera, resize, the single animation loop, frame stats |
| `src/engine/mapLoader.ts` | Map download with progress, theme, trees, pairwise tile merge, BVH for camera rays |
| `src/engine/InspectMode.ts` | Orbit camera, no connection |
| `src/game/PlayMode.ts` | Play mode: wires input, local player, remotes, vehicles, camera, avatars, HUD |
| `src/game/LocalPlayer.ts` | Fixed 60 Hz simulation (on foot or driving) with render interpolation and correction blending |
| `src/game/input.ts` | Pointer lock (`unadjustedMovement`), raw mouse look, keys |
| `src/game/camera.ts` | First person on the body; rear/front third person with a BVH boom |
| `src/game/avatars.ts` | Instanced low-poly rigs: 24 draw calls for all players |
| `src/game/remotes.ts` | Remote players on one adaptive-delay timeline |
| `src/game/vehicles.ts` | Vehicle meshes and poses (scheduled shuttle/traffic, interpolated carts/bikes) |
| `src/net/Net.ts` | Colyseus connection, ping/pong, production URL from the page origin |
| `src/net/clock.ts`, `src/net/interp.ts` | Server clock estimate; Hermite sample buffer |
| `src/net/lag.ts` | `?lag=&jitter=&loss=` network simulator |
| `src/maps/zurich/*` | Map assets contract, theme and tree loader (exported from Blender, see below) |

Use the root lockfile. `npm run dev:client` here starts Vite alone (expects a server on
`VITE_COLYSEUS_URL`, default `ws://<host>:2567`). Production serves this build from the Colyseus
process (`npm start`) or from Caddy (`docker compose`), and connects to the page's own origin.

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

Root `docker-compose.yml` builds from the npm workspace root, serves this build via Caddy on 8080, and runs Colyseus as its second service. Matchmaking and WebSocket upgrade requests route to the multiplayer service. The root README documents the hackathon portal's WebSocket limitation; test a direct endpoint supporting WebSockets for multiplayer.

After changing/re-importing the map, run `npm run world:build` from the root and commit the generated shared JSON together with the GLB/provenance. Root production builds regenerate this data offline; they never contact GIS services.