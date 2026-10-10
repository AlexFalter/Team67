import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Integrate the hand-made HB and ETH HG / Polyterrasse packages (re-runnable).

- package collections appended beforehand (see README); vertices are already in map coords
- overlapping official buildings -> 'Replaced' (so build_buildings never recreates them)
- package materials -> theme pixel surfaces (G_*), world-space box UVs
- Ground faces covered by the Polyterrasse (terrace + ETH Link passage) removed
"""
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PACKAGES = ('Zurich HB', 'ETH HG', 'Polyterrasse')
REPLACED_BY_PACKAGES = ['B_140889', 'B_140889.002', 'B_302040593', 'B_140889.003', 'B_9011701', 'B_3169989.003']
MATERIAL_MAP = {  # package material -> theme surface
    'HB warm sandstone — shader ready': 'Sandstone', 'HB pale carved stone': 'StoneTrim', 'HB charcoal roof': 'SlateRoof',
    'HB blue charcoal glazing': 'Glass', 'HB dark metal window frames': 'Metal', 'HB warm timber doors': 'Wood',
    'HB recessed opening shadows': 'Shadow', 'HB ivory clock face': 'Clock', 'HB bronze bell and ornaments': 'Bronze',
    'HG warm sandstone': 'Sandstone', 'HG faded sandstone inset panels': 'StoneTrim', 'HG pale stone window surrounds': 'StoneTrim',
    'HG darker stone plinth': 'StonePlinth', 'HG sandstone mortar joints': 'StonePlinth', 'HG muted brown roof': 'LandmarkRoof',
    'HG flat roof stone': 'FlatRoof', 'HG dark bronze dome': 'DomeCopper', 'HG blue gray window glass': 'Glass',
    'HG dark window mullions': 'Metal', 'HG warm oak entrance doors': 'Wood',
    'BQM and MM blue gray glazing': 'Glass', 'ETH Link asphalt': 'Road', 'ETH Link blue signage': 'SignBlue',
    'ETH Link ceiling light diffusers': 'Light', 'ETH Link white road markings': 'Marking', 'Polyterrasse brass handrails': 'Brass',
    'Polyterrasse dark metal frames': 'Metal', 'Polyterrasse pale concrete slabs': 'Concrete', 'Polyterrasse warm board-formed concrete': 'Bridge',
}
GROUND_LIKE = {'Road', 'Marking', 'Concrete'}  # 4 m texture tiles like the ground; everything else 2.8 m like facades

scene = bpy.context.scene
rep = bpy.data.collections.get('Replaced') or bpy.data.collections.new('Replaced')
if rep.name not in scene.collection.children: scene.collection.children.link(rep)
for n in REPLACED_BY_PACKAGES:
    o = bpy.data.objects.get(n)
    if o and rep not in o.users_collection:
        for c in list(o.users_collection): c.objects.unlink(o)
        rep.objects.link(o)
    s = bpy.data.objects.get(n + '_s')
    if s: m = s.data; bpy.data.objects.remove(s); bpy.data.meshes.remove(m)
bpy.context.view_layer.layer_collection.children['Replaced'].exclude = True

objs = [o for c in bpy.data.collections if c.name.startswith(PACKAGES) for o in c.all_objects if o.type == 'MESH']
unmapped = set()
for o in objs:
    me = o.data
    for slot in o.material_slots:
        if not slot.material: continue
        name = slot.material.name.split('.0')[0]
        if name.startswith('G_'): continue
        target = MATERIAL_MAP.get(name)
        if not target: unmapped.add(name); continue
        slot.material = bpy.data.materials.get('G_' + target) or bpy.data.materials.new('G_' + target)
    # world-space box UVs
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    mw = o.matrix_world; mats = [s.material.name[2:] if s.material else '' for s in o.material_slots]
    for f in bm.faces:
        n = (mw.to_3x3() @ f.normal).normalized()
        scale = 4.0 if (mats[f.material_index] if f.material_index < len(mats) else '') in GROUND_LIKE else 2.8
        for l in f.loops:
            c = mw @ l.vert.co
            if abs(n.z) > 0.7: l[uv].uv = (c.x / scale, c.y / scale)
            else:
                t = Vector((-n.y, n.x)).normalized() if n.xy.length > 1e-6 else Vector((1, 0))
                l[uv].uv = (c.to_2d().dot(t) / scale, c.z / scale)
    bm.to_mesh(me); bm.free()
print('package objects', len(objs), 'unmapped materials', sorted(unmapped))

# Ground under the Polyterrasse: everything the terrace/passage covers goes
vs, ps = [], []
for c in bpy.data.collections:
    if not c.name.startswith('Polyterrasse'): continue
    for o in c.all_objects:
        if o.type != 'MESH': continue
        b = len(vs); vs += [o.matrix_world @ v.co for v in o.data.vertices]; ps += [[b + i for i in p.vertices] for p in o.data.polygons]
pt = BVHTree.FromPolygons(vs, ps)
g = bpy.data.objects['Ground']; bm = bmesh.new(); bm.from_mesh(g.data)
covered = [f for f in bm.faces if pt.ray_cast(Vector((f.calc_center_median().x, f.calc_center_median().y, 500)), Vector((0, 0, -1)))[0] is not None]
bmesh.ops.delete(bm, geom=covered, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(g.data); bm.free(); g.data.update()
print('ground faces removed under the Polyterrasse', len(covered))

# flat tops that the packages modelled in wall stone -> flat roof surface
WALLISH = {'G_Sandstone', 'G_StoneTrim', 'G_StonePlinth'}
flat = bpy.data.materials.get('G_FlatRoof') or bpy.data.materials.new('G_FlatRoof')
changed = 0
for o in objs:
    me = o.data
    names = [s.material.name if s.material else '' for s in o.material_slots]
    if not any(n in WALLISH for n in names): continue
    roof_name = 'G_SlateRoof' if any(c.name.startswith('Zurich HB') for c in o.users_collection) else 'G_LandmarkRoof'
    for extra in ('G_FlatRoof', roof_name):
        if extra not in names:
            me.materials.append(bpy.data.materials.get(extra) or bpy.data.materials.new(extra)); names.append(extra)
    fi, ri = names.index('G_FlatRoof'), names.index(roof_name)
    for p in me.polygons:
        nz = (o.matrix_world.to_3x3() @ p.normal).normalized().z
        if names[p.material_index] in WALLISH and nz > 0.3:
            p.material_index = fi if nz > 0.9 else ri; changed += 1
print('flat stone tops -> flat roof', changed)
