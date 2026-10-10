import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Flatten each water body to its local water level and add stone quay walls up to the banks."""
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

me = bpy.data.objects['Ground'].data
tb = BVHTree.FromObject(bpy.data.objects['Terrain'], bpy.context.evaluated_depsgraph_get())
def h(x, y):
    r = tb.ray_cast(Vector((x, y, 1000)), Vector((0, 0, -1)))
    return r[0].z if r[0] else tb.find_nearest(Vector((x, y, 50)))[0].z

if 'G_Quay' not in [m.name for m in me.materials]:
    me.materials.append(bpy.data.materials.get('G_Quay') or bpy.data.materials.new('G_Quay'))
names = [m.name for m in me.materials]; wi = names.index('G_Water'); qi = names.index('G_Quay')
bm = bmesh.new(); bm.from_mesh(me)
is_water = lambda f: f.material_index == wi
shore = [e for e in bm.edges if len(e.link_faces) == 2 and is_water(e.link_faces[0]) != is_water(e.link_faces[1])]
bmesh.ops.split_edges(bm, edges=shore)

# Water level per connected body: local minimum within 60 m (the Limmat slopes from the lake to HB).
seen, islands = set(), []
for f in bm.faces:
    if not is_water(f) or f in seen: continue
    stack, isl = [f], []; seen.add(f)
    while stack:
        c = stack.pop(); isl.append(c)
        for e in c.edges:
            for o in e.link_faces:
                if is_water(o) and o not in seen: seen.add(o); stack.append(o)
    islands.append(isl)
for isl in islands:
    vs = list({v for f in isl for v in f.verts})
    for v in vs: v.co.z = h(v.co.x, v.co.y)
    kd = KDTree(len(vs))
    for i, v in enumerate(vs): kd.insert((v.co.x, v.co.y, 0), i)
    kd.balance()
    z0 = [v.co.z for v in vs]
    levels = [min(z0[j] for _, j, _ in kd.find_range((v.co.x, v.co.y, 0), 60)) for v in vs]
    for v, l in zip(vs, levels): v.co.z = l

# Quay walls between each water boundary edge and the bank copy of that edge.
bv = list(bm.verts); kd = KDTree(len(bv))
for i, v in enumerate(bv): kd.insert((v.co.x, v.co.y, 0), i)
kd.balance()
def bank_of(v):
    for _, i, d in kd.find_n((v.co.x, v.co.y, 0), 6):
        o = bv[i]
        if o is not v and d < 1e-3 and not any(is_water(f) for f in o.link_faces): return o
walls = 0
for e in [e for e in bm.edges if len(e.link_faces) == 1 and is_water(e.link_faces[0])]:
    a, b = e.verts; A, B = bank_of(a), bank_of(b)
    if not A or not B or max(A.co.z - a.co.z, B.co.z - b.co.z) < 0.05: continue
    try:
        f = bm.faces.new((a, b, B, A)); f.material_index = qi; walls += 1
    except ValueError: pass
bm.normal_update()
uv = bm.loops.layers.uv.active
for f in bm.faces:
    if f.material_index != qi: continue
    wf = [l for l in f.edges[0].link_faces if is_water(l)]
    if wf and f.normal.dot(wf[0].calc_center_median() - f.calc_center_median()) < 0: f.normal_flip()
    d = (f.verts[1].co - f.verts[0].co).normalized()
    for l in f.loops: l[uv].uv = ((l.vert.co.x * d.x + l.vert.co.y * d.y) / 4, l.vert.co.z / 4)
bm.to_mesh(me); bm.free(); me.update()
print('water bodies', len(islands), 'quay faces', walls)
