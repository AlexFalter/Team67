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

The server atomically grants vehicle occupancy and releases it on exit/disconnect. A client flag or rendered mesh cannot grant ownership. Shuttles are server scheduled; the first passenger starts the countdown, further passengers do not reset it, and an empty shuttle cancels it. Keep schema and shared types consistent before changing protocol behavior.

## Map and deployment

The GLB has combined Buildings and Terrain meshes, not individual building objects. Keep official source credit/CC0 provenance. Explicit `npm run map:import` from `apps/client` can download and regenerate the map; normal loads and builds must not fetch remote GIS data. After a map change regenerate and commit `../../packages/shared/src/zurich-world.json` as well.

Root Compose uses the root workspace build context. Caddy serves the game on 8080, forwards Colyseus matchmaking/WebSocket upgrades to `server:2567`. Root README documents the portal's WebSocket limitation; local success does not prove portal compatibility. Production client URLs derive from the page origin.

For gameplay/network changes test multiple clients and competing vehicle claims. For world changes check actual geometry, spawn heights and full shuttle route clearance. For lifecycle changes test inspect/play switches and StrictMode remounts. Report only checks actually run.
