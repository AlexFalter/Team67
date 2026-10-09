# Zürich HB–ETH map viewer

Minimal Vite + React + TypeScript + Three.js starter on branch `shared-arch`.
It renders the official Zürich building and terrain geometry around Zürich
Hauptbahnhof and ETH Zentrum. Orbit, pan and zoom are viewer controls only.
There are no players, physics, multiplayer, entity systems or scene managers.

## Run

```sh
cd frontend
npm ci
npm run dev
```

Open the URL Vite prints, normally http://localhost:5173. The status changes
from “Loading official Zürich 3D map…” to “Map loaded”. Drag to orbit,
right-drag to pan, and scroll to zoom. WebGL is required.

```sh
npm run build  # TypeScript check + static production build
npm run lint
npm run preview
```

## Small architecture

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Page title, viewer and source credit |
| `src/scene/MapViewer.tsx` | Camera, lights, orbit controls, renderer, resize and cleanup |
| `src/maps/zurich/loadZurichMap.ts` | Fetch/parse the map and dispose its GPU resources |
| `src/maps/zurich/area.json` | Crop bounds, origin and official source URLs |
| `public/maps/zurich/hb-eth.glb` | Checked-in, ready-to-render city geometry |
| `public/maps/zurich/provenance.json` | Import timestamp, license and geometry counts |
| `scripts/import-zurich.mjs` | One-time data import and conversion; not browser code |

Keep map-specific data out of the viewer. Another developer can prepare a
map module/asset independently, while a teammate works on the renderer.
The loader returns an ordinary Three.js `Object3D`; it has no knowledge of
React, application navigation or a future multiplayer service. The viewer
owns its render loop, controls and resize listener, and releases resources
on unmount, including React StrictMode's development remount.

This deliberately establishes only the map/rendering boundary. Add local
scene navigation and game state when the team implements those features.
Future local scene selection should remain separate from authoritative
multiplayer state. Future exclusive interactions such as vehicle occupancy
must be checked atomically by a server; rendered map objects cannot grant
ownership. Colyseus and those systems are deferred.

The original todo components and API client remain in the repository but
are not mounted by `App.tsx`. The Python backend is untouched.

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

## Hackathon VM

The existing frontend Dockerfile builds Vite and serves `dist/` with Caddy
on port 8080. Vite copies the GLB from `public/` into `dist/`, so the viewer
uses same-origin HTTP and needs no map API key, WebSocket route or additional
service. Existing `/api` routing remains as supplied in the template.

From the repository root, use the existing VM setup and root `.env`:

```sh
docker compose up -d --build
```

See the root README for the portal and Python backend setup. The viewer
works without running the Python backend during local development.
