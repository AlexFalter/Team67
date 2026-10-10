import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Walk-in Polybahn station halls (bottom: Central building B_140004, top: B_302040285).

Both real stations are alike: the inclined track ends inside a hall, a stepped platform runs
beside it up/down to street level, a small lobby sits at the door. Per station this script
- cuts the building shell: a door opening (facade above stays), the hall volume, and the track
  opening in the end wall; hidden footprint ground inside the hall is removed
- builds 'Polybahn_halls': interior side/end walls (with the openings), ceiling, lobby slab,
  17 cm steps beside the track and a sloped track bed (the track itself comes from build_polybahn)
Runs from build_polybahn.py (needs its P0/d1/zW/zE and the track path).
"""
import bmesh, math, json
from mathutils import Vector

STEP = 0.17
tr = bpy.data.objects['Polybahn_track']
pa = [Vector(p) for p in json.loads(tr['path_a'])]  # rail-top heights (+0.4 over the bed line)

def frame(O, d):
    d = Vector((d.x, d.y)).normalized(); n = Vector((-d.y, d.x))
    to_w = lambda u, v, z: Vector((O.x + d.x * u + n.x * v, O.y + d.y * u + n.y * v, z))
    to_l = lambda p: ((p.to_2d() - O.to_2d()).dot(d), (p.to_2d() - O.to_2d()).dot(n), p.z)
    return to_w, to_l

def cut_building(name, to_l, to_w, boxes):
    ob = bpy.data.objects[name]; bm = bmesh.new(); bm.from_mesh(ob.data)
    removed = 0
    for (u0, u1, v0, v1, z0, z1) in boxes:
        inside = lambda p: u0 < p[0] < u1 and v0 < p[1] < v1 and z0 < p[2] < z1
        def touches(f):
            ls = [to_l(v.co) for v in f.verts]
            return not (max(l[0] for l in ls) < u0 or min(l[0] for l in ls) > u1 or max(l[1] for l in ls) < v0 or
                        min(l[1] for l in ls) > v1 or max(l[2] for l in ls) < z0 or min(l[2] for l in ls) > z1)
        faces = [f for f in bm.faces if touches(f)]
        geom = list({*faces, *(e for f in faces for e in f.edges), *(v for f in faces for v in f.verts)})
        a, b = to_w(0, 0, 0), to_w(1, 0, 0); du = (b - a).normalized(); dv = Vector((-du.y, du.x, 0))
        for co, no in ((to_w(u0, 0, 0), du), (to_w(u1, 0, 0), du), (to_w(0, v0, 0), dv), (to_w(0, v1, 0), dv),
                       (Vector((0, 0, z0)), Vector((0, 0, 1))), (Vector((0, 0, z1)), Vector((0, 0, 1)))):
            res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-4)
            geom = [g for g in res['geom'] if g.is_valid]
        doomed = [g for g in geom if isinstance(g, bmesh.types.BMFace) and inside(to_l(g.calc_center_median()))]
        bmesh.ops.delete(bm, geom=doomed, context='FACES'); removed += len(doomed)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return removed

def clear_footprint_ground(to_l, u0, u1, v0, v1, all_ground=True):
    """Ground inside the hall outline goes: cut exactly along the outline first (big triangles crossing
    the walls would otherwise poke into the hall), then remove every non-water face inside."""
    g = bpy.data.objects['Ground']; gmm = g.data
    wi_ = [m.name for m in gmm.materials].index('G_Water')
    bm = bmesh.new(); bm.from_mesh(gmm)
    def near(f):  # face bbox (in the hall frame) overlaps the hall box: catches big triangles spanning it
        ls = [to_l(v.co) for v in f.verts]
        return (min(l[0] for l in ls) < u1 and max(l[0] for l in ls) > u0 and
                min(l[1] for l in ls) < v1 and max(l[1] for l in ls) > v0)
    faces = [f for f in bm.faces if f.material_index != wi_ and near(f)]
    geom = list({*faces, *(e for f in faces for e in f.edges), *(v for f in faces for v in f.verts)})
    o = to_l(Vector((0, 0, 0)))  # frame helpers: rebuild world points for the plane origins
    for (u_, v_, axis) in ((u0, None, 'u'), (u1, None, 'u'), (None, v0, 'v'), (None, v1, 'v')):
        p0 = to_w(u_ if u_ is not None else 0, v_ if v_ is not None else 0, 0)
        p1 = to_w((u_ if u_ is not None else 0) + (1 if axis == 'u' else 0), (v_ if v_ is not None else 0) + (1 if axis == 'v' else 0), 0)
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=p0, plane_no=(p1 - p0).normalized(), dist=1e-4)
        geom = [x for x in res['geom'] if x.is_valid]
    doomed = [f for f in geom if isinstance(f, bmesh.types.BMFace) and f.material_index != wi_ and
              (lambda l: u0 < l[0] < u1 and v0 < l[1] < v1)(to_l(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(gmm); bm.free(); gmm.update()
    return len(doomed)

hall = bmesh.new()
HMATS = ['G_StationWall', 'G_StationFloor', 'G_Concrete']
WALLM, FLOORM, CEILM = range(3)
def hquad(pts, mat, facing):
    f = hall.faces.new([hall.verts.new(p) for p in pts]); f.material_index = mat; f.normal_update()
    if f.normal.dot(facing) < 0: f.normal_flip()
def hbox(to_w, u0, u1, v0, v1, zb, zt0, zt1=None, mat=FLOORM):
    """Closed box; top may slope from zt0 (at u0) to zt1 (at u1)."""
    zt1 = zt0 if zt1 is None else zt1
    lo = [to_w(u0, v0, zb), to_w(u1, v0, zb), to_w(u1, v1, zb), to_w(u0, v1, zb)]
    hi = [to_w(u0, v0, zt0), to_w(u1, v0, zt1), to_w(u1, v1, zt1), to_w(u0, v1, zt0)]
    c = sum(lo + hi, Vector()) / 8
    for pts in (hi, lo) + tuple((lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]) for i in range(4)):
        f = hall.faces.new([hall.verts.new(p) for p in pts]); f.material_index = mat; f.normal_update()
        if f.normal.dot(f.calc_center_median() - c) < 0: f.normal_flip()
def end_wall(to_w, u, v0, v1, zl, zc, opening, inward):
    ov0, ov1, oz0, oz1 = opening
    for a0, a1, b0, b1 in ((v0, ov0, zl, zc), (ov1, v1, zl, zc), (ov0, ov1, oz1, zc), (ov0, ov1, zl, oz0)):
        if a1 - a0 > 0.01 and b1 - b0 > 0.01:
            hquad([to_w(u, a0, b0), to_w(u, a1, b0), to_w(u, a1, b1), to_w(u, a0, b1)], WALLM, inward)

def build_hall(building, to_w, to_l, d3, door_u, track_u, v0, v1, zs, track_z, zc, door, track_open,
               stairs, lobby, bed, buffer, all_ground=False):
    """door_u/track_u: inner faces of the two end walls (u); door/track_open: (v0, v1, z0, z1) openings."""
    zl = min(zs, track_z(track_u)) - 0.6
    sgn = 1 if door_u < track_u else -1      # +u points from the door towards the track end
    removed = 0 if building is None else cut_building(building, to_l, to_w, [
        (min(door_u, door_u - sgn * 1.4), max(door_u, door_u - sgn * 1.4), door[0], door[1], door[2] - 0.3, door[3]),
        (min(track_u, track_u + sgn * 1.4), max(track_u, track_u + sgn * 1.4), track_open[0], track_open[1], track_open[2], track_open[3]),
        (min(door_u, track_u), max(door_u, track_u), v0, v1, zl, zc)])
    cleared = clear_footprint_ground(to_l, min(door_u, track_u), max(door_u, track_u), v0, v1)  # interior only: walls stand on intact ground
    nrm_v = lambda s: (to_w(0, s, 0) - to_w(0, 0, 0)).normalized()
    hquad([to_w(door_u, v0, zl), to_w(track_u, v0, zl), to_w(track_u, v0, zc), to_w(door_u, v0, zc)], WALLM, nrm_v(1))
    hquad([to_w(door_u, v1, zl), to_w(track_u, v1, zl), to_w(track_u, v1, zc), to_w(door_u, v1, zc)], WALLM, nrm_v(-1))
    hquad([to_w(door_u, v0, zc), to_w(track_u, v0, zc), to_w(track_u, v1, zc), to_w(door_u, v1, zc)], CEILM, Vector((0, 0, -1)))
    end_wall(to_w, door_u, v0, v1, zl, zc, door, d3 * sgn)
    end_wall(to_w, track_u, v0, v1, zl, zc, track_open, -d3 * sgn)
    # lobby slab, buffer floor, sloped track bed, steps
    for (ua, ub, va, vb) in lobby + buffer: hbox(to_w, min(ua, ub), max(ua, ub), va, vb, zl, zs)
    ua, ub, va, vb = bed
    k = max(1, round(abs(ub - ua)))
    for i in range(k):
        a, b = ua + (ub - ua) * i / k, ua + (ub - ua) * (i + 1) / k
        hbox(to_w, min(a, b), max(a, b), va, vb, zl, track_z(min(a, b)) + 0.12, track_z(max(a, b)) + 0.12, CEILM)
    ua, ub, va, vb, z_from, z_to = stairs  # from (ua, z_from) to (ub, z_to)
    n = max(1, math.ceil(abs(z_to - z_from) / STEP)); run = (ub - ua) / n
    for i in range(n):
        a, b = ua + run * i, ua + run * (i + 1)
        hbox(to_w, min(a, b), max(a, b), va, vb, zl, z_from + (z_to - z_from) * (i + 1) / n)
    return removed, cleared, n

report = []
# ---- bottom: Central. Frame O = track start at the building's east wall, +u = uphill (east)
to_w, to_l = frame(P0, d1)
k1 = (zE - zW) / max((P1 - P0).length, 1e-6)
tz_b = lambda u: zW + k1 * u
dbv = bpy.data.objects[BOTTOM + '_s']
from mathutils.bvhtree import BVHTree
bvb = BVHTree.FromObject(dbv, bpy.context.evaluated_depsgraph_get())
h = bvb.ray_cast(to_w(-60, 0, tz_b(0) + 0.5), Vector((d1.x, d1.y, 0)))  # above the doorway: works on an already-cut building too
facade_u = to_l(h[0])[0] if h[0] else -27.7
zs_b = gz(to_w(facade_u - 2.5, 0, 0)) or 8.6
door_u, track_u = facade_u + 0.6, -0.4
DOOR_V = 1.5  # entrance centred north of the track line (the neighbour to the south sticks out)
BV0, BV1 = -3.0, 5.6  # roomy hall: track + wide stepped platform
hall_res = build_hall(BOTTOM + '_s', to_w, to_l, Vector((d1.x, d1.y, 0)), door_u, track_u, BV0, BV1, zs_b, tz_b, tz_b(0) + 6.0,
               door=(DOOR_V - 2.8, DOOR_V + 2.8, zs_b, zs_b + 4.2), track_open=(-2.0, 2.0, tz_b(0) - 0.5, tz_b(0) + 4.8),
               stairs=(door_u + 6.0, track_u, 1.6, BV1, zs_b, tz_b(track_u) + 0.4),
               lobby=[(door_u, door_u + 6.0, BV0, BV1)], bed=(-18.0, track_u, BV0, 1.6),
               buffer=[(door_u + 6.0, -18.0, BV0, 1.6)])
report.append(('bottom', 'facade u', round(facade_u, 1), 'street', round(zs_b, 2), 'removed', hall_res[0], 'ground', hall_res[1], 'steps', hall_res[2]))
# threshold apron: bridges the cut wall and slopes evenly from the street to the lobby floor (no step, no gap)
z_out_b = gz(to_w(facade_u - 1.2, DOOR_V, 0)) or zs_b
hbox(to_w, facade_u - 1.2, door_u + 0.3, DOOR_V - 3.3, DOOR_V + 3.3, min(zs_b, z_out_b) - 0.6, z_out_b, zs_b)
BOTTOM_ENTRANCE = (to_w(facade_u, DOOR_V, 0), zs_b)

# ---- top: our own (bigger) half-timbered station house; frame O = outdoor track end, +u = uphill
E = pa[-1 - int(IN_TOP)]; E0 = pa[-2 - int(IN_TOP)]
d2t = (E - E0).to_2d().normalized(); ke = (E.z - E0.z) / max((E - E0).to_2d().length, 1e-6)
to_w, to_l = frame(E, d2t)
tz_t = lambda u: (E.z - 0.4) + ke * u
old_top = bpy.data.objects.get(TOP)
if old_top and replaced not in old_top.users_collection:
    for col in list(old_top.users_collection): col.objects.unlink(old_top)
    replaced.objects.link(old_top)
old_s = bpy.data.objects.get(TOP + '_s')
if old_s: m_ = old_s.data; bpy.data.objects.remove(old_s); bpy.data.meshes.remove(m_)
TU0, TU1, TV0, TV1 = -1.0, 19.0, -3.6, 4.8      # inner hall (u along the track, v across)
WALL_T = 0.3
zs_t = gz(to_w(TU1 + 2.5, 0.6, 0)) or 49.4      # terrace level outside the door
zc_t = zs_t + 4.4
track_u, door_u = TU0, TU1
stair_end = min(door_u - 5.0, IN_TOP + 3.0)
hall_res = build_hall(None, to_w, to_l, Vector((d2t.x, d2t.y, 0)), door_u, track_u, TV0, TV1, zs_t, tz_t, zc_t,
               door=(-1.6, 1.6, zs_t, zs_t + 3.2), track_open=(-2.0, 2.0, tz_t(track_u) - 0.5, tz_t(track_u) + 4.8),
               stairs=(track_u, stair_end, 1.6, TV1, tz_t(track_u) + 0.4, zs_t),
               lobby=[(stair_end, door_u, TV0, TV1)], bed=(track_u - WALL_T - 0.5, IN_TOP, TV0, 1.6),
               buffer=[(IN_TOP, stair_end, TV0, 1.6)], all_ground=True)
report.append(('top station house', 'terrace', round(zs_t, 2), 'steps', hall_res[2]))
# exterior shell: stone plinth below terrace level, half-timbering above, openings with reveals
sh = bmesh.new()
SMATS = ['G_Timber', 'G_StonePlinth', 'G_LandmarkRoof', 'G_StationSign']
TIM, PLI, ROO, SSG = range(4)
def squad(pts, mat, facing):
    f = sh.faces.new([sh.verts.new(p) for p in pts]); f.material_index = mat; f.normal_update()
    if f.normal.dot(facing) < 0: f.normal_flip()
zb = min(tz_t(TU0) - 1.5, zs_t - 1.0)
z_e = zc_t + WALL_T
ou0, ou1, ov0, ov1 = TU0 - WALL_T, TU1 + WALL_T, TV0 - WALL_T, TV1 + WALL_T
du3 = Vector((d2t.x, d2t.y, 0)); dv3 = Vector((-d2t.y, d2t.x, 0))
def wall_rect(u, v, a0, a1, z0, z1, along_v, facing):
    for za, zb_, mat in ((z0, min(z1, zs_t), PLI), (max(z0, zs_t), z1, TIM)):
        if zb_ - za < 0.01: continue
        if along_v: squad([to_w(u, a0, za), to_w(u, a1, za), to_w(u, a1, zb_), to_w(u, a0, zb_)], mat, facing)
        else: squad([to_w(a0, v, za), to_w(a1, v, za), to_w(a1, v, zb_), to_w(a0, v, zb_)], mat, facing)
def wall_with_opening(u, op, facing, inner_u):
    o0, o1, oz0, oz1 = op
    for a0, a1, z0, z1 in ((ov0, o0, zb, z_e), (o1, ov1, zb, z_e), (o0, o1, oz1, z_e), (o0, o1, zb, oz0)):
        if a1 - a0 > 0.01 and z1 - z0 > 0.01: wall_rect(u, None, a0, a1, z0, z1, True, facing)
    # reveals (wall thickness around the opening)
    for (pa_, pb_, fac) in (((o0, oz0), (o0, oz1), dv3), ((o1, oz0), (o1, oz1), -dv3)):
        squad([to_w(u, pa_[0], pa_[1]), to_w(inner_u, pa_[0], pa_[1]), to_w(inner_u, pb_[0], pb_[1]), to_w(u, pb_[0], pb_[1])], PLI, fac)
    squad([to_w(u, o0, oz1), to_w(u, o1, oz1), to_w(inner_u, o1, oz1), to_w(inner_u, o0, oz1)], TIM, Vector((0, 0, -1)))
    squad([to_w(u, o0, oz0), to_w(u, o1, oz0), to_w(inner_u, o1, oz0), to_w(inner_u, o0, oz0)], PLI, Vector((0, 0, 1)))  # sill: no view into the wall
wall_rect(None, ov0, ou0, ou1, zb, z_e, False, -dv3)
wall_rect(None, ov1, ou0, ou1, zb, z_e, False, dv3)
wall_with_opening(ou0, (-2.0, 2.0, tz_t(TU0) - 0.5, tz_t(TU0) + 4.8), -du3, TU0)
wall_with_opening(ou1, (-1.6, 1.6, zs_t, zs_t + 3.2), du3, TU1)
# thick gabled roof along the track (ridge along u), overhang 0.6 m, slab 0.35 m
vm = (ov0 + ov1) / 2; rise = 3.4; OH = 0.6; RT = 0.35
for vs, ve in ((ov0 - OH, vm), (ov1 + OH, vm)):
    slope_z = lambda v: z_e + rise * (1 - abs(v - vm) / (abs(vs - vm) - 0))
    corners = lambda dz: [to_w(ou0 - OH, vs, z_e - rise * OH / abs(vs - vm) + dz), to_w(ou1 + OH, vs, z_e - rise * OH / abs(vs - vm) + dz),
                          to_w(ou1 + OH, ve, z_e + rise + dz), to_w(ou0 - OH, ve, z_e + rise + dz)]
    top_, bot = corners(RT), corners(0.0)
    cen = sum(top_ + bot, Vector()) / 8
    for pts in [top_, bot] + [(bot[i], bot[(i + 1) % 4], top_[(i + 1) % 4], top_[i]) for i in range(4)]:
        f = sh.faces.new([sh.verts.new(p) for p in pts]); f.material_index = ROO; f.normal_update()
        if f.normal.dot(f.calc_center_median() - cen) < 0: f.normal_flip()
# gable triangles (half-timbering) and the SEILBAHN board on the terrace gable
for u, fac in ((ou0, -du3), (ou1, du3)):
    squad([to_w(u, ov0, z_e), to_w(u, ov1, z_e), to_w(u, vm, z_e + rise)], TIM, fac)  # tip meets the ridge underside
board = [to_w(ou1 + 0.12, -2.6, z_e - 0.3), to_w(ou1 + 0.12, 2.6, z_e - 0.3), to_w(ou1 + 0.12, 2.6, z_e + 0.7), to_w(ou1 + 0.12, -2.6, z_e + 0.7)]
squad(board, SSG, du3)
sh.normal_update()
uvs = sh.loops.layers.uv.new('UVMap')
for f in sh.faces:
    nn = f.normal
    if f.material_index == SSG:
        ts = [(l.vert.co.to_2d().dot(Vector((-nn.y, nn.x)))) for l in f.loops]; zs_ = [l.vert.co.z for l in f.loops]
        for l, tv, zv in zip(f.loops, ts, zs_):
            l[uvs].uv = ((tv - min(ts)) / (max(ts) - min(ts)), (zv - min(zs_)) / (max(zs_) - min(zs_)))
        continue
    sc = 3.0 if f.material_index == TIM else 2.0
    for l in f.loops:
        c_ = l.vert.co
        if abs(nn.z) > 0.7 or f.material_index == ROO:
            hd = Vector((-nn.y, nn.x, 0)).normalized() if nn.to_2d().length > 1e-3 else Vector((1, 0, 0))
            l[uvs].uv = (c_.dot(hd) / sc, c_.dot(nn.cross(hd).normalized()) / sc)
        else: l[uvs].uv = ((c_.x * -nn.y + c_.y * nn.x) / sc, c_.z / sc)
old = bpy.data.objects.get('Polybahn_topstation')
if old and old.get('keep'):
    sh.free(); print('Polybahn_topstation kept (manual edit)')
else:
    if old: m_ = old.data; bpy.data.objects.remove(old); bpy.data.meshes.remove(m_)
    me_ = bpy.data.meshes.new('Polybahn_topstation'); sh.to_mesh(me_); sh.free()
    for m in SMATS: me_.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    for p_ in me_.polygons: p_.use_smooth = False
    bpy.data.collections['Polybahn'].objects.link(bpy.data.objects.new('Polybahn_topstation', me_))
# threshold apron across the whole terrace wall: lobby floor -> terrace, covers the cut ground strip
# flush apron (bridges the wall gap at lobby height) + terrace ground eased up/down to meet it over 5 m
hbox(to_w, TU1 - 0.3, ou1 + 1.2, ov0 - 0.4, ov1 + 0.4, zs_t - 0.8, zs_t, zs_t)
def ease_ground(u_from, u_to, va, vb, fade, z_target, step=0.75):
    g_ = bpy.data.objects['Ground']; gmm = g_.data
    smooth = lambda x: x * x * (3 - 2 * x)
    # 1. give the patch enough vertices: cut it into a grid (u lines start exactly at the apron edge)
    gb_ = bmesh.new(); gb_.from_mesh(gmm)
    inside = lambda f: any(u_from - 1 < l[0] < u_to + 1 and va - fade - 1 < l[1] < vb + fade + 1 for l in (to_l(x.co) for x in f.verts))
    faces = [f for f in gb_.faces if inside(f)]
    geom = list({*faces, *(e for f in faces for e in f.edges), *(x for f in faces for x in f.verts)})
    o0 = to_w(0, 0, 0); du_ = (to_w(1, 0, 0) - o0).normalized(); dv_ = (to_w(0, 1, 0) - o0).normalized()
    cuts = [(to_w(u_from + k * step, 0, 0), du_) for k in range(int((u_to - u_from) / step) + 1)] + \
           [(to_w(0, va - fade + k * step, 0), dv_) for k in range(int((vb - va + 2 * fade) / step) + 1)]
    for co, no in cuts:
        res = bmesh.ops.bisect_plane(gb_, geom=geom, plane_co=co, plane_no=no, dist=1e-4)
        geom = [x for x in res['geom'] if x.is_valid]
    gb_.to_mesh(gmm); gb_.free()
    # 2. ease heights towards the lobby floor (full at the apron edge, fading out over u and at the sides)
    n_ = 0
    for v in gmm.vertices:
        u, vv, _ = to_l(v.co)
        if not (u_from - 0.05 <= u <= u_to and va - fade <= vv <= vb + fade): continue
        wu = 1 - (u - u_from) / (u_to - u_from)
        wv = 1.0 if va <= vv <= vb else 1 - min(abs(vv - va), abs(vv - vb)) / fade
        w = smooth(max(0.0, min(1.0, wu))) * smooth(max(0.0, min(1.0, wv)))
        v.co.z += (z_target - v.co.z) * w; n_ += 1
    gmm.update(); return n_
eased = ease_ground(ou1 + 1.2, ou1 + 6.0, ov0 - 0.4, ov1 + 0.4, 2.0, zs_t)
report.append(('top threshold: terrace ground eased', eased))
# keep the station and its doorway free of trees (build_trees applies the same keep-out)
gone_trees = []
for tr_ in list(bpy.data.collections['Trees'].objects):
    u, vv, _ = to_l(tr_.location)
    if ou0 - 4 < u < ou1 + 6 and ov0 - 4 < vv < ov1 + 4:
        gone_trees.append(tr_.name); bpy.data.objects.remove(tr_)
report.append(('trees removed around the top station', len(gone_trees)))
TOP_ENTRANCE = (to_w(ou1, 0, 0), zs_t)

hall.normal_update()
uvl = hall.loops.layers.uv.new('UVMap')
for f in hall.faces:
    nn = f.normal
    for l in f.loops:
        co_ = l.vert.co
        l[uvl].uv = (co_.x / 2.8, co_.y / 2.8) if abs(nn.z) > 0.7 else ((co_.x * -nn.y + co_.y * nn.x) / 2.8, co_.z / 2.8)
old = bpy.data.objects.get('Polybahn_halls')
if old and old.get('keep'):
    hall.free(); print('Polybahn_halls kept (manual edit)')
else:
  if old: m = old.data; bpy.data.objects.remove(old); bpy.data.meshes.remove(m)
  me = bpy.data.meshes.new('Polybahn_halls'); hall.to_mesh(me); hall.free()
  for m in HMATS: me.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
  for p in me.polygons: p.use_smooth = False
  bpy.data.collections['Polybahn'].objects.link(bpy.data.objects.new('Polybahn_halls', me))
for line in report: print(line)
