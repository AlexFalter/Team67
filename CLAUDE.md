# CLAUDE.md — branch `tom_ryo` (minimal, fast Zürich multiplayer)

You are building a **fresh, minimal Vite + React + three.js app with a lean Colyseus multiplayer mode** on the branch `tom_ryo`, in parallel with other agents. Never push to `main`; push only `tom_ryo` and open PRs against `main` when asked. Commit only when asked.

Goal: everything `main` can do, rebuilt clean, small and fast, with movement that feels as smooth and responsive as Krunker.io. Prefer fewer dependencies, fewer abstractions and fewer allocations. Read how `main` does something to learn the requirement, then write your own simpler version. Do not copy files from `main` (the map assets below are the exception).

## Stack (target)

- `apps/client`: Vite + React 19 + three r186 (`three`, `three-mesh-bvh` only if you need camera/aim raycasts). React only for the menu and HUD; the game runs in a single `requestAnimationFrame` loop owned by one module (no React state for per-frame data).
- `apps/server`: Node ≥ 22, **Colyseus 0.18** (`colyseus`, `@colyseus/schema`; client `@colyseus/sdk`), the same major versions as `main`. In production one process serves the built client and Colyseus on one port.
- `packages/shared`: TypeScript used by both sides: constants, the pure movement step, message types, world queries. Run TS directly with `tsx` (no build step for shared).
- Root npm workspaces with one lockfile; tests use `tsx --test tests/*.test.ts`.

## Map assets — what exists and how to render them

The Zürich map is authored in Blender. On the PR branch `map/zurich-v2`, merged into `main` once accepted, the source is `apps/client/assets-src/zurich/zurich.blend`. It is **local only and never committed** (no Git LFS). Ask Tom if you need it. Use these exported files:

| File | What it is |
|---|---|
| `apps/client/public/maps/zurich/zurich.glb` | ~33 MB, **EXT_meshopt_compression**, no quantisation (full float precision). Node `Ground` (walkable terrain/streets/water/quays, one mesh) plus `City_i_j` nodes (200 m tiles: buildings, HB, ETH, bridges, Polybahn, signs). Material names only (`G_*`), no textures, no vertex colours. `TEXCOORD_0` = UVs; `TEXCOORD_1` (`Style`) = building category and seed. |
| `apps/client/public/maps/zurich/trees.glb` + `trees.json` | 3 tree models (`TreeModel_Round/Cone/Tall`) plus 6,393 rows `[x, y, z, height, crownRadius, kind, colorIndex, yaw, brightness]` in three.js coordinates. Render as `InstancedMesh`; trees are not collidable. |
| `apps/client/src/maps/zurich/theme.ts` + `themes/{autumn,summer}.json` | Builds pixel-art `CanvasTexture`s (NearestFilter) per `G_*` material, building colours from `TEXCOORD_1`, sky and lighting. `?theme=summer` switches theme. |
| `apps/client/src/maps/zurich/loadZurichMap.ts`, `loadTrees.ts`, `area.json` | Loader, tree instancing, map contract (bounds, origin, landmarks, asset paths). |
| `apps/client/assets-src/zurich/world-grid.json` | 2 m height grids exported from Blender: `ground` (walkable, Polyterrasse included) and `roof` (obstacle top). Each is base64 uint16 little-endian in centimetres, `65535` = none, with `minX/maxX/minZ/maxZ/step/width/depth` (801×951). |
| `packages/shared/src/zurich-world.json` | Generated from `world-grid.json` by `scripts/build-world.ts` (`npm run world:build`). Adds spawn, cart spots and shuttle route. |

