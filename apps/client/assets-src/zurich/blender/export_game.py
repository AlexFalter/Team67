import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Export the game assets from zurich.blend (does not modify the scene; works on temporary copies).

- public/maps/zurich/zurich.glb : 'Ground' (walkable surface, one mesh) + everything else joined into
  TILE m tiles (buildings, landmarks, terrace, bridges, Polybahn, signs). Material names only (the
  game builds the pixel textures from the theme), UVMap = TEXCOORD_0, building 'Style' = TEXCOORD_1,
  meshopt compression, no quantisation (~33 MB; fits in git without LFS).
- public/maps/zurich/trees.glb + trees.json : instanced tree models + one row per tree
  [x, y, z, height, crownRadius, model, colorIndex, yaw, brightness] (three.js coordinates).
- assets-src/zurich/world-grid.json : 2 m ground / obstacle height grids for scripts/build-world.ts
  (same encoding as packages/shared/src/zurich-world.json). The Polyterrasse counts as ground.
"""
import bmesh, json, math, struct, base64, hashlib, time
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
size_map = export([ground] + tiles, MAP)
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

# --- world grids (three.js coords: X = x, Y = z, Z = -y)
OE, ON = AREA['originLV95'][0], AREA['originLV95'][1]
minE, minN, maxE, maxN = AREA['boundsLV95']
minX, maxX, minZ, maxZ, step = minE - OE, maxE - OE, ON - maxN, ON - minN, 2
width, depth = int(round((maxX - minX) / step)) + 1, int(round((maxZ - minZ) / step)) + 1
def bvh_of(objs):
    vs, ps = [], []
    for o in objs:
        me = o.data if o.name.endswith('_x') or o in tiles or o is ground else None
        if me is None:
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world); temp = True
        else: temp = False
        b = len(vs); vs += [v.co.copy() for v in me.vertices]; ps += [[b + i for i in p.vertices] for p in me.polygons]
        if temp: bpy.data.meshes.remove(me)
    return BVHTree.FromPolygons(vs, ps)
walk_objs = [ground] + [bpy.data.objects[n] for n in WALKABLE_EXTRA if bpy.data.objects.get(n)]
g_bvh = bvh_of(walk_objs)
obst = [o for o in export_objects() if o.name not in WALKABLE_EXTRA]
o_bvh = bvh_of(obst)
down = Vector((0, 0, -1))
ground_grid, roof_grid = [], []
for zi in range(depth):
    pz = minZ + zi * step; by = -pz
    for xi in range(width):
        px = minX + xi * step
        h = g_bvh.ray_cast(Vector((px, by, 500.0)), down)
        ground_grid.append(h[0].z if h[0] else None)
        r = o_bvh.ray_cast(Vector((px, by, 500.0)), down)
        roof_grid.append(r[0].z if r[0] else None)
def encode(vals):
    return base64.b64encode(b''.join(struct.pack('<H', 65535 if v is None else max(0, min(65534, round(v * 100)))) for v in vals)).decode()
grid = {'minX': minX, 'maxX': maxX, 'minZ': minZ, 'maxZ': maxZ, 'step': step, 'width': width, 'depth': depth,
        'ground': encode(ground_grid), 'roof': encode(roof_grid)}
grid['sourceHash'] = hashlib.sha256(open(MAP, 'rb').read()).hexdigest()
json.dump(grid, open(os.path.join(ZH_DIR, 'world-grid.json'), 'w'), separators=(',', ':'))

# --- cleanup
for o in list(tmp.objects):
    me = o.data; bpy.data.objects.remove(o)
    if me.users == 0: bpy.data.meshes.remove(me)
bpy.data.collections.remove(tmp)
print(f'zurich.glb {size_map:.1f} MB, {len(tiles)} tiles, {tris} tris; trees.glb {size_trees:.2f} MB, {len(rows)} trees; '
      f'grid {width}x{depth}; {time.time() - t0:.0f} s')
