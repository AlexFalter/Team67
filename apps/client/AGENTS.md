# Frontend development agreement

## Workspace

The client is `apps/client`, the Colyseus 0.18 server `apps/server`, shared code `packages/shared` (constants,
the pure movement step, height-grid world, vehicle math, rules, protocol). Use the root npm workspace and
lockfile. From the root: `npm run dev` (server + Vite), `npm test`, `npm run check`, `npm run lint`,
`npm run build`, `npm start` (one port). Read the root README for the architecture.

## Coordinate contract

The fixed source origin is LV95 / EPSG:2056 **(2683475, 1248000, 400)**, in metres:

```text
X = easting - 2683475     east is +X
Y = elevation - 400      up is +Y; entity y is feet/ground contact
Z = 1248000 - northing    north is -Z
```

`src/maps/zurich/area.json` is the map contract. Do not recenter assets or reconvert the loaded GLB. The approximate HB landmark `(-287, 10, -66)` is a reference, not a safe spawn; `zurichWorld.spawn` supplies a clear terrain location nearby. Keep all client/server/bot placements in these coordinates. Origin changes need coordinated migration.

## Ownership and lifecycle

- `src/engine/Engine.ts` owns the renderer, scene, lights, camera, resize observer and **the one animation
  loop**. Modes (`InspectMode`, `game/PlayMode`) implement `frame(dt, now)`/`dispose()`; nothing else creates a
  renderer or a loop. `mapLoader.ts` only loads, themes, merges and BVH-indexes the map.
- `App.tsx` owns the `Engine` (one per mount) and the `Net` connection (created on create/join, disposed on
  leave). `PlayMode` only adds and removes its own listeners on the room. Entering a room always makes a fresh
  connection; inspect mode has none.
- Keep React StrictMode. Abort loads, stop timers, remove listeners, leave rooms and dispose geometry,
  materials and textures on cleanup. Mutable three.js objects live in plain class instances, never in React
  state. React state changes only for rare events (phase, roster, pause), never per frame.
- Shared resources (avatar and vehicle geometry, materials) are owned once by `Avatars`/`Vehicles` and
  disposed once.

## Gameplay contracts

- `step(body, input, dt, world)` is the only movement code (client, bots, tests). Keep it pure and
  allocation-free; tune only in `packages/shared/src/constants.ts`.
- The client simulates at a fixed 60 Hz and interpolates for rendering. Mouse look is applied raw; never
  smooth camera rotation. Never interpolate or snap the local player; corrections blend out.
- Foot players and drivers own their motion and report it (`MOVE`, 30 Hz). The server validates, corrects,
  and owns phases, hits, knockdowns, seats, the shuttle schedule and scores. Seats are granted only by the
  server.
- Colyseus state stays flat: numbers for per-frame fields, strings only for rare changes. Keep
  `apps/server/src/state.ts` and the client's `StateView` (`src/net/Net.ts`) in sync.
- Remote entities render on the adaptive-delay timeline in `game/remotes.ts`; the shuttle and traffic are
  computed from the schedule at the synced server time.
- Waiting members (joined mid-round) have no entity. Controls, vehicles and punches only work for active
  players in a running round.
- Gameplay collision is the 2 m grid (`height`, `blocked`); mesh raycasts are for the camera only.

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
