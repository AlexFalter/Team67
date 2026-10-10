import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Clean waterfront railing for the Bahnhofbrücke (re-runnable).

Removes railing/lamp parts from Bahnhofbruecke_lowpoly, then probes the deck edge every metre on
both sides, keeps only stretches with open water outside, simplifies them to straight runs and
builds a stone plinth + metal posts + rails on the deck edge.
"""
import bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

FRAME = Matrix.Translation((-86.0, -73.25, 0)) @ Matrix.Rotation(math.atan2(-8.5, 78.0), 4, 'Z')
ob = bpy.data.objects['Bahnhofbruecke_lowpoly']; me = ob.data
mi = {m.name: i for i, m in enumerate(me.materials)}
CONC, METAL = mi['G_Bridge'], mi['G_Metal']
if 'G_Quay' not in mi:
    me.materials.append(bpy.data.materials.get('G_Quay') or bpy.data.materials.new('G_Quay')); mi['G_Quay'] = len(me.materials) - 1
QUAY = mi['G_Quay']  # abutment walls under the deck

ground = bpy.data.objects['Ground']; gm = ground.data
water_i = [m.name for m in gm.materials].index('G_Water')
gbvh = BVHTree.FromObject(ground, bpy.context.evaluated_depsgraph_get())
def hit(p):
    h = gbvh.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))
    return (h[0].z, gm.polygons[h[2]].material_index) if h[0] else (None, None)
water_z = hit(FRAME @ Vector((0, 0, 0)))[0]
water_z = min(z for z, m in (hit(FRAME @ Vector((u, 30, 0))) for u in (-10, 0, 10)) if z is not None)


# 1. Remove previous railing/lamps: every METAL part, and CONC boxes 0.25-0.45 m tall (plinths).
bm = bmesh.new(); bm.from_mesh(me)
seen, doomed = set(), []
for f in bm.faces:
    if f in seen: continue
    part, stack = [], [f]; seen.add(f)
    while stack:
        c = stack.pop(); part.append(c)
        for e in c.edges:
            for o in e.link_faces:
                if o not in seen: seen.add(o); stack.append(o)
    zs = [v.co.z for p in part for v in p.verts]
    c = sum((v.co for p in part for v in p.verts), Vector()) / len(zs)
    dz = hit(c)[0]
    on_deck = dz is not None and dz > water_z + 1.0 and min(zs) > dz - 0.1
    closed = all(len(e.link_faces) == 2 for p in part for e in p.edges)
    if part[0].material_index == METAL or (part[0].material_index == CONC and (on_deck or not closed)):
        doomed += part
doomed += [f for f in bm.faces if f.material_index == QUAY and f not in doomed]  # previous abutments
bmesh.ops.delete(bm, geom=doomed, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
print('removed faces', len(doomed))

# 1b. Rebuild the slab (underside + water-facing edge) from the footprint = bridge water faces,
#     with heights taken from the exact deck vertices (nearest Ground vertex), never raycasts.
from mathutils.kdtree import KDTree
WATER_B = mi['G_Water']
gverts = [v.co for v in gm.vertices if v.co.z > water_z + 1.0]
kd = KDTree(len(gverts))
for i, co in enumerate(gverts): kd.insert((co.x, co.y, 0), i)
kd.balance()
def top_z(p):
    co, i, d = kd.find((p.x, p.y, 0))
    return gverts[i].z
foot = bmesh.new()
for f in bm.faces:
    if f.material_index == WATER_B:
        foot.faces.new([foot.verts.new(v.co) for v in f.verts])
bmesh.ops.remove_doubles(foot, verts=foot.verts, dist=0.01)
for f in foot.faces:  # underside
    vs = [bm.verts.new((v.co.x, v.co.y, top_z(v.co) - 1.1)) for v in reversed(f.verts)]
    try: bm.faces.new(vs).material_index = CONC
    except ValueError: pass
for e in foot.edges:  # water-facing slab edge
    if len(e.link_faces) != 1: continue
    a, b = e.verts[0].co, e.verts[1].co
    mid = (a + b) / 2; d = (b - a).normalized()
    n = Vector((d.y, -d.x, 0))
    if (e.link_faces[0].calc_center_median() - mid).dot(n) > 0:  # make n outward, keep winding outward
        n = -n; a, b = b, a
    za, zb = top_z(a), top_z(b)
    if hit(mid + n * 1.0)[1] != water_i:
        # bank side under the deck: abutment wall from below the water up to the deck
        f = bm.faces.new([bm.verts.new(p) for p in ((a.x, a.y, a.z - 0.6), (b.x, b.y, b.z - 0.6), (b.x, b.y, zb), (a.x, a.y, za))])
        f.material_index = QUAY; f.normal_update()
        if f.normal.dot(-n) < 0: f.normal_flip()
        continue
    try:
        bm.faces.new([bm.verts.new(p) for p in ((a.x, a.y, za - 1.1), (b.x, b.y, zb - 1.1), (b.x, b.y, zb), (a.x, a.y, za))]).material_index = CONC
    except ValueError: pass
foot.free()

# 2. Probe the deck edge.
def edge_at(u, s):
    """Outer deck edge on side s (+1 north, -1 south) at local u; None if no deck or no water outside."""
    y, last = 0.0, None
    while abs(y) < 30:
        z, m = hit(FRAME @ Vector((u, y, 0)))
        if z is None or z < water_z + 1.0:
            break
        last = y; y += s * 0.25
    if last is None: return None
    lo, hi = last, last + s * 0.25  # refine
    for _ in range(6):
        mid = (lo + hi) / 2
        z, m = hit(FRAME @ Vector((u, mid, 0)))
        if z is not None and z >= water_z + 1.0: lo = mid
        else: hi = mid
    outside = [hit(FRAME @ Vector((u, lo + s * d, 0))) for d in (0.6, 2.0, 4.0)]
    if not all(m == water_i for _, m in outside): return None
    return lo

def simplify(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; ab = (b - a)
    dmax, k = 0, 0
    for i, p in enumerate(pts[1:-1], 1):
        d = ab.cross(p - a).length / max(ab.length, 1e-6)
        if d > dmax: dmax, k = d, i
    return simplify(pts[:k + 1], tol)[:-1] + simplify(pts[k:], tol) if dmax > tol else [a, b]

runs = []
for s in (-1, 1):
    pts = [Vector((float(u), y, 0)) for u in range(-38, 39) if (y := edge_at(float(u), s)) is not None and abs(y) < 18]
    if len(pts) < 5: continue
    med = sorted(p.y for p in pts)[len(pts) // 2]
    pts = [p for p in pts if abs(p.y - med) < 1.5]
    # longest contiguous stretch (1 m probe spacing)
    best, cur = [], [pts[0]]
    for a, b in zip(pts, pts[1:]):
        if b.x - a.x <= 1.5: cur.append(b)
        else: best, cur = max(best, cur, key=len), [b]
    pts = max(best, cur, key=len)
    n = len(pts); mx = sum(p.x for p in pts) / n; my = sum(p.y for p in pts) / n
    k = sum((p.x - mx) * (p.y - my) for p in pts) / max(sum((p.x - mx) ** 2 for p in pts), 1e-6)
    line = lambda u: my + k * (u - mx)
    # straight run, with intermediate points so the rail follows the deck height
    u0, u1 = pts[0].x, pts[-1].x
    m = max(2, round((u1 - u0) / 8))
    runs.append([Vector((u0 + (u1 - u0) * i / m, line(u0 + (u1 - u0) * i / m), 0)) for i in range(m + 1)])
print('runs', [(round(r[0].x, 1), round(r[-1].x, 1), round(r[0].y, 2), round(r[-1].y, 2)) for r in runs])

# 3. Build railing on each simplified run (local frame -> world), sitting 0.2 m inside the edge.
def deck_z(p, s):
    # step inward until we are on the deck (never sample the river)
    for d in range(0, 31):
        q = p - (FRAME.to_3x3() @ Vector((0, s * d * 0.1, 0)))
        z, _ = hit(q)
        if z is not None and z > water_z + 1.0: return z
    return z
def quad(vs, mat):
    try: bm.faces.new([bm.verts.new(v) for v in vs]).material_index = mat
    except ValueError: pass
def seg_box(a, b, half_w, z0, z1, mat):
    d = (b - a).to_2d()
    if d.length < 1e-3: return
    n = Vector((-d.y, d.x)).normalized() * half_w; n = Vector((n.x, n.y, 0))
    base = [a + n, b + n, b - n, a - n]
    lo = [p + Vector((0, 0, z0)) for p in base]; hi = [p + Vector((0, 0, z1)) for p in base]
    centre = sum(lo + hi, Vector()) / 8
    for vs in [(lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]) for i in range(4)] + [hi, list(reversed(lo))]:
        try:
            f = bm.faces.new([bm.verts.new(v) for v in vs]); f.material_index = mat
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - centre) < 0: f.normal_flip()  # outward (single-sided render)
        except ValueError: pass

total = 0
for run in runs:
    s = 1 if run[0].y > 0 else -1
    pts = run
    world = []
    for p in pts:
        w = FRAME @ Vector((p.x, p.y - s * 0.2, 0))
        world.append(Vector((w.x, w.y, deck_z(w, s))))
    for a, b in zip(world, world[1:]):
        seg_box(a, b, 0.18, -0.02, 0.4, CONC)          # stone plinth
        seg_box(a, b, 0.05, 1.05, 1.15, METAL)         # hand rail
        seg_box(a, b, 0.03, 0.7, 0.76, METAL)          # middle rail
        n = max(1, round((b - a).length / 2.5))
        for i in range(n + 1):
            p = a.lerp(b, i / n); t = (b - a).normalized() * 0.05
            seg_box(p - t, p + t, 0.05, 0.4, 1.05, METAL)
        total += (b - a).length

bm.normal_update()
uv = bm.loops.layers.uv.active
for f in bm.faces:
    nrm = f.normal
    for l in f.loops:
        c = l.vert.co
        l[uv].uv = (c.x / 4, c.y / 4) if abs(nrm.z) > 0.7 else ((c.x * -nrm.y + c.y * nrm.x) / 4, c.z / 4)
bm.to_mesh(me); bm.free(); me.update()
me.calc_loop_triangles()
print('railing m', round(total, 1), 'bridge tris', len(me.loop_triangles))
