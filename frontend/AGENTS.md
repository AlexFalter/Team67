# Frontend working agreement

## Current scope

The user's latest scope is a **minimal viewer of the official Zürich 3D map
between HB and ETH Zentrum**. Work on branch `shared-arch`. Keep changes in
`frontend/`; leave the Python backend and root deployment files untouched.

Do not expand this into a game foundation without a new user request.
Colyseus, players, movement/jumping, collision physics, vehicles, ownership
systems, menus and scene managers are intentionally deferred.

## Where work belongs

- `src/scene/MapViewer.tsx`: generic rendering lifecycle, camera, lights and
  viewer controls. Keep map conversion and gameplay out of this component.
- `src/maps/zurich/`: map loader and geographic configuration. Other maps
  can be independent modules returning Three.js `Object3D`s.
- `public/maps/zurich/`: local GLB and its provenance. Preserve source/license
  information. Do not replace official geometry with approximate mock buildings.
- `scripts/import-zurich.mjs`: offline preprocessing. Do not fetch the entire
  city's dataset or add runtime GIS dependencies to the viewer.

Coordinate units are metres. LV95 maps to Three.js using the origin and
axis conversion documented in `README.md`. Keep one consistent origin for
aligned maps/assets. Update the GLB and provenance together when changing
`area.json`; reference points there are approximate.

## Resource handling

Every Three.js scene owner must release animation loops, controls, resize
observers, geometries, materials and textures on unmount. Abort in-flight
loads and dispose results that finish after cancellation. Keep React
StrictMode enabled. Do not put mutable Three.js objects into React state.

## Checks and deployment

Run `npm run build` and `npm run lint` from `frontend/`. For rendering changes,
open the viewer and verify the map is visible and says “Map loaded”. Check
orbit/pan/zoom and resize when those paths change. Report checks actually run.
No test framework is needed for this basic viewer.

The checked-in GLB must load offline from the frontend's own static host.
Keep the supplied Dockerfile, Caddy `/api` proxy and port 8080 deployment
compatible. Do not regenerate remote assets during builds or container startup.

Read `README.md` before modifying map import or coordinate conventions.
