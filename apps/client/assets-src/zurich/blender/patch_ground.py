import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Replace a rectangle of Ground (in a local frame) by a clean grid patch, welded to its surroundings.

patch_rect(O, d, u0, u1, v0, v1, z_at_u1=None, step=1.0):
  O/d: frame origin (2D) and direction (+u); rectangle u0..u1 x v0..v1.
  Heights: blend from the surrounding ground at the u0 edge to z_at_u1 at the u1 edge (or to the
  surrounding ground there if None). Edge vertices are snapped to the neighbouring ground vertices.
"""
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

def patch_rect(O, d, u0, u1, v0, v1, z_at_u1=None, step=1.0, material='G_Paved'):
    d = Vector((d.x, d.y)).normalized(); n = Vector((-d.y, d.x))
    to_w = lambda u, v, z=0.0: Vector((O.x + d.x * u + n.x * v, O.y + d.y * u + n.y * v, z))
    to_l = lambda p: ((p.to_2d() - O.to_2d()).dot(d), (p.to_2d() - O.to_2d()).dot(n))
    g = bpy.data.objects['Ground']; me = g.data
    names = [m.name for m in me.materials]; wi = names.index('G_Water'); mi = names.index(material)
    bm = bmesh.new(); bm.from_mesh(me)
    def overlaps(f):
        ls = [to_l(v.co) for v in f.verts]
        return min(l[0] for l in ls) < u1 and max(l[0] for l in ls) > u0 and min(l[1] for l in ls) < v1 and max(l[1] for l in ls) > v0
    faces = [f for f in bm.faces if f.material_index != wi and overlaps(f)]
    geom = list({*faces, *(e for f in faces for e in f.edges), *(v for f in faces for v in f.verts)})
    o0 = to_w(0, 0); du = (to_w(1, 0) - o0).normalized(); dv = (to_w(0, 1) - o0).normalized()
    for co, no in ((to_w(u0, 0), du), (to_w(u1, 0), du), (to_w(0, v0), dv), (to_w(0, v1), dv)):
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-4)
        geom = [x for x in res['geom'] if x.is_valid]
    doomed = [f for f in geom if isinstance(f, bmesh.types.BMFace) and (lambda l: u0 + 1e-3 < l[0] < u1 - 1e-3 and v0 + 1e-3 < l[1] < v1 - 1e-3)(to_l(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # surrounding heights (open-edge vertices on the rectangle border)
    rim = [v for v in bm.verts if any(len(e.link_faces) == 1 for e in v.link_edges)
           and (lambda l: u0 - 0.05 <= l[0] <= u1 + 0.05 and v0 - 0.05 <= l[1] <= v1 + 0.05)(to_l(v.co))]
    kd = KDTree(max(1, len(rim)))
    for i, v in enumerate(rim): kd.insert((v.co.x, v.co.y, 0), i)
    kd.balance()
    def rim_z(p, default):
        if not rim: return default
        co, i, dist = kd.find((p.x, p.y, 0))
        return rim[i].co.z if dist < 3.0 else default
    nu, nv = max(1, round((u1 - u0) / step)), max(1, round((v1 - v0) / step))
    grid = {}
    for i in range(nu + 1):
        for j in range(nv + 1):
            u = u0 + (u1 - u0) * i / nu; v = v0 + (v1 - v0) * j / nv
            z_a = rim_z(to_w(u0, v), 0.0)
            z_b = z_at_u1 if z_at_u1 is not None else rim_z(to_w(u1, v), z_a)
            t = i / nu
            z = z_a + (z_b - z_a) * t
            if j in (0, nv):  # long sides follow the neighbouring ground
                z = rim_z(to_w(u, v), z)
            grid[i, j] = bm.verts.new(to_w(u, v, z))
    new_faces = []
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1]))
            f.material_index = mi; new_faces.append(f)
            f.normal_update()
            if f.normal.z < 0: f.normal_flip()
    # weld the patch border onto the surrounding open edges
    border = [grid[i, j] for i in range(nu + 1) for j in range(nv + 1) if i in (0, nu) or j in (0, nv)]
    targetmap = {}
    for v in border:
        if not rim: break
        co, k, dist = kd.find((v.co.x, v.co.y, 0))
        if dist < 0.6: v.co = rim[k].co.copy()
    bmesh.ops.remove_doubles(bm, verts=border + rim, dist=0.02)
    uv = bm.loops.layers.uv.active
    if uv:
        for f in new_faces:
            if not f.is_valid: continue
            for l in f.loops: l[uv].uv = (l.vert.co.x / 4, l.vert.co.y / 4)
    bm.to_mesh(me); bm.free(); me.update()
    return len(doomed), len(new_faces)
