import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Make every bridge deck one flat (possibly sloped) road surface (re-runnable).

Deck footprint = the water faces in Bridges_lowpoly / Bahnhofbruecke_lowpoly (one connected
component per bridge). Ground vertices inside a footprint are deck vertices; those also used by
bank faces stay fixed (seamless joins). A plane is fitted through the fixed vertices (outliers
> 0.4 m dropped) and every free deck vertex is put on it.
"""
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ground = bpy.data.objects['Ground']; gm = ground.data
gwi = [m.name for m in gm.materials].index('G_Water')

def footprints():
    comps = []
    for name in ('Bridges_lowpoly', 'Bahnhofbruecke_lowpoly'):
        ob = bpy.data.objects.get(name)
        if not ob: continue
        me = ob.data; wi = [m.name for m in me.materials].index('G_Water')
        bm = bmesh.new()
        for p in me.polygons:
            if p.material_index == wi:
                try: bm.faces.new([bm.verts.new((me.vertices[i].co.x, me.vertices[i].co.y, me.vertices[i].co.z)) for i in p.vertices])
                except ValueError: pass
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
        seen = set()
        for f in bm.faces:
            if f in seen: continue
            comp, stack = [], [f]; seen.add(f)
            while stack:
                c = stack.pop(); comp.append([v.co.copy() for v in c.verts])
                for e in c.edges:
                    for o in e.link_faces:
                        if o not in seen: seen.add(o); stack.append(o)
            comps.append(comp)
        bm.free()
    return comps

def fit_plane(pts):
    # least squares z = a + b x + c y
    S = Matrix(((0.0,) * 3,) * 3); r = Vector((0.0, 0.0, 0.0))
    for p in pts:
        row = Vector((1.0, p.x, p.y))
        for i in range(3):
            for j in range(3): S[i][j] += row[i] * row[j]
            r[i] += row[i] * p.z
    return S.inverted_safe() @ r

def merged_footprints(gap=4.0):
    """Pieces of the same bridge (split by piers/islands) -> one footprint."""
    comps = footprints()
    boxes = [(min(p.x for poly in c for p in poly), min(p.y for poly in c for p in poly),
              max(p.x for poly in c for p in poly), max(p.y for poly in c for p in poly)) for c in comps]
    parent = list(range(len(comps)))
    def root(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i in range(len(comps)):
        for j in range(i + 1, len(comps)):
            a, b = boxes[i], boxes[j]
            if a[0] - gap < b[2] and b[0] - gap < a[2] and a[1] - gap < b[3] and b[1] - gap < a[3]:
                parent[root(i)] = root(j)
    groups = {}
    for i, c in enumerate(comps): groups.setdefault(root(i), []).extend(c)
    return list(groups.values())

MAX_SLOPE = 0.08
def robust_height(pts):
    """Plane through the bank vertices; if implausibly steep, slope along the main axis only."""
    zmed = sorted(p.z for p in pts)[len(pts) // 2]
    pts = [p for p in pts if abs(p.z - zmed) < 2.0] or pts  # ignore anchors far off the median (e.g. quay steps)
    abc = fit_plane(pts)
    f = lambda p, k=abc: k[0] + k[1] * p.x + k[2] * p.y
    keep = [p for p in pts if abs(f(p) - p.z) < 0.4]
    if len(keep) >= 3: abc = fit_plane(keep); f = lambda p, k=abc: k[0] + k[1] * p.x + k[2] * p.y
    ok = max(abs(abc[1]), abs(abc[2])) <= MAX_SLOPE and max(abs(f(p) - p.z) for p in pts) < 0.6
    if ok: return f  # otherwise (too steep or degenerate, e.g. collinear anchors): main-axis slope
    # main axis = the two farthest-apart bank points
    a = max(pts, key=lambda p: (p.xy - pts[0].xy).length); b = max(pts, key=lambda p: (p.xy - a.xy).length)
    ax = (b.xy - a.xy)
    if ax.length < 1: zm = sorted(p.z for p in pts)[len(pts) // 2]; return lambda p: zm
    ax.normalize()
    us = [(p.xy - a.xy).dot(ax) for p in pts]
    mu, mz = sum(us) / len(us), sum(p.z for p in pts) / len(pts)
    k = sum((u - mu) * (p.z - mz) for u, p in zip(us, pts)) / max(sum((u - mu) ** 2 for u in us), 1e-6)
    k = max(-MAX_SLOPE, min(MAX_SLOPE, k))
    return lambda p: mz + k * ((p.xy - a.xy).dot(ax) - mu)

bm = bmesh.new(); bm.from_mesh(gm)
report = []
for comp in merged_footprints():
    verts, polys = [], []
    for poly in comp:
        polys.append(list(range(len(verts), len(verts) + len(poly)))); verts += poly
    fb = BVHTree.FromPolygons(verts, polys)
    inside = lambda p: fb.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))[0] is not None
    deck_faces = {f for f in bm.faces if f.material_index != gwi and inside(f.calc_center_median())}
    if not deck_faces: continue
    deck_verts = {v for f in deck_faces for v in f.verts}
    water_z = min(p.z for p in verts)
    fixed = [v for v in deck_verts if any(o not in deck_faces and o.material_index != gwi for o in v.link_faces)
             and v.co.z > water_z + 1.0]  # bank streets only, not riverside steps at water level
    if len(fixed) < 3: continue
    pts = [v.co.copy() for v in fixed]
    plane = robust_height(pts)
    fixed_set = {v for v in fixed if abs(plane(v.co) - v.co.z) < 0.4}
    moved = 0
    for v in deck_verts:
        if v in fixed_set: continue
        v.co.z = plane(v.co); moved += 1
    c = sum((v.co for v in deck_verts), Vector()) / len(deck_verts)
    zs = [plane(v.co) for v in deck_verts]
    report.append((tuple(round(x) for x in c.xy), len(deck_faces), moved, 'deck z', round(min(zs), 2), round(max(zs), 2)))
bm.to_mesh(gm); bm.free(); gm.update()
print('bridges flattened (centre, faces, moved verts, deck z range):'); [print(' ', r) for r in report]
