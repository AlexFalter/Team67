import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Polybahn surroundings (no cars: those become game entities).

- track: single track on the Seilergraben truss bridge, arc into the slope corridor (from the
  official rail land cover), passing loop in the middle (two tracks meeting at both ends);
  sleepers, rails, ballast bed. The centre lines are stored on 'Polybahn_track' (custom props
  'path_a' / 'path_b', [x, y, z] in Blender coords) for the future cable-car entity.
- steel truss bridge replacing the official block B_37668 (-> 'Replaced')
- bottom entrance on the Central building B_140004: red POLYBAHN sign band, two red doors, canopy
- top station B_302040285 (half-timbered via build_buildings TIMBER_BUILDINGS): SEILBAHN sign,
  door and steps on the uphill side
Re-runnable: rebuilds the 'Polybahn' collection.
"""
import bmesh, math, json
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

BRIDGE, BOTTOM, TOP = 'B_37668', 'B_140004', 'B_302040285'
GAUGE, LOOP_SPLIT = 1.0, 1.6            # m; loop tracks sit +-LOOP_SPLIT from the centre line
LOOP_CENTER, LOOP_HALF, LOOP_EASE = 0.55, 18.0, 10.0  # loop centre (fraction of length), half-length, S-curve length
MATS = ['G_Ballast', 'G_Bridge', 'G_Metal', 'G_Truss', 'G_PolyRed', 'G_PolySign', 'G_StationSign']
BALLAST, CONC, METAL, TRUSS, RED, SIGN, SSIGN = range(len(MATS))
scene = bpy.context.scene

coll = bpy.data.collections.get('Polybahn') or bpy.data.collections.new('Polybahn')
if coll.name not in scene.collection.children: scene.collection.children.link(coll)
exec(open(ZH_DIR + '/blender/guard.py').read())  # manual edits: 'Manual Removed' collection, 'keep' property
for o in list(coll.objects):
    if o.get('keep'): continue  # hand-edited: leave as is
    m = o.data; bpy.data.objects.remove(o); bpy.data.meshes.remove(m)

# --- source geometry
src = bpy.data.objects[BRIDGE]
bv = [src.matrix_world @ v.co for v in src.data.vertices]
xmin, xmax = min(v.x for v in bv), max(v.x for v in bv)
west = [v for v in bv if v.x < xmin + 1.0]; east = [v for v in bv if v.x > xmax - 1.0]
P0 = Vector((sum(v.x for v in west) / len(west), sum(v.y for v in west) / len(west)))
P1 = Vector((sum(v.x for v in east) / len(east), sum(v.y for v in east) / len(east)))
zW, zE = max(v.z for v in west), max(v.z for v in east)
replaced = bpy.data.collections.get('Replaced') or bpy.data.collections.new('Replaced')
if replaced.name not in scene.collection.children: scene.collection.children.link(replaced)
if replaced not in src.users_collection:
    for c in list(src.users_collection): c.objects.unlink(src)
    replaced.objects.link(src)
bpy.context.view_layer.layer_collection.children['Replaced'].exclude = True
styled = bpy.data.objects.get(BRIDGE + '_s')
if styled: m = styled.data; bpy.data.objects.remove(styled); bpy.data.meshes.remove(m)

ground = bpy.data.objects['Ground']; gm = ground.data
gnames = [m.name for m in gm.materials]
if 'G_Ballast' not in gnames:
    gm.materials.append(bpy.data.materials.get('G_Ballast') or bpy.data.materials.new('G_Ballast')); gnames.append('G_Ballast')
ri, bi = gnames.index('G_Rail'), gnames.index('G_Ballast')
rail = [p for p in gm.polygons if p.material_index in (ri, bi) and P1.x - 10 < p.center.x < P1.x + 100 and abs(p.center.y - P1.y) < 60]
for p in rail: p.material_index = bi  # corridor ground: gravel instead of the generic rails pattern
cpts = [p.center for p in rail if p.center.x > P1.x + 6]
n = len(cpts); mx = sum(p.x for p in cpts) / n; my = sum(p.y for p in cpts) / n
k = sum((p.x - mx) * (p.y - my) for p in cpts) / sum((p.x - mx) ** 2 for p in cpts)
d1 = (P1 - P0).normalized(); d2 = Vector((1, k)).normalized()
Q = Vector((mx, my)); n2 = Vector((-d2.y, d2.x))
end_x = 172.1  # official rail corridor end (land cover), pinned: later clean-ups eat into that strip
gbvh = BVHTree.FromObject(ground, bpy.context.evaluated_depsgraph_get())
def gz(p):
    h = gbvh.ray_cast(Vector((p.x, p.y, 500)), Vector((0, 0, -1)))
    return h[0].z if h[0] else None

# --- centre line: bridge (straight) -> tangent arc -> corridor line
theta = math.atan2(d1.x * d2.y - d1.y * d2.x, d1.dot(d2))
sgn = 1 if theta >= 0 else -1
nl = Vector((-d1.y, d1.x)) * sgn
step = d1 * math.sin(abs(theta)) + nl * (1 - math.cos(abs(theta)))
den = step.dot(n2)
r = -((P1 - Q).dot(n2)) / den if abs(den) > 1e-6 else 0
r = max(5.0, min(r, 400.0))
centre = P1 + nl * r
pts2 = [P0.lerp(P1, i / max(1, round((P1 - P0).length))) for i in range(round((P1 - P0).length) + 1)]
on_bridge = len(pts2)
arc_len = r * abs(theta)
for i in range(1, max(2, round(arc_len)) + 1):
    a = abs(theta) * i / max(2, round(arc_len))
    pts2.append(P1 + r * (d1 * math.sin(a) + nl * (1 - math.cos(a))))
A = pts2[-1]
dist_end = ((Q + d2 * ((Vector((end_x, Q.y)) - Q).x / d2.x)) - A).dot(d2)
for i in range(1, max(1, round(dist_end)) + 1):
    pts2.append(A + d2 * i)
# heights: deck on the bridge, smoothed rising ground afterwards
zs = []
for i, p in enumerate(pts2):
    if i < on_bridge: zs.append(zW + (zE - zW) * i / max(1, on_bridge - 1))
    else: zs.append(gz(p) if gz(p) is not None else zs[-1])
for i in range(on_bridge, len(zs)):
    w = [zs[j] for j in range(max(on_bridge, i - 4), min(len(zs), i + 5))]
    zs[i] = max(sum(w) / len(w), zs[i - 1])
path = [Vector((p.x, p.y, z)) for p, z in zip(pts2, zs)]
IN_BOTTOM, IN_TOP = 18, 8  # m of track inside the bottom / top station hall
k1 = (zE - zW) / max((P1 - P0).length, 1e-6)
pre = [Vector((P0.x - d1.x * u, P0.y - d1.y * u, zW - k1 * u)) for u in range(IN_BOTTOM, 0, -1)]
e1, e0 = path[-1], path[-2]; de = (e1 - e0).to_2d().normalized(); ke_ = (e1.z - e0.z) / max((e1 - e0).to_2d().length, 1e-6)
post = [Vector((e1.x + de.x * u, e1.y + de.y * u, e1.z + ke_ * u)) for u in range(1, IN_TOP + 1)]
path = pre + path + post
on_bridge += len(pre)
s_acc = [0.0]
for a, b in zip(path, path[1:]): s_acc.append(s_acc[-1] + (b - a).to_2d().length)
L = s_acc[-1]
def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
s_in = IN_BOTTOM
c = s_in + LOOP_CENTER * (L - s_in - IN_TOP)  # loop centred on the outdoor part
def offset(s):
    return LOOP_SPLIT * smooth((s - (c - LOOP_HALF)) / LOOP_EASE) * smooth(((c + LOOP_HALF) - s) / LOOP_EASE)
def frame_at(i):
    a, b = path[max(0, i - 1)], path[min(len(path) - 1, i + 1)]
    t = (b - a).to_2d().normalized()
    return t, Vector((-t.y, t.x))
def track_line(sign):
    out = []
    for i, p in enumerate(path):
        t, nrm = frame_at(i)
        o = sign * offset(s_acc[i])
        out.append(Vector((p.x + nrm.x * o, p.y + nrm.y * o, p.z)))
    return out
lineA, lineB = track_line(1), track_line(-1)

# --- corridor clean-up: no ground poking through the bed, nothing standing in the car's clearance
from mathutils.kdtree import KDTree
kdp = KDTree(len(path))
for i, p in enumerate(path): kdp.insert((p.x, p.y, 0), i)
kdp.balance()
gbm = bmesh.new(); gbm.from_mesh(gm); lowered = 0
R_IN, SLOPE = 1.6 + LOOP_SPLIT + 1.0, 0.6  # flat cap next to the bed, then at most a 60 % slope (no cliffs)
for v in gbm.verts:
    co, i, d = kdp.find((v.co.x, v.co.y, 0))
    cap = path[i].z - 0.05 + max(0.0, d - R_IN) * SLOPE
    if d < R_IN + 8 and v.co.z > cap:
        v.co.z = cap; lowered += 1
gbm.to_mesh(gm); gbm.free(); gm.update()
blockers = []
for o in list(bpy.data.collections['Buildings'].objects):
    if o.name in (BOTTOM, TOP): continue
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        co, i, d = kdp.find((w.x, w.y, 0))
        if d < 2.2 and path[i].z + 0.2 < w.z < path[i].z + 4.5:
            blockers.append(o.name); break
for n in blockers:
    o = bpy.data.objects[n]
    for col in list(o.users_collection): col.objects.unlink(o)
    replaced.objects.link(o)
    s_ = bpy.data.objects.get(n + '_s')
    if s_: m_ = s_.data; bpy.data.objects.remove(s_); bpy.data.meshes.remove(m_)
print('corridor: ground verts lowered', lowered, 'structures in the clearance removed', [(n, bpy.data.objects[n].get('art_txt')) for n in blockers])

# --- mesh helpers
def new_bm(): return bmesh.new()
def quad(bm, vs, mat):
    try:
        f = bm.faces.new([bm.verts.new(v) for v in vs]); f.material_index = mat
        return f
    except ValueError: return None
def beam(bm, a, b, r, mat, up=Vector((0, 0, 1))):
    """Square beam between 3D points a, b (half-size r)."""
    d = (b - a)
    if d.length < 1e-4: return
    d = d.normalized()
    s = d.cross(up)
    if s.length < 1e-3: s = d.cross(Vector((1, 0, 0)))
    s = s.normalized() * r; u = s.cross(d).normalized() * r
    ring = lambda p: [p + s + u, p - s + u, p - s - u, p + s - u]
    ra, rb = ring(a), ring(b)
    centre = (a + b) / 2
    for vs in [(ra[i], ra[(i + 1) % 4], rb[(i + 1) % 4], rb[i]) for i in range(4)] + [ra, rb]:
        try:
            f = bm.faces.new([bm.verts.new(x) for x in vs]); f.material_index = mat
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - centre) < 0: f.normal_flip()
        except ValueError: pass
def finish(bm, name, mats=MATS):
    if kept(name):
        bm.free(); print(name, 'kept (manual edit)'); return bpy.data.objects[name]
    # closed parts (boxes/beams) outward: the game renders single-sided
    seen = set()
    for f in list(bm.faces):
        if f in seen: continue
        part, stack = [], [f]; seen.add(f)
        while stack:
            c = stack.pop(); part.append(c)
            for e in c.edges:
                for o in e.link_faces:
                    if o not in seen: seen.add(o); stack.append(o)
        if all(len(e.link_faces) == 2 for p in part for e in p.edges): bmesh.ops.recalc_face_normals(bm, faces=part)
    bm.normal_update()
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        nrm = f.normal
        for l in f.loops:
            co = l.vert.co
            l[uv].uv = (co.x / 4, co.y / 4) if abs(nrm.z) > 0.7 else ((co.x * -nrm.y + co.y * nrm.x) / 4, co.z / 4)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    for p in me.polygons: p.use_smooth = False
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob

# --- track
bm = new_bm()
s_bridge = s_acc[on_bridge - 1]
# ballast bed (after the bridge), widening around the loop
left, right = [], []
for i, p in enumerate(path):
    if s_acc[i] < s_bridge - 0.5 or s_acc[i] > L - IN_TOP + 0.5: continue  # no gravel inside the halls
    t, nrm = frame_at(i)
    w = 1.6 + offset(s_acc[i])
    left.append(Vector((p.x, p.y, p.z + 0.12)) + Vector((nrm.x, nrm.y, 0)) * w)
    right.append(Vector((p.x, p.y, p.z + 0.12)) - Vector((nrm.x, nrm.y, 0)) * w)
for i in range(len(left) - 1):
    quad(bm, (right[i], right[i + 1], left[i + 1], left[i]), BALLAST)
    quad(bm, (left[i], left[i + 1], left[i + 1] - Vector((0, 0, 1.5)), left[i] - Vector((0, 0, 1.5))), BALLAST)  # deep skirt: no view under the bed
    quad(bm, (right[i + 1], right[i], right[i] - Vector((0, 0, 1.5)), right[i + 1] - Vector((0, 0, 1.5))), BALLAST)
def lay_track(line, s_from, s_to):
    base = 0.12
    # sleepers every metre
    s_next = s_from
    for i in range(len(line) - 1):
        if not (s_from <= s_acc[i] <= s_to): continue
        a, b = line[i], line[i + 1]
        seg = s_acc[i + 1] - s_acc[i]
        t = (b - a).to_2d().normalized(); nrm = Vector((-t.y, t.x, 0))
        while s_next <= s_acc[i + 1] and s_next <= s_to:
            p = a.lerp(b, (s_next - s_acc[i]) / max(seg, 1e-6))
            beam(bm, p - nrm * 0.9 + Vector((0, 0, base + 0.07)), p + nrm * 0.9 + Vector((0, 0, base + 0.07)), 0.09, CONC)
            s_next += 1.0
        for side in (-1, 1):  # rails
            o = nrm * (GAUGE / 2) * side
            beam(bm, a + o + Vector((0, 0, base + 0.22)), b + o + Vector((0, 0, base + 0.22)), 0.045, METAL)
lay_track(lineA, 0, L)
lay_track(lineB, c - LOOP_HALF, c + LOOP_HALF)
track = finish(bm, 'Polybahn_track')
track['path_a'] = json.dumps([[round(v.x, 2), round(v.y, 2), round(v.z + 0.4, 2)] for v in lineA])
track['path_b'] = json.dumps([[round(v.x, 2), round(v.y, 2), round(v.z + 0.4, 2)] for v in lineB])

# --- truss bridge
bm = new_bm()
nb = Vector((-d1.y, d1.x, 0)); db = Vector((d1.x, d1.y, 0))
Lb = (P1 - P0).length
def deck(u): return zW + (zE - zW) * u / Lb
def at(u, y, dz=0.0):
    p = P0 + d1 * u
    return Vector((p.x, p.y, deck(u) + dz)) + nb * y
W2 = 3.0  # half deck width: room for the car between the trusses
for u0, u1 in ((0, Lb),):
    c4 = [at(u0, -W2), at(u1, -W2), at(u1, W2), at(u0, W2)]
    quad(bm, c4, CONC)  # deck top
    quad(bm, [v - Vector((0, 0, 0.6)) for v in reversed(c4)], CONC)
    for a, b in ((c4[0], c4[1]), (c4[1], c4[2]), (c4[2], c4[3]), (c4[3], c4[0])):
        quad(bm, (b, a, a - Vector((0, 0, 0.6)), b - Vector((0, 0, 0.6))), CONC)
panels = max(2, round(Lb / 4))
H = 2.2  # truss sides stay below the car windows; nothing overhead (car runs on top, like the photo)
for y in (-W2 - 0.12, W2 + 0.12):
    beam(bm, at(0, y, -0.25), at(Lb, y, -0.25), 0.13, TRUSS)        # bottom chord
    beam(bm, at(0.3, y, H), at(Lb - 0.3, y, H), 0.12, TRUSS)        # top chord
    for i in range(panels + 1):
        u = Lb * i / panels
        beam(bm, at(u, y, -0.25), at(u, y, H), 0.09, TRUSS)         # verticals
        if i < panels:
            u2 = Lb * (i + 1) / panels
            beam(bm, at(u, y, -0.2), at(u2, y, H - 0.05), 0.06, TRUSS)  # X braces
            beam(bm, at(u, y, H - 0.05), at(u2, y, -0.2), 0.06, TRUSS)
for i in range(0, panels + 1, 2):
    u = Lb * i / panels
    beam(bm, at(u, -W2 - 0.12, -0.75), at(u, W2 + 0.12, -0.75), 0.08, TRUSS)  # cross beams under the deck
finish(bm, 'Polybahn_bridge')

exec(open(ZH_DIR + '/blender/polybahn_stations.py').read())  # halls; defines BOTTOM_ENTRANCE / TOP_ENTRANCE

# --- entrances (placed on the hall doorways)
bm = new_bm()
def wall_box(o, t, nrm, t0, t1, n0, n1, z0, z1, mat, front=None):
    pts = lambda tt, nn, zz: Vector((o.x, o.y, 0)) + t * tt + nrm * nn + Vector((0, 0, zz))
    c = [pts(t0, n0, z0), pts(t1, n0, z0), pts(t1, n1, z0), pts(t0, n1, z0)]
    top = [v + Vector((0, 0, z1 - z0)) for v in c]
    centre = sum(c + top, Vector()) / 8
    faces = [quad(bm, top, mat), quad(bm, list(reversed(c)), mat)]
    for i in range(4):
        j = (i + 1) % 4
        faces.append(quad(bm, (c[i], c[j], top[j], top[i]), front if (front is not None and i == 2) else mat))
    for f in faces:  # outward: the game renders single-sided
        if f is None: continue
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - centre) < 0: f.normal_flip()
    return c, top
def facing(pos, away_dir):
    """Facade frame at the doorway: outward normal = away_dir (pointing out of the building)."""
    nrm = Vector((away_dir.x, away_dir.y, 0)).normalized(); t = Vector((-nrm.y, nrm.x, 0))
    return Vector((pos.x, pos.y, 0)), t, nrm
# bottom: two big open arched doorways (red jambs, centre pillar, arches), large sign band, wide canopy
o, t, nrm = facing(BOTTOM_ENTRANCE[0], -Vector((d1.x, d1.y, 0))); z = BOTTOM_ENTRANCE[1]
wall_box(o, t, nrm, -4.6, 4.6, 0.0, 0.28, z + 4.7, z + 6.0, RED, front=SIGN)
for t0, t1 in ((-3.15, -2.8), (-0.18, 0.18), (2.8, 3.15)):
    wall_box(o, t, nrm, t0, t1, 0.0, 0.16, z, z + 4.2, RED)
for tc in (-1.49, 1.49):
    arch = [o + t * (tc + 1.31 * math.cos(a)) + nrm * 0.12 + Vector((0, 0, z + 4.2 + 0.6 * math.sin(a))) for a in (math.pi * i / 8 for i in range(9))]
    try:
        f = bm.faces.new([bm.verts.new(v) for v in arch]); f.material_index = RED; f.normal_update()
        if f.normal.dot(nrm) < 0: f.normal_flip()
    except ValueError: pass
canopy = [o + t * tt + nrm * nn + Vector((0, 0, zz)) for tt, nn, zz in ((-4.8, 0.3, z + 4.55), (4.8, 0.3, z + 4.55), (4.8, 3.0, z + 4.2), (-4.8, 3.0, z + 4.2))]
quad(bm, canopy, METAL); quad(bm, list(reversed(canopy)), METAL)
for tt in (-4.2, 4.2):
    beam(bm, o + t * tt + nrm * 0.3 + Vector((0, 0, z + 3.3)), o + t * tt + nrm * 2.9 + Vector((0, 0, z + 4.2)), 0.05, METAL)
# top: door frame (the big SEILBAHN board is on the station gable; the threshold apron replaces the old steps)
o, t, nrm = facing(TOP_ENTRANCE[0], Vector((d2t.x, d2t.y, 0))); z = TOP_ENTRANCE[1]
for t0, t1 in ((-1.85, -1.6), (1.6, 1.85)):
    wall_box(o, t, nrm, t0, t1, 0.0, 0.12, z, z + 3.35, METAL)
wall_box(o, t, nrm, -1.85, 1.85, 0.0, 0.12, z + 3.2, z + 3.35, METAL)
st = finish(bm, 'Polybahn_stations')
# sign faces: map the whole texture once across the board front
me = st.data
for p in me.polygons:
    if me.materials[p.material_index].name in ('G_PolySign', 'G_StationSign'):
        vs = [me.vertices[i].co for i in p.vertices]
        nrm = p.normal; t = Vector((-nrm.y, nrm.x, 0)).normalized()
        ts = [v.dot(t) for v in vs]; zs2 = [v.z for v in vs]
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            me.uv_layers['UVMap'].data[li].uv = ((v.dot(t) - min(ts)) / (max(ts) - min(ts)), (v.z - min(zs2)) / (max(zs2) - min(zs2)))
gm.update()
print('track length', round(L, 1), 'bridge', round(Lb, 1), 'arc r', round(r, 1), 'turn', round(math.degrees(theta), 1),
      'loop', round(c - LOOP_HALF), '-', round(c + LOOP_HALF))
