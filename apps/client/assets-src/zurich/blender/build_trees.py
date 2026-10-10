import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Low-poly tree models + placements from the canton's LiDAR single-tree dataset (608)."""
exec(open(ZH_DIR + '/blender/zh_common.py').read())
exec(open(ZH_DIR + '/blender/ground_materials.py').read())
from mathutils.bvhtree import BVHTree

def lin(h):
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in hexrgb(h)]
import math, random, zlib

def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c)
    return c

def tree_material(name, surface, tint_from_object):
    """Pixel texture from the theme surface; leaves additionally x per-tree colour (object colour in Blender,
    instance colour in the game)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree
    for n in [n for n in nt.nodes if n.type in ('OBJECT_INFO', 'MIX', 'TEX_IMAGE')]: nt.nodes.remove(n)
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 1
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images['T_' + surface]; tex.interpolation = 'Closest'
    tex.location = (-450, 300)
    if tint_from_object:
        info = nt.nodes.new('ShaderNodeObjectInfo'); info.location = (-450, 0)
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        sock = lambda socks, ident: next(x for x in socks if x.identifier == ident)
        nt.links.new(tex.outputs['Color'], sock(mix.inputs, 'A_Color')); nt.links.new(info.outputs['Color'], sock(mix.inputs, 'B_Color'))
        nt.links.new(sock(mix.outputs, 'Result_Color'), bsdf.inputs['Base Color'])
    else:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m

LEAVES = tree_material('Tree_Leaves', 'Leaves', True)
TRUNK = tree_material('Tree_Trunk', 'Bark', False)

def mesh_from(bm, name):
    """Slots 0 leaves / 1 trunk exist BEFORE to_mesh (otherwise every face collapses to slot 0).
    UVs: cylindrical around the trunk axis, ~3 texture tiles round the crown, chunky pixels."""
    me = bpy.data.meshes.get(name)
    if me: bpy.data.meshes.remove(me)
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        trunk_face = f.material_index == 1
        for l in f.loops:
            co = l.vert.co
            ang = (math.atan2(co.y, co.x) / math.tau + 0.5) * (2 if trunk_face else 3)
            l[uv].uv = (ang, co.z * (8 if trunk_face else 3))
    me = bpy.data.meshes.new(name)
    me.materials.append(LEAVES); me.materials.append(TRUNK)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    return me

def trunk(bm, height, radius):
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=radius, radius2=radius * 0.7, depth=height)
    bmesh.ops.translate(bm, verts=r['verts'], vec=(0, 0, height / 2))
    for f in bm.faces: f.material_index = 1

def crown_blob(bm, center, scale, subdiv=1, seed=0):
    r = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    rnd = random.Random(seed)
    for v in r['verts']:
        v.co *= 1 + (rnd.random() - 0.5) * 0.18   # lumpy, faceted crown
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(center)
    return r

# Models are normalised: height 1, crown radius 1 (scaled per tree by height and crown radius).
def model_round():
    bm = bmesh.new(); trunk(bm, 0.45, 0.11)
    crown_blob(bm, (0, 0, 0.62), (1, 1, 0.38), 1, 1)
    for f in bm.faces:
        if f.material_index != 1: f.material_index = 0
    return mesh_from(bm, 'TreeModel_Round')

def model_cone():
    bm = bmesh.new(); trunk(bm, 0.2, 0.09)
    for i, (z, rad, h) in enumerate(((0.12, 1.0, 0.5), (0.4, 0.75, 0.4), (0.65, 0.48, 0.35))):
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=rad, radius2=0, depth=h)
        bmesh.ops.rotate(bm, verts=r['verts'], cent=(0, 0, 0), matrix=Matrix.Rotation(i * 0.45, 3, 'Z'))
        bmesh.ops.translate(bm, verts=r['verts'], vec=(0, 0, z + h / 2))
        for f in r['faces'] if 'faces' in r else []: f.material_index = 0
    return mesh_from(bm, 'TreeModel_Cone')

def model_tall():
    bm = bmesh.new(); trunk(bm, 0.3, 0.11)
    crown_blob(bm, (0, 0, 0.6), (0.85, 0.85, 0.42), 1, 2)
    return mesh_from(bm, 'TreeModel_Tall')

from mathutils import Matrix
models_coll = coll('TreeModels')
models = {}
for kind, fn in (('Round', model_round), ('Cone', model_cone), ('Tall', model_tall)):
    me = fn()  # slots: 0 leaves, 1 trunk
    ob = bpy.data.objects.new('TreeModel_' + kind, me); models_coll.objects.link(ob)
    ob.location = ({'Round': -12, 'Cone': 0, 'Tall': 12}[kind], 0, -200)  # parked out of the map
    ob.scale = (4, 4, 10)
    models[kind] = me
models_coll.hide_render = True
bpy.context.view_layer.layer_collection.children['TreeModels'].hide_viewport = True

# Placement
ground = bpy.data.objects['Ground']
gbvh = BVHTree.FromObject(ground, bpy.context.evaluated_depsgraph_get())
ground_mats = [m.name for m in ground.data.materials]
pal = theme['trees']
trees_coll = coll('Trees')
placements = []
skipped = {'outside': 0, 'Footprint': 0, 'Water': 0, 'Rail': 0}
for f in json.load(open(D + 'trees.geojson'))['features']:
    p = f['properties']
    e, n = (p['tlm_eb_e'], p['tlm_eb_n']) if p.get('in_tlm') and p.get('tlm_eb_e') else (p['centroid_e'], p['centroid_n'])
    x, y = e - OE, n - ON
    if not (X0 + 1 < x < X1 - 1 and Y0 + 1 < y < Y1 - 1): skipped['outside'] += 1; continue
    hit = gbvh.ray_cast(Vector((x, y, 1000)), Vector((0, 0, -1)))
    if hit[0] is None: skipped['outside'] += 1; continue
    surface = ground_mats[ground.data.polygons[hit[2]].material_index][2:]
    if surface in skipped: skipped[surface] += 1; continue
    h = max(3.0, p['hoehe_max'])
    r = min(max(math.sqrt(p['kronenflaeche'] / math.pi) * 0.85, 1.2), h * 0.6)
    seed = zlib.crc32(str(p['id']).encode())
    rnd = random.Random(seed)
    kind = 'Tall' if h / r > 3.5 else ('Cone' if rnd.random() < 0.12 else 'Round')
    color = rnd.randrange(1000)  # palette index = color % palette length (themes may have different lengths)
    yaw = rnd.random() * math.tau
    placements.append((x, y, hit[0].z, h, r, kind, color, yaw))

exec(open(ZH_DIR + '/blender/guard.py').read())  # manual edits: 'Manual Removed' collection, 'keep' property
MANUAL_GONE = manual_removed()
# keep-out: Polybahn stations/track/bridge (+4 m) stay free of trees
keep_out = []
if bpy.data.collections.get('Polybahn'):
    for o in bpy.data.collections['Polybahn'].objects:
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        if o.name in ('Polybahn_track',): continue  # long diagonal: its bbox would cover too much
        keep_out.append((min(v.x for v in bb) - 4, min(v.y for v in bb) - 4, max(v.x for v in bb) + 4, max(v.y for v in bb) + 4))
for i, (x, y, z, h, r, kind, color, yaw) in enumerate(placements):
    if f'Tree_{i}' in MANUAL_GONE: continue
    if any(a <= x <= c and b <= y <= d for a, b, c, d in keep_out): continue
    ob = bpy.data.objects.new(f'Tree_{i}', models[kind]); trees_coll.objects.link(ob)
    ob.location = (x, y, z - 0.2); ob.scale = (r, r, h); ob.rotation_euler = (0, 0, yaw)
    hexc = (pal['conifer'] if kind == 'Cone' else pal['leaves'])[color % len(pal['conifer'] if kind == 'Cone' else pal['leaves'])]
    jitter = 0.86 + 0.28 * ((i * 2654435761) % 1000) / 1000  # per-tree brightness variety (exported as trees.json row[8])
    ob.color = (*[c * jitter for c in lin(hexc)], 1)
    ob['kind'] = kind; ob['color'] = color; ob['jitter'] = jitter
print('trees placed', len(placements), 'skipped', skipped)
