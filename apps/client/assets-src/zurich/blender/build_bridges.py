import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Give every river bridge the Bahnhofbrücke treatment (run once; Bahnhofbrücke itself is already done).

1. find decks the land cover draped into the water (bridge_common.find_decks), keep those that
   overlap an official bridge object and span water; group pieces per official bridge
2. lift the deck: harmonic interpolation between the bank vertices -> seamless street joins
3. official decks -> hidden 'Replaced' (official piers stay); quay walls under the deck removed
4. 'Bridges_lowpoly': slab edge + underside along the real outline, water below, straight
   waterfront railings (stone plinth, metal posts and rails) per side
"""
import bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
exec(open(ZH_DIR + '/blender/bridge_common.py').read())

scene = bpy.context.scene
ground = bpy.data.objects['Ground']; gme = ground.data
mats = [m.name for m in gme.materials]
wi, qi = mats.index('G_Water'), mats.index('G_Quay')

bm = bmesh.new(); bm.from_mesh(gme)
# detach the water surface completely (corner-only contacts too), so lifting decks never drags it up
water = [f for f in bm.faces if f.material_index == wi]
bmesh.ops.split(bm, geom=water + list({e for f in water for e in f.edges}) + list({v for f in water for v in f.verts}))
bm.faces.ensure_lookup_table()
decks = find_decks(bm, mats)
bvh0 = BVHTree.FromBMesh(bm)
def face_at(p):
    h = bvh0.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))
    return bm.faces[h[2]] if h[2] is not None else None
official = official_bridges()
groups = {}
for d in decks:
    fs = set(d['faces'])
    spans = spans_water(d, lambda p: (f := face_at(p)) is not None and f.material_index == wi, lambda p: face_at(p) in fs)
    c = d['center']
    match = [n for n, mn, mx in official if mn.x - 3 < c.x < mx.x + 3 and mn.y - 3 < c.y < mx.y + 3]
    if not match: continue
    g = groups.setdefault(match[0], {'decks': [], 'spans': False, 'official': set()})
    g['decks'].append(d); g['spans'] |= spans; g['official'].update(match)
bridges = []
for name, g in groups.items():
    faces = [f for d in g['decks'] for f in d['faces']]
    fs = set(faces)
    frame, length, score = best_frame(faces, lambda p: (f := face_at(p)) is not None and f.material_index == wi,
                                      lambda p: face_at(p) in fs)
    if score < 3 or length < 10: continue  # real crossings only (not riverside steps/promenades)
    fixed = set().union(*(d['fixed'] for d in g['decks']))
    bridges.append(dict(name=name, official=g['official'], faces=faces, fixed=fixed, frame=frame,
                        length=length, water_z=min(d['water_z'] for d in g['decks'])))
print('bridges', [(b['name'], round(b['length']), len(b['faces'])) for b in bridges])

# 1. retire official decks
replaced = bpy.data.collections.get('Replaced') or bpy.data.collections.new('Replaced')
if replaced.name not in scene.collection.children: scene.collection.children.link(replaced)
for b in bridges:
    for n in b['official']:
        o = bpy.data.objects.get(n)
        if o and replaced not in o.users_collection:
            for c in list(o.users_collection): c.objects.unlink(o)
            replaced.objects.link(o)
bpy.context.view_layer.layer_collection.children['Replaced'].exclude = True

# 2. lift decks (harmonic fill, bank vertices fixed)
water_polys = []
for b in bridges:
    verts = {v for f in b['faces'] for v in f.verts}
    water_polys.append([[v.co.copy() for v in f.verts] for f in b['faces']])
    quay = [f for f in bm.faces if f.material_index == qi and any(v in verts for v in f.verts)]
    bmesh.ops.delete(bm, geom=quay, context='FACES')
    free = [v for v in verts if v not in b['fixed']]
    fixed_z = sum(v.co.z for v in b['fixed']) / len(b['fixed'])
    for v in free: v.co.z = fixed_z
    nbrs = {v: [e.other_vert(v) for e in v.link_edges if e.other_vert(v) in verts] for v in free}
    for _ in range(400):
        for v in free:
            n = nbrs[v]
            if n: v.co.z = sum(o.co.z for o in n) / len(n)
    b['verts'] = verts
bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_edges], context='VERTS')
bm.to_mesh(gme); bm.free(); gme.update()

# 3. structure
gbvh = BVHTree.FromObject(ground, bpy.context.evaluated_depsgraph_get())
def hit(p):
    h = gbvh.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))
    return (h[0].z, gme.polygons[h[2]].material_index) if h[0] else (None, None)

out = bmesh.new()
prev = bpy.data.objects.get('Bridges_lowpoly')
if prev: out.from_mesh(prev.data)  # re-runs add bridges that are still sunk (idempotent per bridge)
MATS = ['G_Bridge', 'G_Metal', 'G_Water']
CONC, METAL, WATER = range(3)
def quad(vs, mat):
    try: out.faces.new([out.verts.new(v) for v in vs]).material_index = mat
    except ValueError: pass
def seg_box(a, b, half_w, z0, z1, mat):
    d = (b - a).to_2d()
    if d.length < 1e-3: return
    n = Vector((-d.y, d.x)).normalized() * half_w; n = Vector((n.x, n.y, 0))
    base = [a + n, b + n, b - n, a - n]
    lo = [p + Vector((0, 0, z0)) for p in base]; hi = [p + Vector((0, 0, z1)) for p in base]
    for i in range(4):
        j = (i + 1) % 4; quad((lo[i], lo[j], hi[j], hi[i]), mat)
    quad(hi, mat); quad(list(reversed(lo)), mat)

for b, polys in zip(bridges, water_polys):
    F, L, wz = b['frame'], b['length'], b['water_z']
    slab = min(1.1, 0.5 + 0.012 * L)
    on_deck = lambda z: z is not None and z > wz + 1.0
    # slab underside + water below (same outline as the deck)
    foot = bmesh.new()
    for poly in polys: foot.faces.new([foot.verts.new(p) for p in poly])
    bmesh.ops.remove_doubles(foot, verts=foot.verts, dist=0.01)
    def top_z(p):
        z, _ = hit(p)
        return z if on_deck(z) else wz + 3
    for f in foot.faces:
        quad([Vector((v.co.x, v.co.y, top_z(v.co) - slab)) for v in reversed(f.verts)], CONC)
        quad([Vector((v.co.x, v.co.y, wz - 0.01)) for v in f.verts], WATER)
    for e in foot.edges:  # water-facing slab edge
        if len(e.link_faces) != 1: continue
        p, q = e.verts[0].co, e.verts[1].co
        m = (p + q) / 2; d = (q - p).normalized(); n = Vector((d.y, -d.x, 0))
        if (e.link_faces[0].calc_center_median() - m).dot(n) > 0: n = -n; p, q = q, p
        if hit(m + n * 1.0)[1] != wi: continue
        zp, zq = top_z(p), top_z(q)
        quad([Vector((p.x, p.y, zp - slab)), Vector((q.x, q.y, zq - slab)), Vector((q.x, q.y, zq)), Vector((p.x, p.y, zp))], CONC)
    foot.free()

out.normal_update()
uv = out.loops.layers.uv.active or out.loops.layers.uv.new('UVMap')
for f in out.faces:
    nrm = f.normal
    for l in f.loops:
        c = l.vert.co
        l[uv].uv = (c.x / 4, c.y / 4) if abs(nrm.z) > 0.7 else ((c.x * -nrm.y + c.y * nrm.x) / 4, c.z / 4)
old = bpy.data.objects.get('Bridges_lowpoly')
if old:
    m = old.data; bpy.data.objects.remove(old); bpy.data.meshes.remove(m)
me = bpy.data.meshes.new('Bridges_lowpoly'); out.to_mesh(me); out.free()
for name in MATS: me.materials.append(bpy.data.materials.get(name) or bpy.data.materials.new(name))
for p in me.polygons: p.use_smooth = False
ob = bpy.data.objects.new('Bridges_lowpoly', me)
(bpy.data.collections.get('Bridges') or scene.collection).objects.link(ob)
me.calc_loop_triangles()
print('bridges done', len(bridges), 'structure tris', len(me.loop_triangles))
exec(open(ZH_DIR + '/blender/bridges_railing.py').read())  # waterfront railings from the slab edges