**Get them onto your branch** (copy, don't regenerate):

```sh
git fetch origin
git checkout origin/map/zurich-v2 -- apps/client/public/maps/zurich apps/client/src/maps/zurich \
  apps/client/assets-src/zurich/world-grid.json scripts/build-world.ts packages/shared/src/zurich-world.json
```

Use `origin/main` instead once the PR is merged. Keep the paths, or update `area.json` and `build-world.ts` to match.

**Minimal render** (this is all a local three.js viewer needs):

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { activeTheme, applyTheme } from './maps/zurich/theme';
import { loadTrees } from './maps/zurich/loadTrees';

const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/maps/zurich/zurich.glb');
const theme = activeTheme();
applyTheme(gltf.scene, theme);                       // textures, building tints, materials
gltf.scene.add(await loadTrees(abortSignal, theme)); // instanced trees
scene.add(gltf.scene);
// sky colour + sun/hemisphere light come from theme.lighting (see main's MapViewer.tsx)
```

Without `MeshoptDecoder` the GLB will not load. The decoder works in the browser and in Node (tests) with no extra files.

**Re-exporting from Blender** (only Tom has the `.blend`). Blender 5.2 with the Blender MCP add-on. In Blender's Python console or via MCP:

```py
import bpy, os; ZH_DIR = os.path.dirname(bpy.data.filepath)
exec(open(ZH_DIR + '/blender/guard.py').read()); print(changes())   # see manual edits first
exec(open(ZH_DIR + '/blender/export_game.py').read())               # ~3 min
```

`export_game.py` writes all of the files above (Blender's own meshopt export, no quantisation, by Tom's choice). Do not post-process the GLB. In particular, gltfpack without `-kv` silently drops the UVs on texture-less materials. Then run `npm run world:build` and commit `zurich.glb`, `trees.*`, `world-grid.json` and `zurich-world.json` together. Read `apps/client/assets-src/zurich/README.md` before touching anything Blender-side. Manual Blender edits are protected by the `Manual Removed` collection and the `keep` custom property.

## Coordinate contract (do not change)

LV95 origin **(2683475, 1248000, 400)**. three.js: `X = E − 2683475` (east +X), `Y = h − 400` (up), `Z = 1248000 − N` (north is −Z). Blender uses Z-up: Blender `(x, y, z)` = three `(x, z, −y)`. Map bounds: X −725…875, Z −400…1500. HB is about `(-287, 10, -66)`. Spawn comes from `zurich-world.json` (`spawn` ≈ `(-273, 7.8, -106)`). Units are metres.

## Performance budget (measured on an M1 Pro; plan for a base M1 at about 2×)

- Draw calls matter far more than triangles. Keep it to **≤ 300 draw calls** and **≤ ~1.5M visible triangles** (shadow pass included). The map is already merged into tiles; do not split it per building. Repeated props (players, carts, lamps) must be `InstancedMesh` or share geometry and materials.
- One 1024² sun shadow map. Pixel ratio `min(devicePixelRatio, 2)`. Textures are tiny (16–32 px, NearestFilter).
- Download size is the real limit. The map is ~33 MB because it is deliberately unquantised; GitHub warns at 50 MB and refuses at 100 MB per file, and there is no LFS. Never commit a GLB without meshopt compression. Show a loading progress bar.
- Raycasting a 1M-triangle scene by brute force is slow (seconds). Use `three-mesh-bvh` (`computeBoundsTree`, `firstHitOnly`) for camera collision and aim, and only on map meshes. Skip `InstancedMesh` (trees). On `main`, see `apps/client/src/multiplayer/mapRaycast.ts`.
- Gameplay collision does **not** raycast meshes. It samples the 2 m height grid (`height(x,z)`: bilinear ground; `blocked(x,y,z,r,h)`: the roof grid above feet + step height). This is fast enough for the server tick.

## Feature parity with `main` (the requirement list)

Read `main`'s README.md, `apps/client/AGENTS.md` and the tests to confirm each feature's details; reimplement them, don't port them.

- Menu: name (1–24 chars), character choice (3 characters), create/join a room by code (≤ 40 players). Inspect-map mode with no connection.
- Room phases Lobby → Running → Finished. Everyone must press Ready (it can be cancelled). Rounds last 3 min and the host can end one early. Results are shared and sorted by hits, include players who left, and stay frozen until the host returns everyone to the Lobby. Late joiners wait with no entity. The host role transfers when the host leaves.
- Controls: pointer lock, mouse look, WASD, Shift sprint, Space jump, E enter/exit vehicle, F or click to punch, R running shoes (speed/jump boost), V/F5 to cycle first-person/rear/front view, Esc menu (bob, sensitivity, leave).
- Combat: a punch hit cone (facing, range, height, cooldown) knocks down for 5 s. Houses occlude hits. Player contact only separates players.
- Vehicles: exclusive single-seat carts whose driver can run over foot players. Bikes fall and eject their rider on impact. A heavy tram/shuttle keeps moving: six seats, a 10 s countdown started by the first passenger, a terrain route HB → ETH and back, auto-disembark on arrival, an empty shuttle cancels its countdown. The server grants occupancy atomically.
- Avatars: low-poly rigs with locomotion, punch, fall and recovery animations. In first person the head is hidden and the hands are visible. The third-person camera avoids walls (BVH raycast against the map).
- Bots: `npm run bots -- 30` headless players for load testing.
- Ops: `npm run dev` (server + Vite), `npm run build`, `npm start` (one port), Docker Compose with Caddy, and a page-origin-derived WebSocket URL in production.

## Multiplayer and feel — design rules

Feel is the top priority. Krunker-style means instant input, crisp acceleration, air strafing, no rubber-banding, and no camera lag.

**Client simulation**
- Run a fixed-timestep simulation at 60 Hz (accumulator), and render with interpolation between the previous and current sim state (`alpha = acc / dt`). This alone removes most jitter. Never step physics with variable `dt`.
- Mouse look is applied every render frame straight from raw `movementX/Y`: no smoothing, no lerp, and `requestPointerLock({ unadjustedMovement: true })` where supported. The camera sits exactly on the interpolated body at eye height. Third-person boom distance may ease; rotation never does.
- Movement is Quake/Krunker-style. Ground: high acceleration toward the wish direction, then friction. Air: accelerate only along the wish direction up to a cap, so air strafing works. Add jump buffering, coyote time and bunny-hop friendly landing (skip friction on the landing frame when jump is held). Start from `main`'s constants (walk 7.5, sprint 11, jump 8, gravity −25, accel 12, friction 22, air accel 4, coyote 90 ms, buffer 120 ms, capsule r 0.5/h 1.8) and tune by feel. Keep tuning values in one shared constants file.
- The movement step is one pure function `step(state, input, dt, world)` in `packages/shared`, used by client and server. No allocations inside it.

**Authority and networking**
- The client owns its own movement, as on `main`. It sends its input/pose at 30 Hz as a compact message (numbers array or `sendBytes`). The server re-runs validation: max speed × dt + slack, ground and `blocked` checks via `zurichWorld`, and teleport rejection.
- Never snap the local player. Server corrections, which should be rare, are blended out over ~150 ms by offsetting the render position. Do not rewind the camera.
- The server owns everything shared: phases, hits, knockdowns, vehicle occupancy, shuttle schedule and score. Server-to-client events are Colyseus messages.
- **Colyseus state stays flat and small:** one `MapSchema<Player>`, numeric fields only for position/yaw (`float32`, or `int16` cm/angle where it fits), plus a small `Vehicle` map and a room-phase object. No nested per-frame objects and no strings that change per frame. `setPatchRate(1000/30)`. The server tick runs at 60 Hz for combat and collision.
- Remote entities are rendered ~100 ms behind an estimated server clock. The clock comes from ping/pong using the minimum-RTT sample, smoothed. Use Hermite interpolation with velocity on a small per-entity ring buffer. When packets are late, extrapolate for at most 100 ms and then hold. Use the shortest arc for yaw. Never interpolate the local player.

**Performance**
- `renderer.setAnimationLoop` is the single loop. No React re-renders while playing: the HUD writes to DOM refs at ≤ 10 Hz.
- No per-frame allocations: reuse `Vector3`/`Quaternion`/arrays. Share avatar geometry and materials across players. Instance repeated props.
- Gameplay collision uses the 2 m height grid (`height`, `blocked`). Mesh raycasts only for the camera and hit occlusion, BVH-accelerated.
- Add a debug overlay (toggle key): FPS/frame ms, RTT, clock offset, jitter, interpolation buffer depth, corrections per second. Add a `?lag=150&jitter=30&loss=2` client-side network simulator, so smoothness is tested under bad conditions.

Ship order: (1) map viewer with loading progress, (2) local controller plus camera feel on the height grid (get this right before any networking), (3) Colyseus join with two tabs seeing each other smoothly, (4) clock sync, interpolation and the lag simulator, (5) server validation and combat, (6) vehicles and shuttle, (7) lobby/round/results, bots. Test every step with 2–3 tabs at `?lag=150&jitter=30`.

## Lifecycle rules (from `main`, keep them)

- One renderer and one animation loop. Abort pending loads on unmount. Dispose geometry, materials and textures. Close the socket and remove listeners on cleanup. Keep React StrictMode on, so double-mount must be safe.
- Put mutable three.js objects in plain module instances, never in React state.
- Shared resources (avatar geometry) are owned once. Do not dispose them per player.
- Abort/leave cleanly on inspect ↔ play switches; entering play creates a fresh Colyseus connection.

## Checks before you report done

`npm run check` (tsc), `npm run lint`, `npm test`, `npm run build`. Also do a manual 2-tab test in the browser, at `?lag=150&jitter=30`. Write tests for the shared movement step (determinism, air strafe cap, coyote/buffer), interpolation and a live two-client room. Report only checks you actually ran. Do not commit `package-lock.json` churn unrelated to dependency changes, `.blend` files, or the `gis/` data.
