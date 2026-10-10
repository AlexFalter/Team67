import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Find and fix holes / cracks in the Ground mesh (re-runnable).

1. weld cracks: open-edge vertices (not water/quay) closer than WELD m in xy are merged
   (later edits sometimes moved one side of a seam vertically)
2. classify the remaining open-edge loops: map border, water seam (deliberately split from the
   banks), covered (under objects in COVER_COLLECTIONS, e.g. the Polybahn halls), real hole
3. FIX=True: fill real holes up to MAX_SIDES edges
Prints a report; HOLES holds the real holes as (centre, edge count, size).
"""
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

WELD = 0.06
MAX_SIDES = 400
FIX = globals().get('FIX', False)
FILL_COVERED = globals().get('FILL_COVERED', False)  # also refill loops under the halls (re-clear them after)
COVER_OBJECTS = ('Polybahn_halls', 'Polybahn_topstation', 'Polybahn_stations')  # station structures only
B = (-725.0, -1500.0, 875.0, 400.0)  # map bounds (Blender x/y)

g = bpy.data.objects['Ground']; me = g.data
names = [m.name for m in me.materials]
wi, qi = names.index('G_Water'), names.index('G_Quay')
bm = bmesh.new(); bm.from_mesh(me)

def open_verts():
    return [v for v in bm.verts if any(len(e.link_faces) == 1 for e in v.link_edges)
            and not any(f.material_index in (wi, qi) for f in v.link_faces)]
# 1. weld cracks
ov = open_verts()
kd = KDTree(len(ov))
for i, v in enumerate(ov): kd.insert((v.co.x, v.co.y, 0), i)
kd.balance()
targetmap, seen = {}, set()
for i, v in enumerate(ov):
    if v in seen: continue
    for co, j, d in kd.find_range((v.co.x, v.co.y, 0), WELD):
        o = ov[j]
        if o is v or o in seen or o in targetmap: continue
        if any(e.other_vert(o) is v for e in o.link_edges): continue
        targetmap[o] = v; seen.add(o)
    seen.add(v)
bmesh.ops.weld_verts(bm, targetmap=targetmap)
welded = len(targetmap)
# T-junctions: an open edge with other open vertices lying on it -> split it there and weld
ov = open_verts()
kd2 = KDTree(len(ov))
for i, v in enumerate(ov): kd2.insert((v.co.x, v.co.y, 0), i)
kd2.balance()
tjunctions = 0
for e in [e for e in bm.edges if len(e.link_faces) == 1]:
    if not e.is_valid: continue
    a, b = e.verts; ab = (b.co - a.co).to_2d(); L = ab.length
    if L < 0.2: continue
    mid = (a.co + b.co) / 2
    on = []
    for co, i, d in kd2.find_range((mid.x, mid.y, 0), L / 2 + 0.01):
        v = ov[i]
        if v in (a, b) or not v.is_valid: continue
        t = (v.co - a.co).to_2d().dot(ab) / (L * L)
        if 0.01 < t < 0.99 and abs(ab.cross((v.co - a.co).to_2d())) / L < 0.03: on.append((t, v))
    if not on: continue
    on.sort(key=lambda x: x[0])
    cur, start, prev_t = e, a, 0.0
    for t, v in on:
        frac = (t - prev_t) / (1 - prev_t)
        ne, nv = bmesh.utils.edge_split(cur, start, frac)
        bmesh.ops.weld_verts(bm, targetmap={nv: v})
        tjunctions += 1
        # continue on the remaining part of the original edge (from v towards b)
        rest = [x for x in v.link_edges if b in x.verts and len(x.link_faces) == 1]
        if not rest: break
        cur, start, prev_t = rest[0], v, t

# 2. classify open-edge loops
cover = [BVHTree.FromObject(bpy.data.objects[n], bpy.context.evaluated_depsgraph_get()) for n in COVER_OBJECTS if bpy.data.objects.get(n)]
def is_covered_pt(p):
    return any(t.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))[0] is not None for t in cover)
def is_covered(comp):  # every open edge must lie under a station structure (inset slightly towards the inside)
    return all(is_covered_pt((e.verts[0].co + e.verts[1].co) / 2) for e in comp)
# bridge deck borders over the water are open by design (slab edge, railing and water below cover them)
bridge_pts = []
for n in ('Bridges_lowpoly', 'Bahnhofbruecke_lowpoly', 'Polybahn_bridge'):
    o = bpy.data.objects.get(n)
    if o: bridge_pts += [o.matrix_world @ v.co for v in o.data.vertices]
kdb = KDTree(max(1, len(bridge_pts)))
for i, p in enumerate(bridge_pts): kdb.insert((p.x, p.y, 0), i)
kdb.balance()
def along_bridge(comp):
    near = sum(1 for e in comp if bridge_pts and kdb.find((((e.verts[0].co + e.verts[1].co) / 2).x, ((e.verts[0].co + e.verts[1].co) / 2).y, 0))[2] < 1.5)
    return near > len(comp) * 0.5
on_border = lambda p: min(abs(p.x - B[0]), abs(p.x - B[2]), abs(p.y - B[1]), abs(p.y - B[3])) < 0.05
open_edges = [e for e in bm.edges if len(e.link_faces) == 1]
seen, loops = set(), []
for e0 in open_edges:
    if e0 in seen: continue
    comp, stack = [], [e0]; seen.add(e0)
    while stack:
        e = stack.pop(); comp.append(e)
        for v in e.verts:
            for o in v.link_edges:
                if o not in seen and len(o.link_faces) == 1: seen.add(o); stack.append(o)
    loops.append(comp)
stats = {'border': 0, 'water': 0, 'covered': 0, 'hole': 0}
HOLES, fill = [], []
for comp in loops:
    pts = [v.co for e in comp for v in e.verts]
    c = sum(pts, Vector()) / len(pts)
    size = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
    water = sum(1 for e in comp if e.link_faces[0].material_index in (wi, qi)) > len(comp) * 0.3
    if sum(1 for e in comp if all(on_border(v.co) for v in e.verts)) > len(comp) * 0.3: stats['border'] += 1
    elif water: stats['water'] += 1
    elif along_bridge(comp): stats['bridge'] = stats.get('bridge', 0) + 1
    elif is_covered(comp) and not FILL_COVERED: stats['covered'] += 1
    else:
        stats['hole'] += 1; HOLES.append((tuple(round(x, 1) for x in c), len(comp), round(size, 1)))
        if len(comp) <= MAX_SIDES: fill.append(comp)
def fan_fill(comp):
    """Fallback: centre vertex + one triangle per open edge (works for any star-shaped gap)."""
    comp = [e for e in comp if e.is_valid and len(e.link_faces) == 1]
    if not comp: return []
    c = sum((v.co for e in comp for v in e.verts), Vector()) / (2 * len(comp))
    cv = bm.verts.new(c); out = []
    for e in comp:
        a, b = e.verts
        f0 = e.link_faces[0]
        # keep the winding consistent with the neighbouring face
        la = next(l for l in f0.loops if l.vert is a)
        a, b = (b, a) if la.link_loop_next.vert is b else (a, b)
        try: out.append(bm.faces.new((a, b, cv)))
        except ValueError: pass
    return out
water_v = [v.co.copy() for v in bm.verts if any(f.material_index == wi for f in v.link_faces)]
kdw = KDTree(max(1, len(water_v)))
for i, p in enumerate(water_v): kdw.insert((p.x, p.y, 0), i)
kdw.balance()
def near_water(comp):
    return water_v and sum(1 for e in comp if kdw.find((e.verts[0].co.x, e.verts[0].co.y, 0))[2] < 1.5) > len(comp) * 0.5
filled = 0
if FIX:
    fill = [comp for comp in fill if not near_water(comp)]  # boat landings / piers: open on purpose
    for comp in fill:
        comp = [e for e in comp if e.is_valid]
        res = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=comp)
        res = {'faces': [g_ for g_ in res['geom'] if isinstance(g_, bmesh.types.BMFace)]}
        if not res['faces']: res = {'faces': fan_fill(comp)}
        for f in res['faces']:
            nb = [o for e in f.edges for o in e.link_faces if o is not f]
            f.material_index = nb[0].material_index if nb else names.index('G_Paved')
            filled += 1
        bmesh.ops.triangulate(bm, faces=[f for f in res['faces'] if f.is_valid])
bm.normal_update()
for f in bm.faces:
    if f.normal.z < 0 and f.material_index not in (qi,): f.normal_flip()
bm.to_mesh(me); bm.free(); me.update()
HOLES.sort(key=lambda h: -h[2])
print('welded', welded, 't-junctions', tjunctions, 'loops', stats, 'filled faces', filled)
for h in HOLES[:40]: print('  hole', h)
