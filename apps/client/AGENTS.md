# Frontend development agreement

## Integrated workspace

This frontend now mounts the Zürich multiplayer game. The canonical Colyseus server is `../server`, shared movement/protocol/world data is `../../packages/shared`, and plain TypeScript gameplay modules are in `src/multiplayer`. The old standalone prototype and Python demo backend have been removed. Use the root npm workspace install and lockfile.

From `Team67/`: `npm install`, `npm run dev`. Open port 5173. Root `npm run build` regenerates shared map data, checks TypeScript and builds `apps/client/dist`; `npm start` serves the frontend and multiplayer from one Node process on 2567. Root `npm test` checks collision, vehicles, interpolation, live room behavior and terrain. Run frontend lint as `npm run lint` from the root. The workspace contains only the client, server, and shared package; no game API key is required.

## Coordinate contract

The fixed source origin is LV95 / EPSG:2056 **(2683475, 1248000, 400)**, in metres:

```text
X = easting - 2683475     east is +X
Y = elevation - 400      up is +Y; entity y is feet/ground contact
Z = 1248000 - northing    north is -Z
```

`src/maps/zurich/area.json` is the map contract. Do not recenter assets or reconvert the loaded GLB. The approximate HB landmark `(-287, 10, -66)` is a reference, not a safe spawn; `zurichWorld.spawn` supplies a clear terrain location nearby. Keep all client/server/bot placements in these coordinates. Origin changes need coordinated migration.

## Ownership and lifecycle

- `loadZurichMap.ts` only fetches/parses geometry. Keep gameplay and networking out of it.
- `MapViewer.tsx` owns the renderer, camera, lights, resize observer and **one animation loop**. It passes the scene/camera to `MapGame`; game modules never create their own renderer or loop.
- `MapGame.ts` wires input, movement, network patches, avatars, vehicles, effects, HUD and follow camera. Inspection mode uses OrbitControls and leaves the room; entering play creates a fresh connection.
- Keep React StrictMode enabled. Abort pending loads and connection work, stop loops/timers, remove input listeners, leave rooms and dispose geometry/materials/textures/audio on cleanup. Mutable Three.js objects belong in module instances, not React state.
- Entity render roots are Groups with world placement at their root and model-relative transforms inside. Shared resources need explicit ownership; do not dispose geometry still used by another avatar.

## Shared gameplay contracts

Use `@race/shared` for constants, messages, capsule math, movement and world queries. The Zürich terrain/building grid and shuttle route come from `../../scripts/build-world.ts`, reading the checked-in GLB offline. `zurichWorld.height` and `blocked` are the current lightweight terrain/collision interface. Its 2 m mask is approximate; Rapier detects entity contacts and loose-object physics; rooftop navigation, detailed openings and a road network are not implemented.

Foot players and cart drivers own their movement. The server validates and stores reports and referees collisions; impulse messages change local velocity. Remote entities interpolate on the delayed server clock; never interpolate the local player. Bump effects queue on that same timeline.

Room phase, names, readiness, membership, host and results are server-owned. Waiting members have no gameplay entity. Gate movement, controls, vehicle interaction and combat on Running plus active membership; results stay frozen until the host resets to Lobby.

The server atomically grants vehicle occupancy and releases it on exit/disconnect. A client flag or rendered mesh cannot grant ownership. Shuttles are server scheduled; the first passenger starts the countdown, further passengers do not reset it, and an empty shuttle cancels it. Keep schema and shared types consistent before changing protocol behavior.

## Map and deployment

The map is authored in Blender (`assets-src/zurich/zurich.blend`, kept local, not in git; the scripts that build it are in `assets-src/zurich/blender/`, see that README). `blender/export_game.py` writes `public/maps/zurich/zurich.glb` (meshopt-compressed: one `Ground` mesh plus 200 m `City_*` tiles), `trees.glb` + `trees.json` (instanced, not collidable) and `assets-src/zurich/world-grid.json` (2 m ground/obstacle heights). The GLB carries geometry, UVs and material names only: `theme.ts` builds the pixel textures, building colours (`Style` UV = TEXCOORD_1) and lighting from `src/maps/zurich/themes/*.json` (`?theme=summer|autumn`). `npm run world:build` turns `world-grid.json` into `packages/shared/src/zurich-world.json`; regenerate and commit both after a map export. Keep official source credit/CC0 provenance. The legacy `npm run map:import` (raw city surfaces) no longer produces the game map.

Root Compose uses the root workspace build context. Caddy serves the game on 8080, forwards Colyseus matchmaking/WebSocket upgrades to `server:2567`. Root README documents the portal's WebSocket limitation; local success does not prove portal compatibility. Production client URLs derive from the page origin.

## Rendering performance budget

Measured 2026-10-10 on an M1 Pro (14-core GPU), Chrome/ANGLE-Metal, 3024×1890 (full Retina, pixel ratio 2), with the game's lights and 1024² sun shadow. Scene: themed ground (190k tris), 6,395 instanced trees, full LoD2 buildings (650k tris). Frame time = render + GPU sync.

| Buildings | Draw calls | Frame (ms) |
|---|---|---|
| none (ground + trees) | 24 | 4.0–5.3 |
| LoD2 merged into 200 m tiles | 57–90 | 3.7–5.4 |
| LoD2 as one mesh | 26 | 4.2–5.1 |
| LoD2, one object per building | 800–2,400 | 7.6–12.9 |

- Triangles are cheap, draw calls are not. Merge static geometry by material into ~200 m tiles (keeps frustum culling for camera and shadow pass); never ship one object per building or prop.
- A base M1 (7/8-core GPU) is estimated at ~2× these times (~8 ms street, ~11 ms overview) — not measured.
- Budget: ≤ ~1.5M visible triangles (shadow pass included), ≤ ~300 draw calls, textures tiny (16–32 px pixel art). Repeated props (trees, lamps, benches) must be `InstancedMesh`.
- Download size is the tighter limit. The shipped `zurich.glb` is meshopt-compressed and deliberately unquantised (~33 MB; no Git LFS, GitHub refuses files over 100 MB). If it must shrink, use ≥16-bit position quantisation (14-bit ≈ 12 cm over the map, causing cracks) and keep the UVs (gltfpack needs `-kv` on texture-less materials).
- Benchmark harness: renders each variant from street/bridge/overview cameras and logs `BENCH` lines; see `assets-src/zurich/README.md`.

For gameplay/network changes test multiple clients and competing vehicle claims. For world changes check actual geometry, spawn heights and full shuttle route clearance. For lifecycle changes test inspect/play switches and StrictMode remounts. Report only checks actually run.
