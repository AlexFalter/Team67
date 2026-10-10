import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Rebuild the ground from AV land cover polygons, draped on the official TIN.

Land cover outlines (simplified, topology-safe) + a decimated set of TIN vertices are fed to a
constrained Delaunay triangulation, so every face carries its surface category and the ground
follows the terrain without extra subdivision.
"""
exec(open(ZH_DIR + '/blender/zh_common.py').read())
from mathutils.bvhtree import BVHTree
import math

CATEGORIES = ['Road', 'Path', 'Sidewalk', 'Paved', 'Green', 'Water', 'Rail', 'Footprint']
ARTZH = {
    'Strasse, Weg': 'Road', 'Parkplatz': 'Road',
    'Veloweg, Fussweg': 'Path',
    'Trottoir': 'Sidewalk', 'Verkehrsinsel befestigt': 'Sidewalk',
    'Hausumschwung befestigt': 'Paved', 'Andere befestigte Fläche': 'Paved', 'Sportanlage befestigt': 'Paved',
    'Fliessgewässer': 'Water', 'Wasserbecken': 'Water', 'See, Weiher': 'Water',
    'Bahngebiet': 'Rail',
}
GREEN = {'Hausumschwung humusiert', 'Verkehrsinsel humusiert', 'Parkanlage', 'Friedhof', 'Acker, Wiese, Weide',
         'Andere humusierte Fläche', 'Sportanlage humusiert', 'Bestockte Fläche'}
DECIMATE = 0.3     # fraction of TIN faces kept as height samples
OUTLINE_ANGLE = 6  # degrees; straight-ish outline vertices are dissolved
NO_TIN = {'Footprint', 'Water'}

def category(artzh):
    if artzh in ARTZH: return ARTZH[artzh]
    if artzh in GREEN: return 'Green'
    if artzh.startswith('Gebäude') or artzh == 'Nebengebäude': return 'Footprint'
    raise KeyError(artzh)

t0 = time.time()
terrain = bpy.data.objects['Terrain']
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(terrain, dg)
def height(x, y):
    hit = bvh.ray_cast(Vector((x, y, 1000)), Vector((0, 0, -1)))
    if hit[0] is None: hit = bvh.find_nearest(Vector((x, y, 50)))
    return hit[0].z

# 1. Planar land cover mesh with shared boundaries.
bm = bmesh.new(); cache = {}
def vert(x, y):
    k = (round(x, 2), round(y, 2))
    v = cache.get(k)
    if v is None: v = cache[k] = bm.verts.new((k[0], k[1], 0))
    return v
for f in json.load(open(D + 'landcover.geojson'))['features']:
    mi = CATEGORIES.index(category(f['properties']['artzh']))
    rings = [[Vector((e - OE, n - ON, 0)) for e, n in r[:-1]] for r in f['geometry']['coordinates']]
    flat = [v for r in rings for v in r]
    for tri in geometry.tessellate_polygon(rings):
        a, b, c = (flat[i] for i in tri)
        if (b - a).cross(c - a).z < 0: b, c = c, b
        if (b - a).cross(c - a).length < 1e-5: continue
        vs = [vert(p.x, p.y) for p in (a, b, c)]
        if len(set(vs)) < 3: continue
        try: bm.faces.new(vs).material_index = mi
        except ValueError: pass
for co, no in (((X0, 0, 0), (-1, 0, 0)), ((X1, 0, 0), (1, 0, 0)), ((0, Y0, 0), (0, -1, 0)), ((0, Y1, 0), (0, 1, 0))):
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_outer=True, dist=1e-4)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)
bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(OUTLINE_ANGLE), verts=bm.verts[:], edges=bm.edges[:], delimit={'MATERIAL'})
bm.faces.ensure_lookup_table()
print('outline regions', len(bm.faces), 'verts', len(bm.verts), round(time.time() - t0, 1), 's')

# 2. Height samples from a decimated copy of the TIN, skipped under buildings and water.
tmp = terrain.copy(); tmp.data = terrain.data.copy(); bpy.context.scene.collection.objects.link(tmp)
mod = tmp.modifiers.new('dec', 'DECIMATE'); mod.ratio = DECIMATE
samples = [v.co.copy() for v in tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh().vertices]
me_tmp = tmp.data; bpy.data.objects.remove(tmp); bpy.data.meshes.remove(me_tmp)
flat_bvh = BVHTree.FromBMesh(bm)
outline_kd_pts = [v.co for v in bm.verts]
from mathutils.kdtree import KDTree
kd = KDTree(len(outline_kd_pts))
for i, p in enumerate(outline_kd_pts): kd.insert(p, i)
kd.balance()
extra = []
for p in samples:
    if not (X0 + 0.5 < p.x < X1 - 0.5 and Y0 + 0.5 < p.y < Y1 - 0.5): continue
    hit = flat_bvh.ray_cast(Vector((p.x, p.y, 10)), Vector((0, 0, -1)))
    if hit[2] is None or CATEGORIES[bm.faces[hit[2]].material_index] in NO_TIN: continue
    if kd.find(Vector((p.x, p.y, 0)))[2] < 0.8: continue  # avoid slivers next to outlines
    extra.append(Vector((p.x, p.y)))
print('tin samples', len(extra), 'of', len(samples))

# 3. Constrained Delaunay triangulation.
coords = [v.co.xy for v in bm.verts] + extra
faces = [[v.index for v in f.verts] for f in bm.faces]
mats = [f.material_index for f in bm.faces]
bm.free()
out_v, _, out_f, _, _, out_orig = geometry.delaunay_2d_cdt(coords, [], faces, 1, 1e-4, True)
print('cdt faces', len(out_f), 'verts', len(out_v), round(time.time() - t0, 1), 's')

# 4. Build the mesh, lift onto the TIN, world-space UVs (1 UV unit = 4 m).
bm = bmesh.new()
bvs = [bm.verts.new((p.x, p.y, height(p.x, p.y))) for p in out_v]
for f, orig in zip(out_f, out_orig):
    if not orig: continue
    try: face = bm.faces.new([bvs[i] for i in f])
    except ValueError: continue
    face.material_index = mats[orig[0]]
    if face.normal.z < 0: face.normal_flip()
uv = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    for l in f.loops: l[uv].uv = (l.vert.co.x / 4, l.vert.co.y / 4)

old = bpy.data.objects.get('Ground')
if old:
    m = old.data; bpy.data.objects.remove(old); bpy.data.meshes.remove(m)
me = bpy.data.meshes.new('Ground'); bm.to_mesh(me); bm.free()
for name in CATEGORIES:
    me.materials.append(bpy.data.materials.get('G_' + name) or bpy.data.materials.new('G_' + name))
ob = bpy.data.objects.new('Ground', me)
c = bpy.data.collections.get('Ground') or bpy.data.collections.new('Ground')
if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
c.objects.link(ob)
terrain.hide_set(True); terrain.hide_render = True
counts = {}
for p in me.polygons: counts[CATEGORIES[p.material_index]] = counts.get(CATEGORIES[p.material_index], 0) + 1
print('ground faces', len(me.polygons), counts, round(time.time() - t0, 1), 's')

# CDT orig-face ids proved unreliable for categories; relabel from the land cover, then water/quays.
exec(open(ZH_DIR + '/blender/relabel_ground.py').read())
exec(open(ZH_DIR + '/blender/water_quays.py').read())
exec(open(ZH_DIR + '/blender/ground_materials.py').read())
