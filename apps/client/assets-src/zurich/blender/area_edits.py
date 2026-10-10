import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Hand-drawn ground fixes from the 2D editor (apps/client/tools/props-editor, Area mode).

edit-areas.json holds numbered polygons in three.js x/z. EDITS below says what happens to each:
- ('ramp', start, end, material): an even slope from the street at `start` to the street at `end`
  (three.js x/z points just outside the polygon ends; their ground heights anchor the slope, so both
  ends join seamlessly), flat across. The ground is first cut along the outline and sliced every
  SLICE m along the axis so the slope is smooth.
- ('even', material): retexture and smooth the heights inside (outline fixed); water and quay kept.
Only the Ground mesh changes (Polybahn track, bridges etc. untouched). Run ground_uv.py afterwards.
"""
import json, math, bmesh
from mathutils import Vector

AREAS = {a['id']: a['points'] for a in json.load(open(os.path.join(ZH_DIR, 'edit-areas.json')))}
EDITS = {
    2: ('ramp', (56.6, 88.6), (77.0, 135.6), 'G_Road'),     # footpath under the Polybahn bridge
    5: ('ramp', (-27.5, -147.5), (-0.5, -148.8), 'G_Road'),   # corridor between the lower and upper street
    3: ('even', 'G_Paved'),                                 # around the Polyterrasse ramp (polyterrasse.py)
    8: ('even', 'G_Road'), 10: ('even', 'G_Road'), 11: ('even', 'G_Road'),
    12: ('even', 'G_Road', ()),                             # Bahnhofplatz: the small water pond becomes street too
}
ONLY = globals().get('ONLY')  # e.g. ONLY = {12} to apply a single edit to the current ground
KEEP = {'G_Water', 'G_Quay'}
SLICE, SMOOTH_ITERS, END, BLEND = 1.5, 40, 1.6, 3.0  # END: outline vertices this close to an end keep their height

g = bpy.data.objects['Ground']; me = g.data
names = [m.name for m in me.materials]
def mat_index(name):
    if name not in names:
        me.materials.append(bpy.data.materials.get(name) or bpy.data.materials.new(name)); names.append(name)
    return names.index(name)

def inside(pts, x, z):
    hit, j = False, len(pts) - 1
    for i in range(len(pts)):
        (xi, zi), (xj, zj) = pts[i], pts[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi: hit = not hit
        j = i
    return hit
B = lambda x, z: Vector((x, -z, 0))  # three x/z -> Blender

def cut_segment(bm, a, b, margin=0.3):
    """Split faces along the vertical plane through a-b (Blender xy), only faces near the segment."""
    lo = Vector((min(a.x, b.x) - margin, min(a.y, b.y) - margin)); hi = Vector((max(a.x, b.x) + margin, max(a.y, b.y) + margin))
    faces = []
    for f in bm.faces:  # bounding-box overlap: catches long triangles that cross the segment
        xs = [v.co.x for v in f.verts]; ys = [v.co.y for v in f.verts]
        if min(xs) <= hi.x and max(xs) >= lo.x and min(ys) <= hi.y and max(ys) >= lo.y: faces.append(f)
    if not faces: return
    d = (b - a).to_3d(); d.z = 0; d.normalize(); nrm = Vector((-d.y, d.x, 0))
    geom = list({e for f in faces for e in f.edges}) + faces + list({v for f in faces for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=a.to_3d(), plane_no=nrm, dist=1e-4)

def faces_in(bm, pts):
    return [f for f in bm.faces if inside(pts, f.calc_center_median().x, -f.calc_center_median().y)]

from mathutils.bvhtree import BVHTree
_orig = BVHTree.FromObject(g, bpy.context.evaluated_depsgraph_get())
def ground_at(p):  # original ground height under a Blender xy point
    r = _orig.ray_cast(Vector((p.x, p.y, 500.0)), Vector((0, 0, -1)))
    return r[0].z if r[0] else None
bm = bmesh.new(); bm.from_mesh(me)
uv = bm.loops.layers.uv['UVMap']
report = {}
for aid, op in EDITS.items():
    if ONLY and aid not in ONLY: continue
    pts = AREAS[aid]
    ring = pts + [pts[0]]
    for (x0, z0), (x1, z1) in zip(ring, ring[1:]): cut_segment(bm, B(x0, z0), B(x1, z1))
    if op[0] == 'ramp':
        _, s, e, mat = op
        a, b = B(*s), B(*e); axis = (b - a); L = axis.length; axis.normalize()
        nrm = Vector((-axis.y, axis.x, 0))
        for k in range(1, int(L / SLICE)):  # slices across the ramp
            c = a + axis * (k * SLICE)
            fs = faces_in(bm, pts)
            if not fs: break
            geom = list({ed for f in fs for ed in f.edges}) + fs + list({v for f in fs for v in f.verts})
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=c.to_3d(), plane_no=axis.to_3d(), dist=1e-4)
        fs = faces_in(bm, pts); fset = set(fs)
        verts = {v for f in fs for v in f.verts}
        tof = lambda v: (v.co.to_2d() - a.to_2d()).dot(axis.to_2d())
        ts = {v: tof(v) for v in verts}; t0, t1 = min(ts.values()), max(ts.values())
        # Seamless by construction: nothing outside the outline moves, the outline vertices at the two
        # street ends keep their original heights, and inside the height blends from the original ground
        # into the even slope over the first/last BLEND m (smoothstep).
        border = {v for v in verts if any(lf not in fset for lf in v.link_faces)}
        h0 = ground_at(a + axis * t0) or min(v.co.z for v in verts)
        h1 = ground_at(a + axis * t1) or max(v.co.z for v in verts)
        for v in verts:
            t = ts[v]; slope = h0 + (h1 - h0) * (t - t0) / max(1e-6, t1 - t0)
            dist = min(t - t0, t1 - t)
            if v in border and dist < END: continue  # joins to the streets: untouched
            w = min(1.0, max(0.0, (dist - END * 0.5) / BLEND)); w = w * w * (3 - 2 * w)
            v.co.z = v.co.z * (1 - w) + slope * w
        mi = mat_index(mat)
        for f in fs: f.material_index = mi
        # leftover footpath fragments just past the two ends become street too
        old_path = mat_index('G_Path')
        for f in {lf for v in border for lf in v.link_faces if lf not in fset and min(ts[v] - t0, t1 - ts[v]) < END}:
            if f.material_index == old_path: f.material_index = mi; fs.append(f)
        e0, e1 = t0, t1
        report[aid] = f'ramp {h0:.2f} -> {h1:.2f} m over {e1 - e0:.1f} m ({100 * (h1 - h0) / max(1e-6, e1 - e0):.0f}%), {len(fs)} faces'
    else:
        mat, keep = op[1], (set(op[2]) if len(op) > 2 else KEEP)
        fs = [f for f in faces_in(bm, pts) if names[f.material_index] not in keep]
        mi = mat_index(mat)
        for f in fs: f.material_index = mi
        fset = set(fs)
        inner = [v for v in {v for f in fs for v in f.verts} if all(lf in fset for lf in v.link_faces)]
        zs0 = {v: v.co.z for v in inner}
        for _ in range(SMOOTH_ITERS if keep else 400):  # Laplacian smoothing of heights, outline vertices fixed
            new = {v: sum(e.other_vert(v).co.z for e in v.link_edges) / max(1, len(v.link_edges)) for v in inner}
            for v, z in new.items(): v.co.z = z
        moved = max((abs(v.co.z - zs0[v]) for v in inner), default=0)
        report[aid] = f'even {mat}: {len(fs)} faces, {len(inner)} inner verts, max height change {moved:.2f} m'
    for f in fs:
        for l in f.loops: l[uv].uv = (l.vert.co.x / 4, l.vert.co.y / 4)
bm.normal_update(); bm.to_mesh(me); bm.free(); me.update()
for k, v in report.items(): print('area', k, v)
