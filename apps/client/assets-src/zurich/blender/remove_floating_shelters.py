import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Retire free-standing floating shelter roofs (tram stops etc.; the data has only the roof slab).

Unterstand objects that are thin (< 1.5 m), hover 1-5.5 m above the ground and touch no other
building (1 m) -> 'Replaced' (styled copies removed). Canopies attached to buildings stay.
"""
from mathutils import Vector
from mathutils.bvhtree import BVHTree

g = bpy.data.objects['Ground']; gb = BVHTree.FromObject(g, bpy.context.evaluated_depsgraph_get())
def gz(p):
    h = gb.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1))); return h[0].z if h[0] else None
src = list(bpy.data.collections['Buildings'].objects)
vs, ps, own = [], [], []
for bi, o in enumerate(src):
    b = len(vs); vs += [o.matrix_world @ v.co for v in o.data.vertices]
    for p in o.data.polygons: ps.append([b + i for i in p.vertices]); own.append(bi)
bvh = BVHTree.FromPolygons(vs, ps)
pk = [BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get()) for c in bpy.data.collections
      if c.name.startswith(('Zurich HB', 'ETH HG')) for o in c.all_objects if o.type == 'MESH']
rep = bpy.data.collections['Replaced']; gone = []
for bi, o in enumerate(src):
    if o.get('art_txt') != 'Unterstand': continue
    w = [o.matrix_world @ v.co for v in o.data.vertices]
    zmin, zmax = min(v.z for v in w), max(v.z for v in w); c = sum(w, Vector()) / len(w); gr = gz(c)
    if gr is None or zmax - zmin >= 1.5 or not (1.0 < zmin - gr < 5.5): continue
    if any(own[h[2]] != bi for v in w for h in bvh.find_nearest_range(v, 1.0)): continue
    if any(t.find_nearest(v, 1.0)[0] is not None for v in w for t in pk): continue
    for col in list(o.users_collection): col.objects.unlink(o)
    rep.objects.link(o); gone.append(o.name)
    s = bpy.data.objects.get(o.name + '_s')
    if s: m = s.data; bpy.data.objects.remove(s); bpy.data.meshes.remove(m)
print('floating shelter roofs removed', len(gone))
