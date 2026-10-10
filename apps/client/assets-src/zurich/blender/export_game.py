import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Export the game assets from zurich.blend (does not modify the scene; works on temporary copies).

- public/maps/zurich/zurich.glb : 'Ground' (walkable surface, one mesh) + everything else joined into
  TILE m tiles (buildings, landmarks, terrace, bridges, Polybahn, signs). Material names only (the
  game builds the pixel textures from the theme), UVMap = TEXCOORD_0, building 'Style' = TEXCOORD_1,
  meshopt compression, no quantisation (~33 MB; fits in git without LFS), cleaned by gltfpack -noq.
- public/maps/zurich/trees.glb + trees.json : instanced tree models + one row per tree
  [x, y, z, height, crownRadius, model, colorIndex, yaw, brightness] (three.js coordinates).
- public/maps/zurich/props.glb + props.json : street prop models (build_props.py) + one row per placed
  prop [x, y, z, yaw, scale, kind] (three.js coordinates).
- assets-src/zurich/world-grid.json : 2 m walk grid for scripts/build-world.ts, from walk_grid.py
  (prints a walkability report: holes, reachable area, key places).
"""
import bmesh, json, math, struct, base64, hashlib, time, shutil, subprocess
from mathutils import Vector
from mathutils.bvhtree import BVHTree

REPO = os.path.normpath(os.path.join(ZH_DIR, '..', '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'client', 'public', 'maps', 'zurich')
AREA = json.load(open(os.path.join(REPO, 'apps', 'client', 'src', 'maps', 'zurich', 'area.json')))
TILE = 200.0
GROUND = 'Ground'
WALKABLE_EXTRA = ['Polyterrasse_lowpoly']
SOURCES = {  # collection name prefixes -> exported
    'BuildingsStyled', 'Zurich HB', 'ETH HG', 'Landmarks', 'Bridges', 'Polybahn', 'Signs',
}
t0 = time.time()
os.makedirs(PUBLIC, exist_ok=True)
scene = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()

def export_objects():
    out = []
    for c in bpy.data.collections:
        if not any(c.name.startswith(p) for p in SOURCES): continue
        for o in c.all_objects:
            if o.type == 'MESH' and o.visible_get() and o not in out: out.append(o)
    return out

tmp = bpy.data.collections.new('_export_tmp'); scene.collection.children.link(tmp)
def copy_of(o, name=None):
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    me.transform(o.matrix_world)
    for a in [a for a in me.color_attributes]: me.color_attributes.remove(a)   # theme decides colours in the game
    c = bpy.data.objects.new(name or (o.name + '_x'), me); tmp.objects.link(c)
    return c

# --- tiles
groups = {}
for o in export_objects():
    bb = [o.matrix_world @ Vector(v) for v in o.bound_box]
    cen = sum(bb, Vector()) / 8
    groups.setdefault((math.floor(cen.x / TILE), math.floor(cen.y / TILE)), []).append(o)
tiles = []
for (i, j), objs in sorted(groups.items()):
    copies = [copy_of(o) for o in objs]
    # active object with both UV layers first so 'UVMap' stays TEXCOORD_0 and 'Style' TEXCOORD_1
    copies.sort(key=lambda c: -len(c.data.uv_layers))
    for c in copies:
        if 'UVMap' not in c.data.uv_layers: c.data.uv_layers.new(name='UVMap')
        if 'Style' not in c.data.uv_layers: c.data.uv_layers.new(name='Style')
    act = copies[0]
    with bpy.context.temp_override(active_object=act, selected_editable_objects=copies, object=act):
        bpy.ops.object.join()
    act.name = act.data.name = f'City_{i}_{j}'
    tiles.append(act)
ground = copy_of(bpy.data.objects[GROUND], 'Ground_x'); ground.data.name = 'Ground'

def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_texcoords=True, export_normals=True,
                              export_vertex_color='NONE', export_materials='EXPORT', export_image_format='NONE',
                              export_animations=False, export_extras=False, export_cameras=False, export_lights=False,
                              export_meshopt_compression_enable=True)
    return os.path.getsize(path) / 1e6

MAP = os.path.join(PUBLIC, 'zurich.glb')
raw = os.path.join(bpy.app.tempdir or ZH_DIR, 'zurich.raw.glb')
export([ground] + tiles, raw)
# gltfpack, lossless (-noq: no quantisation, -kv: keep UVs): drops the ~18 % zero-area triangles left by
# triangulating polygons with in-line vertices and writes exact bounds (Blender's min/max are off by ~0.1 m).
env = dict(os.environ, PATH=os.environ.get('PATH', '') + ':/opt/homebrew/bin:/usr/local/bin')
try:
    subprocess.run(['npx', '--yes', 'gltfpack@0.22.0', '-i', raw, '-o', MAP, '-cc', '-noq', '-kv', '-km', '-kn'],
                   check=True, env=env, capture_output=True, timeout=900)
except Exception as e:
    print('WARNING: gltfpack failed, shipping the Blender GLB (loader recomputes bounds):', e); shutil.copyfile(raw, MAP)
os.remove(raw)
size_map = os.path.getsize(MAP) / 1e6
tris = 0
for o in [ground] + tiles:
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)

# --- trees
models = [bpy.data.objects['TreeModel_' + k] for k in ('Round', 'Cone', 'Tall')]
for m in models: m.name = m.name + '_src'  # free the names for the identity-transform copies
tm = []
for m in models:
    c = bpy.data.objects.new(m.name.replace('_src', ''), m.data); tmp.objects.link(c)
    tm.append(c)
size_trees = export(tm, os.path.join(PUBLIC, 'trees.glb'))
for c in tm: bpy.data.objects.remove(c)  # free the names again before restoring the sources
for m in models: m.name = m.name.replace('_src', '')
rows = []
for o in bpy.data.collections['Trees'].objects:
    x, y, z = o.location
    rows.append([round(x, 2), round(z, 2), round(-y, 2), round(o.scale.z, 2), round(o.scale.x, 2),
                 o['kind'], int(o['color']), round(o.rotation_euler.z, 3), round(float(o.get('jitter', 1.0)), 3)])
json.dump(rows, open(os.path.join(PUBLIC, 'trees.json'), 'w'), separators=(',', ':'))

# --- street props (build_props.py): models + placements, instanced in the game like the trees
size_props, prop_rows = 0, []
if bpy.data.collections.get('Props') and bpy.data.objects.get('PropModel_Lantern'):
    pmodels = [o for o in bpy.data.collections['PropModels'].objects if o.type == 'MESH']
    for m in pmodels: m.name = m.name + '_src'
    pm = []
    for m in pmodels:
        c = bpy.data.objects.new(m.name.replace('_src', ''), m.data); tmp.objects.link(c); pm.append(c)
    size_props = export(pm, os.path.join(PUBLIC, 'props.glb'))
    for c in pm: bpy.data.objects.remove(c)
    for m in pmodels: m.name = m.name.replace('_src', '')
    for o in bpy.data.collections['Props'].objects:
        if o.type != 'MESH' or not o.data.name.startswith('PropModel_'): continue
        x, y, z = o.location
        kind = o.data.name.split('.')[0].replace('PropModel_', '')
        prop_rows.append([round(x, 2), round(z, 2), round(-y, 2), round(o.rotation_euler.z, 3), round(o.scale.z, 3), kind])
    json.dump(prop_rows, open(os.path.join(PUBLIC, 'props.json'), 'w'), separators=(',', ':'))

# --- gameplay walk grid (ground / walls, 2 m) -> world-grid.json; see walk_grid.py
exec(open(os.path.join(ZH_DIR, 'blender', 'walk_grid.py')).read())  # defines width, depth, WALK_REPORT

# --- cleanup
for o in list(tmp.objects):
    me = o.data; bpy.data.objects.remove(o)
    if me.users == 0: bpy.data.meshes.remove(me)
bpy.data.collections.remove(tmp)
print(f'zurich.glb {size_map:.1f} MB, {len(tiles)} tiles, {tris} tris; trees.glb {size_trees:.2f} MB, {len(rows)} trees; '
      f'{len(prop_rows)} props; grid {width}x{depth}; {time.time() - t0:.0f} s')
