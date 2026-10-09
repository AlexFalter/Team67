# Frontend development agreement

## Starting point and scope

This branch, `shared-arch`, currently contains a minimal React + Vite +
TypeScript + Three.js viewer of the official Zürich 3D map between HB and ETH
Zentrum. It provides a shared visual world for the team to build against.

**Multiplayer, entities, physics, collision and game mechanics are not
implemented.** Do not assume a working Colyseus connection or vehicle system.
Teammates can develop those features independently when assigned that work;
keep the base map viewer small and keep new systems in their own modules.

Keep edits in `frontend/` unless the task explicitly authorizes changes
elsewhere. Leave the existing Python backend and root deployment files alone.
Read `README.md` for setup, sources and the map import process.

## Run the shared development world

From `frontend/`:

```sh
npm ci
npm run dev
```

Open the Vite URL, normally http://localhost:5173. Confirm that buildings and
terrain are visible and the status says “Map loaded”. The Python backend is
not needed for the viewer. Orbit, pan and zoom are inspection controls.

## Coordinate contract: all maps and entities must agree

The official source uses Swiss LV95 / EPSG:2056, in metres. The shipped asset
has already been converted into local Three.js coordinates:

```text
Fixed source origin: (E=2683475, N=1248000, elevation=400)
X = easting - 2683475       east is +X
Y = elevation - 400        up is +Y
Z = 1248000 - northing     north is -Z
```

`src/maps/zurich/area.json` is the source of truth. One Three.js unit is one
metre. Position entities in these local coordinates; do not apply the LV95
conversion again to the loaded GLB. Keep vehicle models at a sensible metric
scale and put their local origin at a documented anchor, such as ground
contact. Convert model orientation inside the entity module.

For example, the approximate HB reference point `(2683188, 1248066, 410)`
becomes `(-287, 10, -66)`. Reference points are not guaranteed spawn points:
the actual ground elevation varies across the map.

Preserve the fixed origin and axis mapping when editing buildings, terrain,
materials or the crop. Existing entity placements then remain aligned across
teammates, clients and replacement versions of the same geographic world.
Other geographic assets must explicitly use this conversion; alignment is
not automatic. A different geographic world needs deliberate spawn locations.
Coordinate-contract changes require team coordination and migration of saved
placements. Do not recenter each building or map independently.

## Parallel work and ownership of files

Start feature branches from the agreed `shared-arch` commit. Suggested module
locations below are conventions for new work, not systems already supplied:

| Workstream | Where to work | Boundary |
| --- | --- | --- |
| World/buildings | `src/maps/zurich/`, `scripts/import-zurich.mjs`, `public/maps/zurich/` | Supply renderable geometry in the agreed coordinates |
| Cars | `src/entities/car/` | Own model, rendering and feature-specific behavior |
| Scooters | `src/entities/scooter/` | Own model, rendering and feature-specific behavior |
| Multiplayer | `src/multiplayer/` | Own transport, room connection and state adaptation |
| Local scenes/UI | Separate modules under `src/scene/` | Own local presentation and navigation |

Choose one integration owner for shared wiring in `src/App.tsx` and
`src/scene/MapViewer.tsx`. Coordinate changes to these files rather than having
every feature developer rewrite the viewer. Entity and networking work should
not require edits to the map importer or the GLB. World geometry work should
not require edits to entity or networking modules.

## Map development

- `src/maps/zurich/loadZurichMap.ts` fetches/parses the asset and returns an
  ordinary Three.js `Object3D`. Keep it independent of React navigation,
  networking, entity state and gameplay rules.
- `src/scene/MapViewer.tsx` owns the renderer, camera, lights, inspection
  controls, resize observer and render loop. Keep map conversion out of it.
- The current GLB has two combined meshes: buildings and terrain. It does
  **not** expose one independently addressable mesh per building. To work on
  individual buildings, extend the importer to preserve separate meshes
  and stable source building IDs, while keeping their geographic placement.
- Change `area.json` and run `npm run map:import` to regenerate the extract.
  Commit the GLB and provenance together with configuration/importer changes.
  Keep source attribution and CC0 information. Use official geometry.

## Entity development

Keep each entity module independent of specific map internals and other
entity implementations. Use a Three.js `Group` or `Object3D` as its render
root, so integration can attach it alongside the world in the same scene.
Provide explicit update and cleanup functions. This is a recommended module
boundary; no entity interface or registry has been implemented yet.

Keep model-relative coordinates inside the entity. Apply world placement to
its root. Avoid new renderers, global input handlers or a separate animation
loop per entity; integrate updates into the scene's existing loop. Release
entity-owned resources on removal, and define ownership when sharing assets.

The current world is visual geometry only. It does not provide a collision
API, road network, drivable ground queries or vehicle physics. Implement and
agree on those interfaces separately rather than treating the visual mesh
or approximate landmarks as a physics contract.

## Multiplayer development

Colyseus can be developed in parallel against the coordinate contract. It is
currently absent from the project: adding it requires a service, connection
lifecycle and integration with entity state. Do not claim multiplayer works
until an actual multi-client test passes.

Keep networking outside the map loader and renderer. Adapt received state
into entity IDs, transforms and feature data that rendering modules consume.
Use the same local metric coordinates on the server and every client.
Scene selection such as menu/loading/gameplay/ending is local UI state and
must remain separate from authoritative shared game state.

For vehicles, clients send interaction/input requests. The authoritative
server must atomically check and grant occupancy, reject competing claims,
and release it on exit/disconnect/removal. Neither a visual object nor a
client-side occupied flag can establish exclusive ownership. Coordinate the
message/state contract with entity developers before connecting behavior.

Preserve the base static viewer when adding multiplayer. Check the root
README's portal/WebSocket constraints before choosing deployment routing.
A local connection test alone does not prove compatibility with the VM portal.

## How the map loads and deploys

The checked-in `public/maps/zurich/hb-eth.glb` is approximately 12.3 MiB.
Each browser loads it over HTTP from the same host as the frontend: Vite in
development, Caddy on the VM. Nobody needs to select or install a local map.
The browser parses the map when the page starts; its cache may avoid another
download. Do not promise a specific cache policy without configuring it.

Normal page loads do not contact the city's GIS service. Only the explicit
`npm run map:import` preprocessing command downloads official source data.
Vite copies the asset into `dist/` during the build. Do not regenerate remote
assets during builds or container startup. Keep the existing Dockerfile,
Caddy `/api` routing and port 8080 deployment compatible.

## Resource handling and checks

Scene owners must release animation loops, controls, resize observers,
geometries, materials and textures on unmount. Abort in-flight loads and
dispose results that finish after cancellation. Keep React StrictMode enabled.
Do not put mutable Three.js objects into React state.

Run `npm run build` and `npm run lint` from `frontend/`. For map/rendering
changes, open the viewer and confirm the geometry loads; check controls and
resize when those paths change. New gameplay/network features need checks
appropriate to their behavior, including multiple clients for shared state
and competing ownership requests. Report only checks actually run.
