import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Close missing quay walls (re-runnable): wherever an open bank edge sits right above an open water
edge (same xy, bank higher), add a stone quay wall between them. Bridge deck sides (over the bridge
water footprints) stay open. Later edits (forecourt, bridges, splits) can leave such gaps behind.
"""
import bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

TOL = 0.05
g = bpy.data.objects['Ground']; me = g.data
names = [m.name for m in me.materials]
wi, qi = names.index('G_Water'), names.index('G_Quay')
bm = bmesh.new(); bm.from_mesh(me)
open_e = [e for e in bm.edges if len(e.link_faces) == 1]
water_v = {v for e in open_e if e.link_faces[0].material_index == wi for v in e.verts}
wl = list(water_v)
kd = KDTree(max(1, len(wl)))
for i, v in enumerate(wl): kd.insert((v.co.x, v.co.y, 0), i)
kd.balance()
# bridge water footprints: deck sides above them must stay open
bridge = []
for n in ('Bridges_lowpoly', 'Bahnhofbruecke_lowpoly'):
    o = bpy.data.objects.get(n)
    if not o: continue
    wj = [m.name for m in o.data.materials].index('G_Water')
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    ps = [list(p.vertices) for p in o.data.polygons if p.material_index == wj]
    if ps: bridge.append(BVHTree.FromPolygons([Vector((v.x, v.y, 0)) for v in vs], ps))
def near_bridge(p):
    return any(t.find_nearest(Vector((p.x, p.y, 0)), 0.4)[0] is not None for t in bridge)
def partner(v):
    co, i, d = kd.find((v.co.x, v.co.y, 0))
    return wl[i] if d < TOL and wl[i] is not v else None
made, skipped_bridge = 0, 0
new_faces = []
for e in open_e:
    f0 = e.link_faces[0]
    if f0.material_index in (wi, qi): continue
    a, b = e.verts
    wa, wb = partner(a), partner(b)
    if not wa or not wb or wa is wb: continue
    if min(a.co.z - wa.co.z, b.co.z - wb.co.z) < 0.05: continue
    if near_bridge((a.co + b.co) / 2): skipped_bridge += 1; continue
    try: f = bm.faces.new((wa, wb, b, a))
    except ValueError: continue
    f.material_index = qi; f.normal_update()
    # face the water: away from the bank face
    out = Vector(((a.co + b.co) / 2 - f0.calc_center_median()).to_2d().to_3d())
    if f.normal.dot(out) < 0: f.normal_flip()
    new_faces.append(f); made += 1
uv = bm.loops.layers.uv.active
for f in new_faces:
    d = (f.verts[1].co - f.verts[0].co).to_2d().normalized()
    for l in f.loops: l[uv].uv = ((l.vert.co.x * d.x + l.vert.co.y * d.y) / 4, l.vert.co.z / 4)
bm.to_mesh(me); bm.free(); me.update()
print('quay walls added', made, 'bridge deck sides left open', skipped_bridge)
