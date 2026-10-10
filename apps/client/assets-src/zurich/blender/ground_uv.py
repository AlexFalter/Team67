import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Box-project the Ground UVs so steep terrain keeps the same pixel size as flat terrain.

build_ground.py maps every face from the top (x / 4, y / 4): on slopes one texture pixel is smeared
over several metres of height. Faces steeper than STEEP (normal.z < 0.75, ~41 deg) are projected from
the side instead, along the horizontal axis they face most: (y, z) / 4 or (x, z) / 4. Flatter faces
keep the top projection unchanged. Quay walls (own along-the-wall mapping) and water are left alone.
Idempotent; run after any Ground rebuild, before export_game.py.
"""
import bmesh

TILE, STEEP = 4.0, 0.75
SKIP = {'G_Quay', 'G_Water'}
o = bpy.data.objects['Ground']; me = o.data
names = [m.name if m else '' for m in me.materials]
bm = bmesh.new(); bm.from_mesh(me)
uv = bm.loops.layers.uv['UVMap']
side = top = 0
for f in bm.faces:
    if names[f.material_index] in SKIP: continue
    n = f.normal
    if abs(n.z) >= STEEP:
        for l in f.loops: l[uv].uv = (l.vert.co.x / TILE, l.vert.co.y / TILE)
        top += 1
    else:
        a = 0 if abs(n.x) > abs(n.y) else 1  # project along x -> use (y, z); along y -> use (x, z)
        for l in f.loops:
            h = l.vert.co.y if a == 0 else l.vert.co.x
            l[uv].uv = (h / TILE, l.vert.co.z / TILE)
        side += 1
bm.to_mesh(me); bm.free(); me.update()
print('ground uv: top', top, 'side', side)
