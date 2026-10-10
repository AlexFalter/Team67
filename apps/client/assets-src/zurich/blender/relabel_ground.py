import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Assign each Ground face the land cover category under its centroid."""
exec(open(ZH_DIR + '/blender/zh_common.py').read())
src = open(ZH_DIR + '/blender/build_ground.py').read()
exec(src[src.index('CATEGORIES ='):src.index('t0 = time.time()')])  # category tables only
from mathutils.bvhtree import BVHTree

t0 = time.time()
verts, tris, tri_cat = [], [], []
for f in json.load(open(D + 'landcover.geojson'))['features']:
    mi = CATEGORIES.index(category(f['properties']['artzh']))
    rings = [[Vector((e - OE, n - ON, 0)) for e, n in r[:-1]] for r in f['geometry']['coordinates']]
    flat = [v for r in rings for v in r]
    base = len(verts); verts += flat
    for tri in geometry.tessellate_polygon(rings):
        tris.append(tuple(base + i for i in tri)); tri_cat.append(mi)
bvh = BVHTree.FromPolygons(verts, tris, all_triangles=True)

me = bpy.data.objects['Ground'].data
mat_index = {m.name: i for i, m in enumerate(me.materials)}
lookup = [mat_index['G_' + c] for c in CATEGORIES]
missing = 0
for p in me.polygons:
    c = p.center
    hit = bvh.ray_cast(Vector((c.x, c.y, 10)), Vector((0, 0, -1)))
    if hit[2] is None:
        hit = bvh.find_nearest(Vector((c.x, c.y, 0))); missing += 1
    p.material_index = lookup[tri_cat[hit[2]]]
me.update()
counts = {}
for p in me.polygons: counts[me.materials[p.material_index].name] = counts.get(me.materials[p.material_index].name, 0) + 1
print(counts, 'nearest-fallback', missing, round(time.time() - t0, 1), 's')
