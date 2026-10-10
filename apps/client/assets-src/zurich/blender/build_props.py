import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Street props: low-poly models + placements (instanced in the game like the trees).

- PropModels collection (hidden): one mesh per kind at the origin, front = -Y, feet at z = 0.
    PropModel_Lantern  cast-iron street lamp (~6.6 m incl. SIZE 1.5): octagonal foot/pole/collar, 4-sided glass head
    PropModel_Bin      Zurich stainless 'shark' bin (~1.7 m incl. SIZE 1.5): slanted top, two dark slots at the front
- Props collection: every placed prop is a LINKED duplicate of a model (shares its mesh). Place more by
  hand: select one, Alt+D, move/rotate (Z only), optional uniform scale. export_game.py writes
  props.glb (models) + props.json ([x, y, z, yaw, scale, kind] in three.js coordinates).
- Materials G_LampIron, G_LampGlass, G_BinSteel, G_BinSlot -> theme surfaces (themes/*.json).

Rebuilding the models keeps every placement (they keep pointing at the same mesh datablocks).
SAMPLES places one of each on the Bahnhofbruecke if the Props collection is empty.
"""
import bmesh, math
from mathutils import Vector

TILE = 1.0  # UV units per metre -> 16 px per metre with 16 px theme textures
SIZE = 1.5  # all models scaled up (game readability); textures scale with them
MATS = ['G_LampIron', 'G_LampGlass', 'G_BinSteel', 'G_BinSlot', 'G_TramRoof', 'G_Wood', 'G_Metal', 'G_FlagCH', 'G_FlagZH']

def collection(name, hide=False):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c)
    c.hide_render = hide
    return c

def material(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)

def lathe(bm, uv, rings, sides, rot=0.0, cap_bottom=True, cap_top=True):
    """rings: [(radius, z, material_index)]; the band between ring i-1 and i uses ring i's material."""
    loops = []
    for r, z, _ in rings:
        loops.append([bm.verts.new((r * math.cos(rot + 2 * math.pi * k / sides),
                                    r * math.sin(rot + 2 * math.pi * k / sides), z)) for k in range(sides)])
    for i in range(1, len(rings)):
        mat = rings[i][2]
        for k in range(sides):
            a, b = loops[i - 1][k], loops[i - 1][(k + 1) % sides]
            c, d = loops[i][(k + 1) % sides], loops[i][k]
            if a.co == d.co and b.co == c.co: continue
            f = bm.faces.new((a, b, c, d)); f.material_index = mat
            r0, r1 = rings[i - 1][0], rings[i][0]
            circ = 2 * math.pi * max(r0, r1, 0.02) / sides
            for l, (u, vz) in zip(f.loops, ((k, rings[i - 1][1]), (k + 1, rings[i - 1][1]),
                                           (k + 1, rings[i][1]), (k, rings[i][1]))):
                l[uv].uv = (u * circ / TILE, vz / TILE)
    for ring, flip, use in ((loops[0], True, cap_bottom), (loops[-1], False, cap_top)):
        if not use or rings[0 if flip else -1][0] < 1e-4: continue
        f = bm.faces.new(list(reversed(ring)) if flip else ring)
        f.material_index = rings[0 if flip else -1][2]
        for l in f.loops: l[uv].uv = (l.vert.co.x / TILE, l.vert.co.y / TILE)
    return loops

def finish(name, bm, size=None, weld=True):
    if weld: bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    k = SIZE if size is None else size
    bmesh.ops.scale(bm, vec=(k, k, k), verts=bm.verts)
    bm.normal_update()
    me = bpy.data.meshes.get(name) or bpy.data.meshes.new(name)
    me.clear_geometry()
    me.materials.clear()  # slots first: changing them after to_mesh resets the face material indices
    for m in MATS: me.materials.append(material(m))
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    return me

def lantern_mesh():
    IRON, GLASS = 0, 1
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    lathe(bm, uv, [  # foot, pole with collar, neck
        (0.20, 0.00, IRON), (0.20, 0.12, IRON), (0.15, 0.20, IRON), (0.12, 0.55, IRON), (0.07, 0.72, IRON),
        (0.055, 0.75, IRON), (0.05, 1.65, IRON), (0.09, 1.70, IRON), (0.09, 1.78, IRON), (0.05, 1.84, IRON),
        (0.045, 3.22, IRON), (0.12, 3.36, IRON), (0.10, 3.45, IRON)], 8, rot=math.pi / 8, cap_top=False)
    lathe(bm, uv, [  # glass head widening upwards, rim, pyramid cap, finial
        (0.13, 3.45, IRON), (0.24, 3.95, GLASS), (0.29, 3.97, IRON), (0.29, 4.03, IRON),
        (0.07, 4.22, IRON), (0.035, 4.24, IRON), (0.0, 4.42, IRON)], 4, rot=math.pi / 4)
    return finish('PropModel_Lantern', bm)

def bin_mesh():
    STEEL, SLOT = 2, 3
    S, R = 12, 0.21
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    front = -math.pi / 2  # -Y
    def is_front(k): return abs(((2 * math.pi * (k + 0.5) / S - front + math.pi) % (2 * math.pi)) - math.pi) < 0.75
    zs = [0.0, 0.07, 0.72, 0.86, 0.90, 0.96]
    top = lambda a: 1.06 - 0.06 * math.cos(a - front)  # slanted lid, low at the front
    loops = []
    for z in zs:
        loops.append([bm.verts.new((R * math.cos(2 * math.pi * k / S), R * math.sin(2 * math.pi * k / S), z)) for k in range(S)])
    loops.append([bm.verts.new((R * math.cos(2 * math.pi * k / S), R * math.sin(2 * math.pi * k / S), top(2 * math.pi * k / S))) for k in range(S)])
    for i in range(1, len(loops)):
        for k in range(S):
            a, b = loops[i - 1][k], loops[i - 1][(k + 1) % S]
            c, d = loops[i][(k + 1) % S], loops[i][k]
            f = bm.faces.new((a, b, c, d))
            band = zs[i - 1] if i < len(zs) else None
            f.material_index = SLOT if (i == 1 or (band in (0.72, 0.90) and is_front(k))) else STEEL
            circ = 2 * math.pi * R / S
            for l, u in zip(f.loops, (k, k + 1, k + 1, k)):
                l[uv].uv = (u * circ / TILE, l.vert.co.z / TILE)
    for ring, flip in ((loops[0], True), (loops[-1], False)):
        f = bm.faces.new(list(reversed(ring)) if flip else ring); f.material_index = SLOT if flip else STEEL
        for l in f.loops: l[uv].uv = (l.vert.co.x / TILE, l.vert.co.y / TILE)
    return finish('PropModel_Bin', bm)

def box(bm, uv, x0, x1, y0, y1, z0, z1, mat):
    """Axis-aligned box, outward faces, box-projected UVs (TILE)."""
    v = [bm.verts.new(c) for c in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                     (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        f = bm.faces.new([v[i] for i in q]); f.material_index = mat; f.normal_update()
        n = f.normal
        for l in f.loops:
            c = l.vert.co
            l[uv].uv = ((c.x, c.y) if abs(n.z) > 0.5 else ((c.x if abs(n.y) > abs(n.x) else c.y), c.z))

def tram_stop_mesh():
    """Tram shelter, 8 x 1.5 x 3 m: blue roof, wooden back and side walls with open window cut-outs,
    metal front posts, bench. Open (walk-in) side = front = -Y; back wall at +Y."""
    ROOF, WOOD, METAL = 4, 5, 6
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    W, D, T = 4.0, 0.75, 0.12            # half width, half depth, wall thickness
    LOW, HIGH, TOP = 0.95, 2.35, 2.75     # solid band below LOW and above HIGH, roof underside TOP
    box(bm, uv, -W - 0.15, W + 0.15, -D - 0.2, D + 0.1, TOP, TOP + 0.2, ROOF)
    yb = D - T                            # back wall
    box(bm, uv, -W, W, yb, D, 0.0, LOW, WOOD); box(bm, uv, -W, W, yb, D, HIGH, TOP, WOOD)
    for x in (-W, -1.32, 1.32, W - T):
        box(bm, uv, x, x + T, yb, D, LOW, HIGH, WOOD)
    for x0 in (-W, W - T):                # side walls: same bands, open window in between
        box(bm, uv, x0, x0 + T, -D + 0.25, yb, 0.0, LOW, WOOD); box(bm, uv, x0, x0 + T, -D + 0.25, yb, HIGH, TOP, WOOD)
        box(bm, uv, x0, x0 + T, -D + 0.25, -D + 0.25 + T, LOW, HIGH, WOOD)
    for x in (-W, W - 0.1):               # front posts
        box(bm, uv, x, x + 0.1, -D, -D + 0.1, 0.0, TOP, METAL)
    box(bm, uv, -2.5, 2.5, 0.2, yb, 0.42, 0.5, WOOD)          # bench seat
    for x in (-2.3, 2.2): box(bm, uv, x, x + 0.1, 0.3, 0.45, 0.0, 0.42, METAL)
    return finish('PropModel_TramStop', bm, size=1.0)

def flag_mesh(kind):
    """Flag pole (6.2 m) with a square cloth blowing towards the front (-Y): it waves sideways and sags
    towards the tip, like a frozen gust. Both cloth sides are faces (the game renders single-sided)."""
    METAL, CLOTH = 6, (7 if kind == 'CH' else 8)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    lathe(bm, uv, [(0.05, 0.0, METAL), (0.05, 6.15, METAL), (0.09, 6.2, METAL), (0.0, 6.33, METAL)], 6)
    L, H, TOPZ, N = 1.8, 1.8, 6.05, 10
    rows = []
    for i in range(N + 1):
        t = i / N
        y = -t * L * 0.96
        x = 0.16 * math.sin(t * math.pi * 2.3) * (0.3 + t)   # wave grows towards the free end
        sag = 0.5 * t * t                                    # hangs down at the tip
        rows.append((t, Vector((x, y, TOPZ - sag)), Vector((x, y, TOPZ - H - sag * 1.15))))
    for side in (0, 1):  # front and back faces need their own vertices
        top = [bm.verts.new(r[1]) for r in rows]; bot = [bm.verts.new(r[2]) for r in rows]
        for i in range(N):
            q = (bot[i], bot[i + 1], top[i + 1], top[i]) if side == 0 else (top[i], top[i + 1], bot[i + 1], bot[i])
            f = bm.faces.new(q); f.material_index = CLOTH
            for l in f.loops:
                k = top.index(l.vert) if l.vert in top else bot.index(l.vert)
                l[uv].uv = (rows[k][0], 1.0 if l.vert in top else 0.0)
    return finish('PropModel_Flag' + kind, bm, size=1.0, weld=False)

models = collection('PropModels', hide=True)
props = collection('Props')
for mk in (lantern_mesh, bin_mesh, tram_stop_mesh, lambda: flag_mesh('CH'), lambda: flag_mesh('ZH')):
    me = mk(); o = bpy.data.objects.get(me.name)
    if o is None:
        o = bpy.data.objects.new(me.name, me); models.objects.link(o)
    o.location = (0, 0, -200)  # parked out of sight; placements are the linked duplicates in Props
for lc in bpy.context.view_layer.layer_collection.children:
    if lc.collection is models: lc.hide_viewport = True

def place(kind, x, y, z, yaw=0.0, scale=1.0):
    me = bpy.data.meshes['PropModel_' + kind]
    o = bpy.data.objects.new(f'Prop_{kind}', me); props.objects.link(o)
    o.location = (x, y, z); o.rotation_euler = (0, 0, yaw); o.scale = (scale, scale, scale)
    return o

if globals().get('SAMPLES', True) and not props.objects:
    # Bahnhofbruecke, south sidewalk next to the railing (bridge axis d, railing side -n)
    c, d = Vector((-92.3, -70.4, 0)), Vector((-0.839, 0.545, 0))
    n = Vector((-d.y, d.x, 0)); yaw = math.atan2(n.y, n.x) + math.pi / 2  # front (-Y) faces the deck
    sc, dg = bpy.context.scene, bpy.context.evaluated_depsgraph_get()
    def ground(p):
        r = sc.ray_cast(dg, Vector((p.x, p.y, 100)), Vector((0, 0, -1)))
        return r[1].z if r[0] else 8.8
    p = c - n * 9.98 + d * 4; place('Lantern', p.x, p.y, ground(p), yaw)   # railing inner face at 10.58
    p = c - n * 13.58 - d * 2; place('Bin', p.x, p.y, ground(p), yaw)      # railing inner face at 14.18
print('props:', {k: sum(1 for o in props.objects if o.data.name.startswith('PropModel_' + k)) for k in ('Lantern', 'Bin', 'TramStop', 'FlagCH', 'FlagZH')})
