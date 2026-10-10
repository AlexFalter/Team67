import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Replace the Props collection with the placements in a props.json (e.g. from the 2D props editor,
apps/client/tools/props-editor). Rows: [x, y, z, yaw, scale, kind] in three.js coordinates.

    PROPS_JSON = '/Users/.../Downloads/props.json'   # default: public/maps/zurich/props.json
    exec(open(ZH_DIR + '/blender/import_props.py').read())

Each prop becomes a linked duplicate of PropModel_<kind> (run build_props.py first), standing on the
topmost walkable surface (Ground / bridge decks / terraces) under its x/z. Then run export_game.py.
"""
import json, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

REPO = os.path.normpath(os.path.join(ZH_DIR, '..', '..', '..', '..'))
src = globals().get('PROPS_JSON') or os.path.join(REPO, 'apps', 'client', 'public', 'maps', 'zurich', 'props.json')
rows = json.load(open(src))
props = bpy.data.collections['Props']
for o in list(props.objects): bpy.data.objects.remove(o)
dg = bpy.context.evaluated_depsgraph_get()
walk = [bpy.data.objects['Ground']] + [o for n in ('Bridges_lowpoly', 'Bahnhofbruecke_lowpoly', 'Polyterrasse_lowpoly')
                                       for o in [bpy.data.objects.get(n)] if o]
trees = [BVHTree.FromObject(o, dg) for o in walk]
def ground(x, y, fallback):
    hits = [t.ray_cast(Vector((x, y, 500.0)), Vector((0, 0, -1)))[0] for t in trees]
    hits = [h.z for h in hits if h is not None]
    return max(hits) if hits else fallback
counts = {}
for x, y3, z3, yaw, scale, kind in rows:
    me = bpy.data.meshes.get('PropModel_' + kind)
    if me is None: print('unknown kind', kind); continue
    bx, by = x, -z3  # three (x, y, z) -> Blender (x, -z, y)
    o = bpy.data.objects.new(f'Prop_{kind}', me); props.objects.link(o)
    o.location = (bx, by, ground(bx, by, y3)); o.rotation_euler = (0, 0, yaw); o.scale = (scale, scale, scale)
    counts[kind] = counts.get(kind, 0) + 1
print('imported', counts, 'from', src)
