import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Shared helpers for building the Zürich map in Blender (exec'd into each MCP call)."""
import bpy, bmesh, json, time
from mathutils import Vector, geometry

D = ZH_DIR + '/gis/'
# Repo coordinate contract (apps/client/src/maps/zurich/area.json); Blender z-up -> glTF y-up gives Z = ON - N.
OE, ON, OH = 2683475, 1248000, 400
BOUNDS_LV95 = (2682750, 1246500, 2684350, 1248400)
X0, Y0, X1, Y1 = BOUNDS_LV95[0] - OE, BOUNDS_LV95[1] - ON, BOUNDS_LV95[2] - OE, BOUNDS_LV95[3] - ON


def add_rings(bm, rings, cache):
    pts = [[Vector((e - OE, n - ON, h - OH)) for e, n, h in r] for r in rings]
    pts = [p[:-1] if len(p) > 1 and (p[0] - p[-1]).length < 1e-6 else p for p in pts]
    pts = [p for p in pts if len(p) >= 3]
    if not pts:
        return
    flat = [v for r in pts for v in r]
    tris = [(0, 1, 2)] if len(pts) == 1 and len(flat) == 3 else geometry.tessellate_polygon(pts)
    nrm = Vector()
    ext = pts[0]
    for i in range(len(ext)):
        a, b = ext[i], ext[(i + 1) % len(ext)]
        nrm += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))

    def vert(p):
        k = (round(p.x, 3), round(p.y, 3), round(p.z, 3))
        v = cache.get(k)
        if v is None:
            v = cache[k] = bm.verts.new(p)
        return v

    for tri in tris:
        a, b, c = (flat[i] for i in tri)
        cr = (b - a).cross(c - a)
        if cr.length < 1e-6:
            continue
        if cr.dot(nrm) < 0:
            b, c = c, b
        vs = [vert(a), vert(b), vert(c)]
        if len(set(vs)) < 3:
            continue
        try:
            bm.faces.new(vs)
        except ValueError:
            pass
