import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Simple, solid Polyterrasse (replaces the package's terrace + ETH Link underpass). Re-runnable.

- the package collection 'Polyterrasse — …' -> 'Replaced' (kept for reference, excluded)
- footprint = union of the package's terrace-level surfaces (TOP +- 0.4 m), one flat solid block:
  concrete-tile top, stone walls down into the ground; hidden ground under it pushed below the top
- fence (stone plinth, metal rails/posts, like the bridges) on every edge with a drop > 0.6 m,
  except along the ETH main building; a broad 20 % ramp down towards the Polybahn top station door
"""
import bmesh, math
from mathutils import Vector, geometry
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

TOP, BOTTOM = 50.7, 42.0
STEP, TREAD, STAIR_W, RAMP_SLOPE = 0.17, 0.36, 5.0, 0.20
scene = bpy.context.scene
exec(open(ZH_DIR + '/blender/guard.py').read())
if kept('Polyterrasse_lowpoly'): raise SystemExit('Polyterrasse_lowpoly kept (manual edit)')

pkg = [c for c in bpy.data.collections if c.name.startswith('Polyterrasse')]
rep = bpy.data.collections.get('Replaced')
srcs = []
for c in pkg:
    for o in c.all_objects:
        if o.type != 'MESH': continue
        for p in o.data.polygons:
            if p.normal.z > 0.9 and abs((o.matrix_world @ p.center).z - TOP) < 0.4:
                srcs.append([(o.matrix_world @ o.data.vertices[i].co).to_2d() for i in p.vertices])
    if c.name not in rep.children: rep.children.link(c)
    if c.name in scene.collection.children: scene.collection.children.unlink(c)
def exclude_all(lc):
    for ch in lc.children:
        if ch.collection.name == 'Replaced' or ch.collection.name.startswith('Polyterrasse'): ch.exclude = True
        exclude_all(ch)
exclude_all(bpy.context.view_layer.layer_collection)
if not srcs: raise SystemExit('no terrace surfaces found')

# union of the terrace surfaces -> one triangulated top
verts, faces = [], []
for poly in srcs:
    faces.append(list(range(len(verts), len(verts) + len(poly)))); verts += poly
out_v, _, out_f, _, _, _ = geometry.delaunay_2d_cdt(verts, [], faces, 1, 1e-3, False)
bm = bmesh.new()
bv = [bm.verts.new((p.x, p.y, TOP)) for p in out_v]
for f in out_f:
    try: bm.faces.new([bv[i] for i in f])
    except ValueError: pass
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)
bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts[:], edges=bm.edges[:])
bmesh.ops.triangulate(bm, faces=bm.faces[:])
for f in bm.faces:
    f.material_index = 0
    if f.normal.z < 0: f.normal_flip()
outline = [e for e in bm.edges if len(e.link_faces) == 1]
foot_bvh = BVHTree.FromBMesh(bm)
inside = lambda p: foot_bvh.ray_cast(Vector((p.x, p.y, TOP + 10)), Vector((0, 0, -1)))[0] is not None

# ground: hide what is under the slab; sample heights outside
g = bpy.data.objects['Ground']; gme = g.data
for v in gme.vertices:
    if inside(v.co) and v.co.z > TOP - 0.3: v.co.z = TOP - 0.3
gme.update()
gb = BVHTree.FromObject(g, bpy.context.evaluated_depsgraph_get())
def gz(p):
    h = gb.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))
    return h[0].z if h[0] else None
hg = []
for c in bpy.data.collections:
    if c.name.startswith('ETH HG'):
        for o in c.all_objects:
            if o.type == 'MESH': hg.append(BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get()))
def near_hg(p, d):
    return any(t.find_nearest(Vector((p.x, p.y, TOP + 1)), d)[0] is not None for t in hg)

# walls (outward) down into the ground
WALL, TOPM, METAL = 1, 0, 2
edge_info = []
for e in outline:
    a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
    f = e.link_faces[0]; mid = (a + b) / 2
    d = (b - a).normalized(); n = Vector((d.y, -d.x, 0))
    if (f.calc_center_median() - mid).dot(n) > 0: n = -n; a, b = b, a
    edge_info.append((a, b, n))
for a, b, n in edge_info:
    w = bm.faces.new([bm.verts.new(p) for p in (Vector((a.x, a.y, BOTTOM)), Vector((b.x, b.y, BOTTOM)), b, a)])
    w.material_index = WALL; w.normal_update()
    if w.normal.dot(n) < 0: w.normal_flip()

def box(p0, p1, half_w, z0, z1, mat):
    dd = (p1 - p0).to_2d()
    if dd.length < 1e-3: return
    nn = Vector((-dd.y, dd.x)).normalized() * half_w; nn = Vector((nn.x, nn.y, 0))
    base = [p0 + nn, p1 + nn, p1 - nn, p0 - nn]
    lo = [p + Vector((0, 0, z0)) for p in base]; hi = [p + Vector((0, 0, z1)) for p in base]
    cen = sum(lo + hi, Vector()) / 8
    for pts in [(lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]) for i in range(4)] + [hi, list(reversed(lo))]:
        f = bm.faces.new([bm.verts.new(v) for v in pts]); f.material_index = mat; f.normal_update()
        if f.normal.dot(f.calc_center_median() - cen) < 0: f.normal_flip()

# ramp towards the Polybahn top station door (was a staircase; ramps walk smoothly in the game)
door = None
st = bpy.data.objects.get('Polybahn_topstation')
if st:
    bb = [st.matrix_world @ Vector(c) for c in st.bound_box]
    door = sum(bb, Vector()) / 8
stairs_at = None
if door:
    a, b, n = min(edge_info, key=lambda e: (((e[0] + e[1]) / 2).to_2d() - door.to_2d()).length if (e[1] - e[0]).length > STAIR_W else 1e9)
    mid = (a + b) / 2; d = (b - a).normalized()
    # ramp (not steps): 20 % slope from the terrace edge down until it meets the ground
    Lr = 8.0
    for _ in range(6):
        z_end = gz(mid + n * Lr) or TOP - 2
        Lr = min(20.0, max(3.0, (TOP - z_end) / RAMP_SLOPE))
    z_end = gz(mid + n * Lr) or TOP - 2
    c0, c1 = Vector((mid.x, mid.y, 0)), Vector((mid.x, mid.y, 0)) + n * Lr
    w2 = d * STAIR_W / 2
    z_low = min(z_end, gz(c0) or z_end) - 0.6
    top = [c0 - w2 + Vector((0, 0, TOP)), c0 + w2 + Vector((0, 0, TOP)), c1 + w2 + Vector((0, 0, z_end)), c1 - w2 + Vector((0, 0, z_end))]
    low = [Vector((p.x, p.y, z_low)) for p in top]
    cen = sum(top + low, Vector()) / 8
    for pts, mat in ((top, TOPM), ((low[0], low[3], top[3], top[0]), WALL), ((low[2], low[1], top[1], top[2]), WALL),
                     ((low[3], low[2], top[2], top[3]), WALL)):
        f = bm.faces.new([bm.verts.new(v) for v in pts]); f.material_index = mat; f.normal_update()
        if f.normal.dot(f.calc_center_median() - cen) < 0: f.normal_flip()
    stairs_at = (mid, d, n)

# fence on edges with a drop, not along the HG, not across the stairs
fence_len = 0
for a, b, n in edge_info:
    mid = (a + b) / 2
    if (b - a).length < 0.3: continue
    outside = gz(mid + n * 1.2)
    if outside is not None and outside > TOP - 0.6: continue
    if near_hg(mid, 2.0): continue
    if stairs_at and abs((mid - stairs_at[0]).dot(stairs_at[1])) < STAIR_W / 2 + 0.3 and abs((mid - stairs_at[0]).dot(stairs_at[2])) < 1.0:
        continue
    pa, pb = a - n * 0.25, b - n * 0.25
    box(pa, pb, 0.18, -0.02, 0.4, WALL)
    box(pa, pb, 0.05, 1.05, 1.15, METAL)
    box(pa, pb, 0.03, 0.7, 0.76, METAL)
    cnt = max(1, round((b - a).length / 2.5))
    for i in range(cnt + 1):
        p = pa.lerp(pb, i / cnt); t = (pb - pa).normalized() * 0.05
        box(p - t, p + t, 0.05, 0.4, 1.05, METAL)
    fence_len += (b - a).length

bm.normal_update()
uv = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    nn = f.normal
    for l in f.loops:
        c = l.vert.co
        l[uv].uv = (c.x / 4, c.y / 4) if abs(nn.z) > 0.7 else ((c.x * -nn.y + c.y * nn.x) / 2.8, c.z / 2.8)
old = bpy.data.objects.get('Polyterrasse_lowpoly')
if old: m = old.data; bpy.data.objects.remove(old); bpy.data.meshes.remove(m)
me = bpy.data.meshes.new('Polyterrasse_lowpoly'); bm.to_mesh(me); bm.free()
for m in ('G_Concrete', 'G_StonePlinth', 'G_Metal'): me.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
for p in me.polygons: p.use_smooth = False
coll = bpy.data.collections.get('Landmarks') or bpy.data.collections.new('Landmarks')
if coll.name not in scene.collection.children: scene.collection.children.link(coll)
coll.objects.link(bpy.data.objects.new('Polyterrasse_lowpoly', me))
me.calc_loop_triangles()
print('terrace: surfaces', len(srcs), 'outline edges', len(edge_info), 'fence m', round(fence_len), 'stairs', stairs_at is not None,
      'tris', len(me.loop_triangles))
