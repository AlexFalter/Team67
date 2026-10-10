import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Protect manual edits in zurich.blend.

- 'Manual Removed' collection: anything moved there (a source building or its '_s' copy, a tree,
  a sign, ...) counts as deleted by hand; build scripts never recreate it.
- custom property 'keep' on any object: build scripts leave that object untouched.
- snapshot() / changes(): fingerprint of every object (stored in the text block 'zh_guard').
  Run changes() before a rebuild; anything listed was changed by hand since the last snapshot.

    exec(open(ZH_DIR + '/blender/guard.py').read()); print(changes())   # before rebuilding
    exec(open(ZH_DIR + '/blender/guard.py').read()); snapshot()         # after my builds
"""
import json

MANUAL = 'Manual Removed'

def manual_removed():
    """Names (without '_s') that the user removed by hand."""
    c = bpy.data.collections.get(MANUAL)
    if not c:
        c = bpy.data.collections.new(MANUAL); bpy.context.scene.collection.children.link(c)
    return {o.name[:-2] if o.name.endswith('_s') else o.name for o in c.all_objects}

def kept(name):
    o = bpy.data.objects.get(name)
    return bool(o and o.get('keep'))

def _fingerprint(o):
    d = {'loc': [round(x, 3) for x in o.location], 'rot': [round(x, 3) for x in o.rotation_euler],
         'scale': [round(x, 3) for x in o.scale], 'hidden': o.hide_get(), 'colls': sorted(c.name for c in o.users_collection)}
    if o.type == 'MESH':
        me = o.data
        d['mesh'] = [len(me.vertices), len(me.polygons), [m.name if m else '' for m in me.materials]]
        if len(me.vertices):
            xs = [0.0] * (len(me.vertices) * 3); me.vertices.foreach_get('co', xs)
            d['sum'] = round(sum(xs), 2)
    return d

def snapshot():
    data = {o.name: _fingerprint(o) for o in bpy.data.objects}
    t = bpy.data.texts.get('zh_guard') or bpy.data.texts.new('zh_guard')
    t.clear(); t.write(json.dumps(data))
    return len(data)

def changes():
    t = bpy.data.texts.get('zh_guard')
    if not t: return {'note': 'no snapshot yet'}
    old = json.loads(t.as_string()); now = {o.name: o for o in bpy.data.objects}
    out = {'removed': sorted(set(old) - set(now)), 'added': sorted(set(now) - set(old)), 'modified': []}
    for n in set(old) & set(now):
        if _fingerprint(now[n]) != old[n]: out['modified'].append(n)
    out['modified'].sort()
    return out
