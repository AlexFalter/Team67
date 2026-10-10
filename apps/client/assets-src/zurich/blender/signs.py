import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Big shop signs on facades (re-runnable; run after build_buildings). Text/colours: theme surfaces.

SIGNS: (building, theme surface, direction the facade should face (xy), width m, height m).
Each board goes on the largest wall of that building facing that way, centred, 1.2 m below the wall top.
"""
import bmesh
from mathutils import Vector

SIGNS = [
    # Coop at the Bahnhofbrücke: deliberately larger than the real one
    ('B_2372833.001', 'CoopSign', (0.0, 1.0), 10.0, 3.0),   # facing the bridge (north)
    ('B_2372833.001', 'CoopSign', (1.0, 0.0), 10.0, 3.0),   # facing the Limmat / Central (east)
]
DEPTH = 0.3

bm = bmesh.new()
mats = sorted({s[1] for s in SIGNS}) + ['Light']
placed = []
for building, surface, want, w, h in SIGNS:
    ob = bpy.data.objects.get(building + '_s')
    if not ob: continue
    me = ob.data; want = Vector(want).normalized()
    best = None
    for p in me.polygons:
        n = Vector((p.normal.x, p.normal.y))
        if abs(p.normal.z) > 0.1 or n.length < 1e-6 or n.normalized().dot(want) < 0.85: continue
        vs = [me.vertices[i].co for i in p.vertices]
        if best is None or p.area > best[0]: best = (p.area, n.normalized(), vs)
    if not best: continue
    _, n, vs = best
    # whole facade plane: all coplanar walls of that building facing the same way
    d = sum(v.to_2d().dot(n) for v in vs) / len(vs)
    pts = [me.vertices[i].co for p in me.polygons if abs(p.normal.z) < 0.1 and Vector((p.normal.x, p.normal.y)).length > 1e-6
           and Vector((p.normal.x, p.normal.y)).normalized().dot(n) > 0.99 for i in p.vertices
           if abs(me.vertices[i].co.to_2d().dot(n) - d) < 0.5]
    t = Vector((-n.y, n.x))
    ts = [q.to_2d().dot(t) for q in pts]; tc = (min(ts) + max(ts)) / 2
    w = min(w, max(ts) - min(ts) - 1.0)
    ztop = max(q.z for q in pts) - 1.2
    o = t * tc + n * d
    n3, t3 = Vector((n.x, n.y, 0)), Vector((t.x, t.y, 0))
    base = lambda tt, nn, zz: Vector((o.x, o.y, 0)) + t3 * tt + n3 * nn + Vector((0, 0, zz))
    c8 = [base(-w / 2, 0.05, ztop - h), base(w / 2, 0.05, ztop - h), base(w / 2, 0.05 + DEPTH, ztop - h), base(-w / 2, 0.05 + DEPTH, ztop - h)]
    top = [v + Vector((0, 0, h)) for v in c8]
    centre = sum(c8 + top, Vector()) / 8
    for k, pts4 in enumerate([top, list(reversed(c8))] + [(c8[i], c8[(i + 1) % 4], top[(i + 1) % 4], top[i]) for i in range(4)]):
        f = bm.faces.new([bm.verts.new(p) for p in pts4]); f.normal_update()
        if f.normal.dot(f.calc_center_median() - centre) < 0: f.normal_flip()
        front = k == 4  # (c8[2], c8[3], top[3], top[2]) = outward face
        f.material_index = mats.index(surface) if front else mats.index('Light')
    placed.append((building, surface, tuple(round(x, 2) for x in want), round(w, 1)))

uv = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    nn = f.normal; hd = Vector((-nn.y, nn.x, 0))
    ts = [l.vert.co.dot(hd) for l in f.loops]; zs = [l.vert.co.z for l in f.loops]
    for l, tv, zv in zip(f.loops, ts, zs):
        l[uv].uv = ((tv - min(ts)) / max(max(ts) - min(ts), 1e-6), (zv - min(zs)) / max(max(zs) - min(zs), 1e-6))
old = bpy.data.objects.get('Signs')
if old and old.get('keep'): raise SystemExit('Signs kept (manual edit)')
if old: m = old.data; bpy.data.objects.remove(old); bpy.data.meshes.remove(m)
me = bpy.data.meshes.new('Signs'); bm.to_mesh(me); bm.free()
for m in mats: me.materials.append(bpy.data.materials.get('G_' + m) or bpy.data.materials.new('G_' + m))
coll = bpy.data.collections.get('Signs') or bpy.data.collections.new('Signs')
if coll.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(coll)
coll.objects.link(bpy.data.objects.new('Signs', me))
print('signs', placed)
