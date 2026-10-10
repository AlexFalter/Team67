import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Low-poly Bahnhofbrücke in map style, after the teammate's detailed model (Bahnhofbruecke.blend).

The walkable surface is the official land cover itself: Ground faces between the quays (road,
sidewalk, …) were draped into the river; they are lifted to a deck interpolated per lane between
the two bank edges, so streets continue seamlessly with the same materials and UVs. The bridge
object adds only structure under/around that surface: slab edge + underside along the real
outline, railings, lamps, piers (teammate's layout) and the water beneath.
Run once on a Ground that still has the sunken bridge (re-running finds nothing to lift).
"""
import bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

L, W = 78.4, 28.0
H = L / 2
OLD = ['B_26373', 'B_35107', 'B_39787', 'B_43601', 'B_55869']  # official deck + piers
FRAME = Matrix.Translation((-86.0, -73.25, 0)) @ Matrix.Rotation(math.atan2(-8.5, 78.0), 4, 'Z')  # teammate's BRIDGE ROOT
INV = FRAME.inverted()
SLAB = 1.1
MATS = ['G_Bridge', 'G_Metal', 'G_Water']
CONC, METAL, WATER = range(3)

scene = bpy.context.scene
def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in scene.collection.children: scene.collection.children.link(c)
    return c

# 1. Retire the official bridge pieces (reversible: hidden 'Replaced' collection).
replaced = coll('Replaced')
for n in OLD:
    o = bpy.data.objects.get(n)
    if o and replaced not in o.users_collection:
        for c in list(o.users_collection): c.objects.unlink(o)
        replaced.objects.link(o)
    if o: o.hide_set(False)
bpy.context.view_layer.layer_collection.children['Replaced'].exclude = True
if 'Bahnhofbruecke' in bpy.data.collections:  # detailed source model, reference only
    bpy.context.view_layer.layer_collection.children['Bahnhofbruecke'].exclude = True

ground = bpy.data.objects['Ground']; gme = ground.data
names = [m.name for m in gme.materials]
wi, qi, fi = names.index('G_Water'), names.index('G_Quay'), names.index('G_Footprint')
gbvh = BVHTree.FromObject(ground, bpy.context.evaluated_depsgraph_get())
def ground_z(p):
    hit = gbvh.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else None
water_z = min(ground_z(FRAME @ Vector((u, 0, 0))) for u in (-20, -10, 0, 10, 20))

bm = bmesh.new(); bm.from_mesh(gme)
loc = lambda co: INV @ Vector((co.x, co.y, 0))
deck = set()
for f in bm.faces:
    c = f.calc_center_median(); lc = loc(c)
    if f.material_index not in (wi, qi, fi) and abs(lc.x) < H + 3 and abs(lc.y) < 26 and c.z < water_z + 1.5:
        deck.add(f)
deck_verts = {v for f in deck for v in f.verts}
print('deck faces', len(deck), 'water level', round(water_z, 2))
if not deck:
    raise SystemExit('nothing to lift (already built?)')

# Bank heights per lane: sample the ground just beyond each bridge end at the same local y.
def bank(u, y):
    y = max(-13.5, min(13.5, y))
    for du in (0, 1, 2, 3, 4):
        z = ground_z(FRAME @ Vector((u + (du if u > 0 else -du), y, 0)))
        if z is not None and z > water_z + 1.5: return z
    return water_z + 3.5
xs = [loc(v.co).x for v in deck_verts]
u0, u1 = min(xs), max(xs)

# Water footprint (pre-lift outline) and quay walls that touched the deck.
water_faces = [[Vector((v.co.x, v.co.y, water_z - 0.01)) for v in f.verts] for f in deck]
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == qi and any(v in deck_verts for v in f.verts)], context='FACES_ONLY')

for v in deck_verts:
    lc = loc(v.co)
    zw, ze = bank(u0 - 0.5, lc.y), bank(u1 + 0.5, lc.y)
    t = (lc.x - u0) / (u1 - u0)
    v.co.z = max(v.co.z, zw + (ze - zw) * t)

# Outline edges: edges of the deck not shared with another deck face.
side_edges = []
for f in deck:
    for e in f.edges:
        others = [o for o in e.link_faces if o is not f]
        if any(o in deck for o in others): continue
        ends_on_bank = any(o.material_index not in (wi, fi) and o not in deck for o in others) and \
            min(abs(loc(v.co).x) for v in e.verts) > H - 6
        side_edges.append((e.verts[0].co.copy(), e.verts[1].co.copy(), ends_on_bank))
bm.to_mesh(gme); bm.free(); gme.update()

# 2. Structure mesh.
out = bmesh.new()
def quad(a, b, c, d, mat):
    try: out.faces.new([out.verts.new(p) for p in (a, b, c, d)]).material_index = mat
    except ValueError: pass
def seg_box(p0, p1, half_w, z0, z1, mat):
    d = (p1 - p0).to_2d()
    if d.length < 1e-3: return
    n = Vector((-d.y, d.x)).normalized() * half_w
    n3 = Vector((n.x, n.y, 0))
    b = [p0 + n3, p1 + n3, p1 - n3, p0 - n3]
    lo = [p + Vector((0, 0, z0)) for p in b]; hi = [p + Vector((0, 0, z1)) for p in b]
    for i in range(4):
        j = (i + 1) % 4
        quad(lo[i], lo[j], hi[j], hi[i], mat)
    quad(*hi, mat); quad(*reversed(lo), mat)
def post(p, r, z0, z1, mat, seg=6):
    ring0 = [out.verts.new(p + Vector((r * math.cos(a), r * math.sin(a), z0))) for a in (i * math.tau / seg for i in range(seg))]
    ring1 = [out.verts.new(v.co + Vector((0, 0, z1 - z0))) for v in ring0]
    for i in range(seg):
        j = (i + 1) % seg
        out.faces.new((ring0[i], ring0[j], ring1[j], ring1[i])).material_index = mat
    out.faces.new(ring1).material_index = mat

# slab: underside + outer edge along the real outline
deck_bvh = BVHTree.FromObject(ground, bpy.context.evaluated_depsgraph_get())
def deck_z(p):
    hit = deck_bvh.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else water_z + 3.5
for poly in water_faces:
    vs = [out.verts.new(Vector((p.x, p.y, deck_z(p) - SLAB))) for p in reversed(poly)]
    try: out.faces.new(vs).material_index = CONC
    except ValueError: pass
rail_len = 0
for a, b, on_bank in side_edges:
    if on_bank: continue
    quad(a + Vector((0, 0, -SLAB)), b + Vector((0, 0, -SLAB)), b + Vector((0, 0, 0.0)), a + Vector((0, 0, 0.0)), CONC)
    seg_box(a, b, 0.15, 0.0, 0.3, CONC)        # plinth
    seg_box(a, b, 0.04, 1.05, 1.13, METAL)     # hand rail
    seg_box(a, b, 0.03, 0.62, 0.67, METAL)     # middle rail
    n = max(1, round((b - a).length / 3.0))
    for i in range(n):
        p = a.lerp(b, i / n)
        seg_box(p - Vector((0.05, 0, 0)), p + Vector((0.05, 0, 0)), 0.05, 0.3, 1.05, METAL)
    rail_len += (b - a).length
# lamps: nearest outline point to the teammate's lamp spots, 0.8 m inward
for u in (-23, 23):
    for s in (-1, 1):
        target = FRAME @ Vector((u, s * 14, 0))
        best = min(((a.lerp(b, 0.5), a, b) for a, b, ob in side_edges if not ob), key=lambda t: (t[0].xy - target.xy).length)
        p, a, b = best
        inward = (FRAME @ Vector((u, 0, 0))).xy - p.xy
        p = p + Vector((*inward.normalized() * 0.8, 0))
        post(p, 0.09, 0.0, 6.3, METAL)
        seg_box(p - Vector((0, 0, 0)), p + Vector((*inward.normalized() * 0.9, 0)), 0.18, 6.2, 6.35, METAL)
# piers + crossbeams (teammate layout)
for u in (-13.1, 13.1):
    a, b = FRAME @ Vector((u, -13, 0)), FRAME @ Vector((u, 13, 0))
    za = deck_z(a.lerp(b, 0.5)) - SLAB
    seg_box(a.to_3d() + Vector((0, 0, za)), b.to_3d() + Vector((0, 0, za)), 0.7, -0.55, 0.0, CONC)
    for y in (-8, 8):
        p = FRAME @ Vector((u, y, 0))
        post(Vector((p.x, p.y, water_z - 0.5)), 0.95, 0.0, za - 0.55 - (water_z - 0.5), CONC, 8)
for poly in water_faces:  # river surface under the deck
    try: out.faces.new([out.verts.new(p) for p in poly]).material_index = WATER
    except ValueError: pass

out.normal_update()
uv = out.loops.layers.uv.new('UVMap')
for f in out.faces:
    nrm = f.normal
    for l in f.loops:
        c = l.vert.co
        if abs(nrm.z) > 0.7: l[uv].uv = (c.x / 4, c.y / 4)
        else: l[uv].uv = ((c.x * -nrm.y + c.y * nrm.x) / 4, c.z / 4)

old = bpy.data.objects.get('Bahnhofbruecke_lowpoly')
if old:
    m = old.data; bpy.data.objects.remove(old); bpy.data.meshes.remove(m)
me = bpy.data.meshes.new('Bahnhofbruecke_lowpoly'); out.to_mesh(me); out.free()
for name in MATS: me.materials.append(bpy.data.materials.get(name) or bpy.data.materials.new(name))
for p in me.polygons: p.use_smooth = False
ob = bpy.data.objects.new('Bahnhofbruecke_lowpoly', me)
ob['source'] = 'After teammate model Bahnhofbruecke.blend v1.0 (approximate, not surveyed); deck surface = land cover'
coll('Bridges').objects.link(ob)
me.calc_loop_triangles()
print('bridge tris', len(me.loop_triangles), 'railing m', round(rail_len), 'ends', round(u0, 1), round(u1, 1))
