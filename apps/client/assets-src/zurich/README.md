# Zürich map source (Blender)

`zurich.blend` is the editable map. Scripts in `blender/` rebuild it from the official data in
`gis/` (git-ignored; re-download with the WFS URLs below). Run them inside Blender with
`exec(open('<this dir>/blender/<script>.py').read())` after the .blend has been saved here.

Order: buildings + terrain (see zh_common bounds) → `build_ground.py` (land cover draped on the
TIN, relabel, water + quay walls, materials) → `build_trees.py` → `build_bahnhofbruecke.py` → `bridge_railing.py` → `build_bridges.py` (all other river bridges; calls `bridges_railing.py`) → `flatten_bridges.py` → `bridges_railing.py` + `bridge_railing.py` → `integrate_landmarks.py` (after appending the HB / ETH packages) → `build_buildings.py` → `hb_forecourt.py` → `build_polybahn.py` (runs `polybahn_stations.py`) → `signs.py` → `fix_normals.py` → `ground_uv.py` → `apply_theme.py` to recolour → `export_game.py` (game files + walk grid).
`bridges_railing.py` is rebuildable on its own (slab + edges + railings from the water footprint).

Buildings: `build_buildings.py` copies `Buildings` (official LoD2, hidden) to `BuildingsStyled`:
walls/roofs by face orientation, shop-front band (3.6 m), window cells fitted to whole windows
and floors, roof-tile UVs along the eaves. The `Style` UV layer stores (category, seed); the game
colours each building from `theme.buildings` at load. Geometry knobs (floor/shop height, window
spacing) are constants at the top of the script; colours and pixel patterns are in the theme.

Bridges: `build_bridges.py` finds decks draped into the water (`bridge_common.py`: overlaps an
official bridge, water on both sides, ≥ 10 m), detaches the water surface, and lifts each deck by
harmonic interpolation between its bank vertices. Railings follow the water-facing slab edges.
The walkable deck is the land cover itself (lifted out of the river), so streets
connect seamlessly; bridge objects only add slab, railings, lamps, piers. Replaced official
pieces sit in the excluded `Replaced` collection; the teammate's detailed Bahnhofbrücke is kept,
excluded, in `Bahnhofbruecke` as reference. Bridge materials: `Bridge`, `Metal` theme surfaces.

