import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Gameplay clean-up in front of the HB (re-runnable).

- forecourt between the HB facade and the riverside pavement (trees stay): one flat plane
  (fitted through the area's edge vertices, so the borders join), road texture everywhere
- tram-rail land cover on the streets around the HB -> road (the track field west of the hall stays)
"""
import bmesh
from mathutils import Vector, Matrix

X_FACADE = -206.0          # HB east facade (package bbox)
Y_RANGE = (-78.0, 112.0)   # Bahnhofbrücke approach .. north end of the HB
RIVER_PAVEMENT = 7.0       # keep this much next to the water (the tree-lined pavement)
RAIL_TO_ROAD = (-270.0, -60.0, -130.0, 200.0)  # x0, x1, y0, y1: rails here are tram tracks on streets

g = bpy.data.objects['Ground']; me = g.data
names = [m.name for m in me.materials]
wi, ri, roadi = names.index('G_Water'), names.index('G_Rail'), names.index('G_Road')
bm = bmesh.new(); bm.from_mesh(me)

# west bank of the Limmat per 5 m band of y
bands = {}
for f in bm.faces:
    if f.material_index != wi: continue
    c = f.calc_center_median()
    if c.x < -200 or not Y_RANGE[0] - 10 < c.y < Y_RANGE[1] + 10: continue
    k = int((c.y + 1000) // 5)
    bands[k] = min(bands.get(k, 1e9), min(v.co.x for v in f.verts))
def x_limit(y):
    ks = [bands[k] for k in (int((y + 1000) // 5) + d for d in (-1, 0, 1)) if k in bands]
    return (min(ks) if ks else -120.0) - RIVER_PAVEMENT

area = {f for f in bm.faces if f.material_index != wi and Y_RANGE[0] < f.calc_center_median().y < Y_RANGE[1]
        and X_FACADE < f.calc_center_median().x < x_limit(f.calc_center_median().y)}
verts = {v for f in area for v in f.verts}
edge = [v for v in verts if any(o not in area for o in v.link_faces)]
# plane z = a + b x + c y through the edge vertices (least squares)
S = Matrix(((0.0,) * 3,) * 3); r = Vector((0.0, 0.0, 0.0))
for v in edge:
    row = Vector((1.0, v.co.x, v.co.y))
    for i in range(3):
        for j in range(3): S[i][j] += row[i] * row[j]
        r[i] += row[i] * v.co.z
abc = S.inverted_safe() @ r
plane = lambda p: abc[0] + abc[1] * p.x + abc[2] * p.y
edge_set = set(edge)
for v in verts:
    if v not in edge_set: v.co.z = plane(v.co)
for f in area: f.material_index = roadi
x0, x1, y0, y1 = RAIL_TO_ROAD
tram = [f for f in bm.faces if f.material_index == ri and x0 < f.calc_center_median().x < x1 and y0 < f.calc_center_median().y < y1]
for f in tram: f.material_index = roadi
bm.to_mesh(me); bm.free(); me.update()
print('forecourt faces', len(area), 'edge verts', len(edge), 'plane slope % x/y', round(abc[1] * 100, 2), round(abc[2] * 100, 2),
      'tram faces -> road', len(tram))

# small official structures standing on the new forecourt (kiosk / underground entrance roofs) -> Replaced
from mathutils import Vector as _V
rep = bpy.data.collections['Replaced']; gone = []
for o in list(bpy.data.collections['Buildings'].objects):
    bb = [o.matrix_world @ _V(c) for c in o.bound_box]
    c = sum(bb, _V()) / 8; size = max(bb[6].x - bb[0].x, bb[6].y - bb[0].y)
    reach = x_limit(c.y) + (RIVER_PAVEMENT if o.get('art_txt') == 'Unterstand' else 0)  # flat shelters on the pavement too
    if size < 25 and Y_RANGE[0] < c.y < Y_RANGE[1] and X_FACADE + 3 < c.x < reach:
        for col in list(o.users_collection): col.objects.unlink(o)
        rep.objects.link(o); gone.append((o.name, o.get('art_txt')))
        s = bpy.data.objects.get(o.name + '_s')
        if s: m = s.data; bpy.data.objects.remove(s); bpy.data.meshes.remove(m)
print('forecourt structures removed', gone)
