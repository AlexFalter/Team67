import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""(Re)build waterfront railings for all lifted bridges in Bridges_lowpoly (re-runnable).

Bridges = official Bruecke_Passerelle objects in 'Replaced' (except the Bahnhofbrücke, which has its
own object). Deck = raised ground inside the official outline (+4 m). Heading from best_frame.
"""
import bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
exec(open(ZH_DIR + '/blender/bridge_common.py').read())

SKIP = {'B_26373'}  # Bahnhofbrücke: Bahnhofbruecke_lowpoly + bridge_railing.py
ground = bpy.data.objects['Ground']; gme = ground.data
wi = [m.name for m in gme.materials].index('G_Water')
gbvh = BVHTree.FromObject(ground, bpy.context.evaluated_depsgraph_get())
def hit(p):
    h = gbvh.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))
    return (h[0].z, gme.polygons[h[2]].material_index, h[2]) if h[0] else (None, None, None)

ob = bpy.data.objects['Bridges_lowpoly']; me = ob.data
mi = {m.name: i for i, m in enumerate(me.materials)}
CONC, METAL = mi['G_Bridge'], mi['G_Metal']
if 'G_Quay' not in mi:
    me.materials.append(bpy.data.materials.get('G_Quay') or bpy.data.materials.new('G_Quay')); mi['G_Quay'] = len(me.materials) - 1
QUAY = mi['G_Quay']  # abutment walls under the decks (not picked up as railing edges)
bm = bmesh.new(); bm.from_mesh(me)

# Rebuildable: keep only slab undersides (stone, facing down) and the water below; regenerate the
# water-facing slab edges from the underside outline, then the railings on top of those edges.
WATER_B = mi['G_Water']
SLAB = 0.9
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != WATER_B], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
foot = bmesh.new()  # deck footprint = the water faces under the decks
for f in bm.faces:
    try: foot.faces.new([foot.verts.new(v.co) for v in f.verts])
    except ValueError: pass
bmesh.ops.remove_doubles(foot, verts=foot.verts, dist=0.01)
def deck_top(p, inward):
    for k in range(0, 15):
        z, m, _ = hit(p + inward * (0.1 * k))
        if z is not None and m != wi: return z
    return None
for f in foot.faces:  # slab underside, following the deck height
    zs = [deck_top(v.co, Vector()) for v in f.verts]
    if None in zs: continue
    u = bm.faces.new([bm.verts.new(Vector((v.co.x, v.co.y, z - SLAB))) for v, z in zip(reversed(f.verts), reversed(zs))])
    u.material_index = CONC
edges_new = 0
for e in foot.edges:
    if len(e.link_faces) != 1: continue
    a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
    mid = (a + b) / 2; d = (b - a).normalized(); n = Vector((d.y, -d.x, 0))
    if (e.link_faces[0].calc_center_median() - mid).dot(n) > 0: n = -n; a, b = b, a
    za, zb = deck_top(a, -n), deck_top(b, -n)
    if hit(mid + n * 1.0)[1] != wi:
        # bank side under the deck: abutment wall from below the water up to the deck (no view into the void)
        if za is not None and zb is not None:
            f = bm.faces.new([bm.verts.new(p) for p in (Vector((a.x, a.y, a.z - 0.6)), Vector((b.x, b.y, b.z - 0.6)), Vector((b.x, b.y, zb)), Vector((a.x, a.y, za)))])
            f.material_index = QUAY; f.normal_update()
            if f.normal.dot(-n) < 0: f.normal_flip()  # faces the river (inwards under the deck)
        continue
    if za is None or zb is None: continue
    f = bm.faces.new([bm.verts.new(p) for p in (Vector((a.x, a.y, za - SLAB)), Vector((b.x, b.y, zb - SLAB)), Vector((b.x, b.y, zb)), Vector((a.x, a.y, za)))])
    f.material_index = CONC; f.normal_update()
    if f.normal.dot(n) < 0: f.normal_flip()
    edges_new += 1
foot.free()
print('slab edges rebuilt', edges_new)
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

# Railing line = top edges of the water-facing slab faces (vertical, standalone CONC quads).
report = []
tops = []
for f in bm.faces:
    if f.material_index != CONC or abs(f.normal.z) > 0.2 or len(f.verts) != 4: continue
    if any(len(e.link_faces) > 1 for e in f.edges): continue
    vs = sorted(f.verts, key=lambda v: v.co.z)[2:]
    out_n = Vector((f.normal.x, f.normal.y, 0)).normalized()
    tops.append((vs[0].co.copy(), vs[1].co.copy(), out_n))
key = lambda p: (round(p.x, 2), round(p.y, 2))
adj = {}
for i, (a, b, n) in enumerate(tops):
    adj.setdefault(key(a), []).append(i); adj.setdefault(key(b), []).append(i)
used = set()
def simplify(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; ab = (b - a).to_2d()
    dmax, k = 0, 0
    for i, p in enumerate(pts[1:-1], 1):
        d = abs(ab.cross((p - a).to_2d())) / max(ab.length, 1e-6)
        if d > dmax: dmax, k = d, i
    return simplify(pts[:k + 1], tol)[:-1] + simplify(pts[k:], tol) if dmax > tol else [a, b]
for i in range(len(tops)):
    if i in used: continue
    # walk the chain in both directions
    chain = [i]; used.add(i)
    for direction in (0, 1):
        cur = i
        end = tops[cur][1] if direction == 0 else tops[cur][0]
        while True:
            nxt = [j for j in adj.get(key(end), []) if j not in used]
            if not nxt: break
            j = nxt[0]; used.add(j)
            a, b, _ = tops[j]
            end = b if key(a) == key(end) else a
            if direction == 0: chain.append(j)
            else: chain.insert(0, j)
    # ordered points
    pts = []
    for j in chain:
        a, b, _ = tops[j]
        if not pts: pts = [a, b]
        elif key(a) == key(pts[-1]): pts.append(b)
        elif key(b) == key(pts[-1]): pts.append(a)
        elif key(a) == key(pts[0]): pts.insert(0, b)
        elif key(b) == key(pts[0]): pts.insert(0, a)
        else: pts.append(a); pts.append(b)
    length = sum((q - p).length for p, q in zip(pts, pts[1:]))
    if length < 4: continue
    pts = simplify(pts, 0.6)
    normal = sum((tops[j][2] for j in chain), Vector()).normalized()
    inset = [p - Vector((normal.x, normal.y, 0)) * 0.2 for p in pts]
    for p0, p1 in zip(inset, inset[1:]):
        seg_box(p0, p1, 0.18, -0.02, 0.4, CONC)
        seg_box(p0, p1, 0.05, 1.05, 1.15, METAL)
        seg_box(p0, p1, 0.03, 0.7, 0.76, METAL)
        cnt = max(1, round((p1 - p0).length / 2.5))
        for k2 in range(cnt + 1):
            p = p0.lerp(p1, k2 / cnt); t = (p1 - p0).normalized() * 0.05
            seg_box(p - t, p + t, 0.05, 0.4, 1.05, METAL)
    report.append((round(length, 1), len(pts) - 1))

bm.normal_update()
uv = bm.loops.layers.uv.active
for f in bm.faces:
    nrm = f.normal
    for l in f.loops:
        c = l.vert.co
        l[uv].uv = (c.x / 4, c.y / 4) if abs(nrm.z) > 0.7 else ((c.x * -nrm.y + c.y * nrm.x) / 4, c.z / 4)
bm.to_mesh(me); bm.free(); me.update()
print('railing chains (length m, segments):', sorted(report, reverse=True))