The look lives in `../../src/maps/zurich/themes/*.json`; Blender only previews it
(`THEME_NAME = 'autumn'` before exec'ing `apply_theme.py`). The game generates the same
pixel textures from that file at load time.

Bounds LV95 2682750,1246500 – 2684350,1248400; origin 2683475,1248000,400 (see area.json).

Sources (CC0 / OGD):
- Buildings: ogd.stadt-zuerich.ch/wfs/geoportal/Bauten___Kombinierte_Darstellung_heute, kombi_lod1_2_heute_3d
- Terrain: ogd.stadt-zuerich.ch/wfs/geoportal/Digitales_Terrainmodell__TIN_, lod0_gelaende
- Land cover: maps.zh.ch/wfs/OGDZHWFS, ms:ogd-0401_arv_basis_avzh_bodenbedeckung_f
- Trees: maps.zh.ch/wfs/OGDZHWFS, ms:ogd-0608_giszhpub_gis_einzelbaeume_2022_f

## Performance

Budget and measurements live in `apps/client/AGENTS.md` → "Rendering performance budget".
Short version: full LoD2 detail is affordable at 60 fps on an M1 if static geometry is merged
into ~200 m tiles per material (< ~300 draw calls, < ~1.5M visible triangles); per-object
buildings/props are what hurts. Compress GLBs with Draco (16-bit positions).

`bench/index.html` re-runs the benchmark: put exported GLBs in `bench/assets/`
(`ground.glb`, `trees.glb`, `trees.json`, one GLB per building variant), symlink
`node_modules/three` to `bench/three`, serve the folder and open
`index.html?w=3024&h=1890&variants=lod2_raw,...`. Results are logged as `BENCH {...}` lines.
Headless: `Google Chrome --headless=new --use-angle=metal --enable-logging=stderr ...`.

## Walls (window layout)

`build_buildings.py` groups coplanar connected wall faces into facades. Per facade it keeps
`FACADE_MARGIN` plain at both ends, splits the rest into whole window columns (~`CELL` m), and
per column fills only whole floors that fit under the outline above it (`ROOF_PAD` below roof
and gable edges). The shop band only appears where a column reaches the street. Everything
else is plain plaster (`G_Plain`, same colour and pixel scale). Cuts are re-merged by material,
and each facade's UV grid is stored in a face layer. Street level = lowest ground around the
building (the LoD2 solids reach ~3 m below it).

## Polybahn

`build_polybahn.py`: track from the Central building over the Seilergraben truss bridge (replaces
official `B_37668`), tangent arc into the slope corridor, passing loop in the middle; red
POLYBAHN entrance on `B_140004`; half-timbered top station `B_302040285` (via
`TIMBER_BUILDINGS`) with SEILBAHN board and steps. No cars: the cable-car entity can follow the
centre lines stored on `Polybahn_track` (`path_a`, `path_b`, Blender coords, rail-top height).
Signs are theme `text` surfaces (`PolySign`, `StationSign`).

## Bridges are flat

`flatten_bridges.py` puts every deck on one plane fitted through its bank vertices (pieces of the
same bridge merged; anchors at water level or far off the median ignored; slopes > 8 % fall back
to a slope along the main axis). Re-run `bridges_railing.py` / `bridge_railing.py` afterwards.

## Landmark packages (HB, ETH HG + Polyterrasse)

Append the package collections from `Zurich-HB.blend` and `ETH-HG-and-Polyterrasse.blend`
(vertices already in map coordinates), then `integrate_landmarks.py`: overlapped official
buildings -> `Replaced`, package materials -> theme surfaces (`Sandstone`, `Glass`, `DomeCopper`, ...),
world UVs, ground under the Polyterrasse removed (ETH Link passage open). Their triangle masks
(`*-replacement.json`) target the old original GLB and are not used.

## Polybahn stations

`polybahn_stations.py` cuts a door opening, the hall and the track opening into the station
buildings and builds `Polybahn_halls` (walls, ceiling, lobby, 17 cm steps beside the track, track
bed). Bottom: door on the Central facade 1.5 m north of the track line. Top: door on the terrace side.

## Gameplay clean-ups and extras

- `hb_forecourt.py`: the area between the HB facade and the riverside pavement is one flat plane
  (fitted through its edges) with road texture; tram rails on the streets around the HB -> road;
  small structures standing on it -> `Replaced`.
- Roof thickness: `build_buildings.py` hangs a `ROOF_THICK` (0.35 m) fascia band under every
  pitched/spire roof edge (~+160k triangles).
- Facades: wall planes are grouped by orientation and depth with 0.45 m tolerance (pilaster relief
  stays one facade) and touching strips are merged; `FORCE_WINDOWS` skips the neighbour test.
- Polybahn: wide truss bridge (6 m deck, sides 2.2 m, nothing overhead), big Central hall/portal,
  own half-timbered top station (`Polybahn_topstation`), corridor ground kept below the track bed.
- `signs.py`: big boards from theme `text` surfaces (`CoopSign` on the Coop at the Bahnhofbrücke).

## Manual edits in Blender (safe from rebuilds)

- To delete something by hand: move it into the **`Manual Removed`** collection (works for source
  buildings, styled `_s` copies, `Tree_*`, ...). Build scripts never recreate it. `guard.py` excludes
  the collection from the view layer (so it is hidden in the viewport); the export never includes it.
- To hand-edit a generated object: add the custom property **`keep`** (any value) to it. Build
  scripts skip it.
- `blender/guard.py`: `snapshot()` stores a fingerprint of all objects after a scripted build;
  `changes()` lists objects added/removed/modified since. Run it before any rebuild.

## Polyterrasse and ground holes

- `polyterrasse.py`: the package's terrace + ETH Link underpass is replaced by one solid terrace
  at 50.7 m (union of the package's terrace surfaces): concrete-tile top, stone walls into the
  ground, bridge-style fence on edges with a drop (not along the HG), stairs towards the Polybahn
  top station. The package itself sits excluded in `Replaced`.
- `ground_holes.py`: welds cracks, fixes T-junctions, classifies open-edge loops (map border,
  water seams, bridge decks, station interiors, real holes) and with `FIX=True` fills real holes
  (triangle fill, fan fill as fallback). `FILL_COVERED=True` also refills hall interiors; re-clear
  them afterwards (`polybahn_stations.clear_footprint_ground`). Run it after any ground edit.
- `patch_ground.py`: `patch_rect(...)` replaces a rectangle of ground by a clean welded grid patch.
- Track corridor: ground is capped at the bed with a 60 % falloff (no cliffs next to the track);
  the gravel bed has 1.5 m skirts.
- `remove_floating_shelters.py`: free-standing shelter roofs that hover without posts (tram stops
  at Central, Haldenegg, ETH/Universitätsspital, Bahnhofquai, … — 94 in total) -> `Replaced`.
  Canopies attached to buildings stay.

## Game export and walkability

- `export_game.py`: writes `zurich.glb`, `trees.glb/json` and runs `walk_grid.py`. Then run
  `npm run world:build` and commit the GLB, trees, `world-grid.json` and `zurich-world.json` together.
- `walk_grid.py`: the game walks on a 2 m height grid, not on the mesh. Walkable = Ground (no water),
  bridge decks, Polyterrasse, station floors, LoD2 `Bruecke_Passerelle` decks (Quaibrücke). Walls =
  water, buildings (LoD2: only inside the solid; doorways/arcades/platform canopies stay open),
  low headroom, railings/thin walls, and cliffs (> 1 m height jump between cells; the ground is
  interpolated, so quay and terrace walls would otherwise be walkable). Prints a report (holes,
  reachable share from spawn, key places such as both Polybahn halls); `WALK_PNG = '<path>.png'`
  before exec'ing writes a colour debug map. Check it after every geometry change.
- Detail patches: both Polybahn stations get 0.5 m grids (same rules, `patches` in the JSON); the 2 m
  grid cannot follow their thin rotated walls and doors. `tests/polybahn-stations.test.ts` walks in.
- The bottom portal is one 5.6 m doorway: the old centre pillar split it into two gaps too narrow to
  walk through with the 1 m player capsule.
- `ground_uv.py`: steep ground (> ~41°) is box-projected from the side at the same 4 m tile, so
  slopes keep the flat-ground pixel size. Run after any Ground rebuild.
- Theme textures in the game use `flipY = false` (glTF UVs) and the `Style` seed is read back as
  `1 - v` (glTF flips V). Both matter: otherwise signs are upside down and buildings white.
