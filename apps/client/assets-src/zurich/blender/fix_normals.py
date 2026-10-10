import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Make every closed part (boxes, beams, posts) of the given objects face outward.

The game renders single-sided, so inward-wound helper boxes would vanish. Open parts (single
deck/water/slab faces) are left alone: their orientation is set deliberately.
"""
import bmesh

def fix_closed_normals(names):
    for name in names:
        ob = bpy.data.objects.get(name)
        if not ob: continue
        bm = bmesh.new(); bm.from_mesh(ob.data)
        seen, fixed = set(), 0
        for f in bm.faces:
            if f in seen: continue
            part, stack = [], [f]; seen.add(f)
            while stack:
                c = stack.pop(); part.append(c)
                for e in c.edges:
                    for o in e.link_faces:
                        if o not in seen: seen.add(o); stack.append(o)
            if all(len(e.link_faces) == 2 for p in part for e in p.edges):
                bmesh.ops.recalc_face_normals(bm, faces=part); fixed += 1
        bm.to_mesh(ob.data); bm.free(); ob.data.update()
        print(name, 'closed parts oriented', fixed)

fix_closed_normals(globals().get('FIX_NAMES', ['Bahnhofbruecke_lowpoly', 'Bridges_lowpoly',
                                               'Polybahn_track', 'Polybahn_bridge', 'Polybahn_stations']))
