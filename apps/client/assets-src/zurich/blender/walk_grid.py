import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Gameplay walk grid (2 m) for scripts/build-world.ts -> packages/shared zurich-world.json.

The game does not collide with meshes: it walks on `ground` (bilinear height) and treats a cell as a
wall when `roof > ground + 1.5 m`. This script decides both per cell:

- ground = topmost WALKABLE surface: the Ground mesh (except water), bridge decks (G_Bridge), the
  Polyterrasse top, Polybahn station floors. Roofs, the Polybahn track and railings are not walkable.
- wall (roof = top of the obstacle, at least ground + 2.5 m: above the 2.33 m shoe jump):
  * water (players could not climb the quay walls back out),
  * HB and ETH HG packages (open facade planes): anything above the walk surface,
  * LoD2 buildings (closed solids): inside the solid; a downward-facing ceiling 2.1-10 m up is an
    opening (doorways, arcades, platform canopies) and stays walkable,
  * OPEN objects (bridges, Polybahn, Polyterrasse, signs): only if headroom < 2.1 m, so the station
    halls and the space under the Polybahn bridge stay walkable,
  * thin parts of OPEN objects (railings, fences, hall walls) within 0.8 m of the cell centre,
  * LoD2 'Bruecke_Passerelle' boxes are decks (walk on top) when their top meets the ground at an
    end (Quaibruecke), otherwise overhead footbridges (walk underneath),
  * cliffs: the lower cell beside a > 1 m jump in ground height (ground is interpolated, so quay and
    terrace walls would otherwise be walkable slopes). Station floors ignore the enclosing building.
  Cells without any walkable surface (track pit) become walls, so there are no holes.
- patches: 0.5 m grids (same rules) over both Polybahn stations, where the 2 m grid cannot follow the
  thin rotated hall walls and doors. world-grid.json 'patches' -> zurich-world.json; the game's
  height()/blocked() use a patch where one covers the point, the 2 m grid elsewhere.

    exec(open(ZH_DIR + '/blender/walk_grid.py').read())   # -> world-grid.json + report
"""
import json, struct, base64, hashlib, math, time
from collections import deque
from mathutils import Vector
from mathutils.bvhtree import BVHTree

REPO = os.path.normpath(os.path.join(ZH_DIR, '..', '..', '..', '..'))
AREA = json.load(open(os.path.join(REPO, 'apps', 'client', 'src', 'maps', 'zurich', 'area.json')))
MAP = os.path.join(REPO, 'apps', 'client', 'public', 'maps', 'zurich', 'zurich.glb')
SOLID_COLLECTIONS = ('BuildingsStyled', 'Zurich HB', 'ETH HG')
OPEN_COLLECTIONS = ('Bridges', 'Polybahn', 'Landmarks', 'Signs')
WALK_MATERIALS = {'G_Bridge', 'G_StationFloor', 'G_Concrete', 'G_StonePlinth'}  # up-facing faces only
WALK_OBJECTS = {'Bridges_lowpoly', 'Bahnhofbruecke_lowpoly', 'Polybahn_halls', 'Polyterrasse_lowpoly'}
NOT_WALK = {('Polybahn_halls', 'G_Concrete')}  # hall roofs
WATER = 'G_Water'
HEADROOM, CEILING_MAX, WALL_MIN, THIN_REACH = 2.1, 10.0, 2.5, 0.8  # 0.8: 3.6 m station doors stay open
t_walk = time.time()
DOWN, UP = Vector((0, 0, -1)), Vector((0, 0, 1))
dg = bpy.context.evaluated_depsgraph_get()

def objects(prefixes):
    out = []
    for c in bpy.data.collections:
        if c.name.startswith(prefixes):
            out += [o for o in c.all_objects if o.type == 'MESH' and o.visible_get() and o not in out]
    return out

def bvh(faces):
    vs, ps, tag = [], [], []
    for o, me, polys, t in faces:
        base = len(vs); idx = {}
        for p in polys:
            q = []
            for vi in p.vertices:
                if vi not in idx: idx[vi] = len(vs); vs.append(o.matrix_world @ me.vertices[vi].co)
                q.append(idx[vi])
            ps.append(q); tag.append(t)
    return BVHTree.FromPolygons(vs, ps), tag

walk, solid, opn, thin = [], [], [], []
meshes = []
def mesh_of(o):
    me = o.evaluated_get(dg).to_mesh(); meshes.append(o); return me
g_obj = bpy.data.objects['Ground']; g_me = mesh_of(g_obj)
water_mat = [i for i, m in enumerate(g_me.materials) if m and m.name == WATER]
walk.append((g_obj, g_me, list(g_me.polygons), 'ground'))
styled = []
g_tree = BVHTree.FromObject(bpy.data.objects['Ground'], dg)
def passerelle_is_deck(o, me):
    """LoD2 'Bruecke_Passerelle' boxes: a deck if its top meets the ground at an end of its long axis."""
    pts = [o.matrix_world @ v.co for v in me.vertices]; top = max(p.z for p in pts)
    c = sum(pts, Vector()) / len(pts); c.z = 0
    best = None
    for k in range(36):  # long axis = direction with the largest extent
        d = Vector((math.cos(k * math.pi / 36), math.sin(k * math.pi / 36), 0))
        e = [(p - c).dot(d) for p in pts]
        if best is None or max(e) - min(e) > best[0]: best = (max(e) - min(e), d, min(e), max(e))
    _, d, lo, hi = best
    for sgn, t0_ in ((-1, lo), (1, hi)):  # one end meeting the street (within 8 m) is enough
        for k in (1, 2, 4, 6, 8):
            q = c + d * (t0_ + sgn * k); r = g_tree.ray_cast(Vector((q.x, q.y, 500.0)), DOWN)
            if r[0] is not None and abs(r[0].z - top) <= 1.2: return True
    return False
decks = []
for o in objects(SOLID_COLLECTIONS):
    me = mesh_of(o)
    src = bpy.data.objects.get(o.name[:-2]) if o.name.endswith('_s') else None
    if src is not None and src.get('art_txt') == 'Bruecke_Passerelle':
        if passerelle_is_deck(o, me):
            decks.append(o.name)
            up = [p for p in me.polygons if (o.matrix_world.to_3x3() @ p.normal).z > 0.5]
            walk.append((o, me, up, 'deck'))
        else: opn.append((o, me, list(me.polygons), o.name))  # overhead footbridge: walk underneath
        continue
    (styled if o.users_collection[0].name.startswith('BuildingsStyled') else solid).append((o, me, list(me.polygons), o.name))
for o in objects(OPEN_COLLECTIONS):
    me = mesh_of(o); mats = [m.name if m else '' for m in me.materials]
    w, rest, th = [], [], []
    for p in me.polygons:
        m = mats[p.material_index] if mats else ''
        n = (o.matrix_world.to_3x3() @ p.normal).normalized()
        if o.name in WALK_OBJECTS and m in WALK_MATERIALS and n.z > 0.5 and (o.name, m) not in NOT_WALK:
            w.append(p)
        elif m == WATER: continue
        else:
            rest.append(p)
            if abs(n.z) < 0.5: th.append(p)
    if w: walk.append((o, me, w, o.name))
    if rest: opn.append((o, me, rest, o.name))
    if th: thin.append((o, me, th, o.name))
H_bvh, _ = bvh([f for f in walk if f[3] == 'Polybahn_halls'])  # station floors + thresholds
W_bvh, W_tag = bvh(walk); S_bvh, _ = bvh(solid); B_bvh, _ = bvh(styled); O_bvh, _ = bvh(opn); T_bvh, _ = bvh(thin)
# water flag per Ground face index (BVH indices follow polygon order; Ground is first in `walk`)
g_water = {p.index for p in g_me.polygons if p.material_index in water_mat}

OE, ON = AREA['originLV95'][0], AREA['originLV95'][1]
minE, minN, maxE, maxN = AREA['boundsLV95']
minX, maxX, minZ, maxZ, step = minE - OE, maxE - OE, ON - maxN, ON - minN, 2
width, depth = int(round((maxX - minX) / step)) + 1, int(round((maxZ - minZ) / step)) + 1
DIRS = [Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))]
n_ground = len(g_me.polygons)
CLIFF = 1.0

def grid_for(gx0, gz0, gw, gd, gstep, thin_reach):
    """ground / roof / kind (0 free, 1 water, 2 wall, 3 cliff) for a gw x gd grid at gstep (three.js x, z)."""
    ground, roof, kind = [None] * (gw * gd), [None] * (gw * gd), [0] * (gw * gd)
    for zi in range(gd):
        by = -(gz0 + zi * gstep)
        for xi in range(gw):
            i = zi * gw + xi; x = gx0 + xi * gstep
            h = W_bvh.ray_cast(Vector((x, by, 500.0)), DOWN)
            if h[0] is None: continue
            g = h[0].z; ground[i] = g
            if h[2] < n_ground and h[2] in g_water:
                roof[i] = g + 3.0; kind[i] = 1; continue
            top = None
            hh = H_bvh.ray_cast(Vector((x, by, g + 0.3)), DOWN, 0.8)
            if hh[0] is None:  # station floors (and their doorways) ignore the building they are built into
                s_ = S_bvh.ray_cast(Vector((x, by, 500.0)), DOWN)
                if s_[0] is not None and s_[0].z > g + 0.25: top = s_[0].z
                b_ = B_bvh.ray_cast(Vector((x, by, 500.0)), DOWN)
                if top is None and b_[0] is not None and b_[0].z > g + 0.25:
                    # closed LoD2 solid: inside -> wall; under a ceiling (door, arcade, canopy) -> open
                    u = B_bvh.ray_cast(Vector((x, by, g + 0.25)), UP)
                    if not (u[0] is not None and u[1].z < -0.3 and HEADROOM <= u[0].z - g <= CEILING_MAX): top = b_[0].z
            if top is None:
                u = O_bvh.ray_cast(Vector((x, by, g + 0.25)), UP)
                if u[0] is not None and u[0].z < g + HEADROOM: top = max(u[0].z, g + WALL_MIN)
                else:
                    for zz in (0.4, 1.2):
                        for d in DIRS:
                            t = T_bvh.ray_cast(Vector((x, by, g + zz)), d, thin_reach)
                            if t[0] is not None: top = g + WALL_MIN; break
                        if top is not None: break
            if top is not None: roof[i] = max(top, g + WALL_MIN); kind[i] = 2
    # holes (e.g. the Polybahn track pit inside the halls): wall at the height of whatever is there
    for i in range(gw * gd):
        if ground[i] is not None: continue
        x, by = gx0 + (i % gw) * gstep, -(gz0 + (i // gw) * gstep)
        hs = [b_.ray_cast(Vector((x, by, 500.0)), DOWN)[0] for b_ in (S_bvh, B_bvh, O_bvh)]
        hs = [h_.z for h_ in hs if h_ is not None]
        if hs: ground[i] = min(hs); roof[i] = max(hs) + WALL_MIN; kind[i] = 2
    # cliffs: ground is bilinear, so a 3 m quay or terrace wall would read as a steep walkable slope.
    # The LOWER cell next to a jump of more than CLIFF becomes a wall up to the upper level (jumping down works).
    cliff = []
    for i in range(gw * gd):
        if kind[i] != 0 or ground[i] is None: continue
        xi, zi = i % gw, i // gw; hi = None
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, nz = xi + dx, zi + dz
            if 0 <= nx < gw and 0 <= nz < gd:
                j = nz * gw + nx
                if ground[j] is not None and kind[j] != 1 and ground[j] - ground[i] > CLIFF: hi = max(hi or -1e9, ground[j])
        if hi is not None: cliff.append((i, hi))
    for i, hi in cliff: roof[i] = max(hi, ground[i] + 1.6); kind[i] = 3
    return ground, roof, kind

ground, roof, kind = grid_for(minX, minZ, width, depth, step, THIN_REACH)

# --- reachability from spawn (step up <= 0.65 m walking, <= 1.2 m with a jump; any drop)
def idx(x, z): return int(math.floor((z - minZ) / step + 0.5)) * width + int(math.floor((x - minX) / step + 0.5))
free = [ground[i] is not None and kind[i] == 0 for i in range(width * depth)]
# cliffs are walls now, so any remaining step between free cells is <= CLIFF (walkable in game)
spawn = idx(-273, -106)
if not free[spawn]:
    spawn = min((i for i in range(width * depth) if free[i]), key=lambda i: abs(i % width - spawn % width) + abs(i // width - spawn // width))
seen = bytearray(width * depth); seen[spawn] = 1; q = deque([spawn])
while q:
    i = q.popleft(); xi, zi = i % width, i // width
    for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, nz = xi + dx, zi + dz
        if not (0 <= nx < width and 0 <= nz < depth): continue
        j = nz * width + nx
        if seen[j] or not free[j]: continue
        seen[j] = 1; q.append(j)
n_free = sum(free); n_reach = sum(seen)
CHECK = {'HB forecourt': (-273, -106), 'Bahnhofbruecke deck': (-165, -3),
         'Polybahn bottom hall': (23, 112), 'Polybahn top hall': (180, 75), 'Polyterrasse': (215, 140),
         'ETH HG front': (270, 60), 'Bellevue': (225, 1300), 'Limmatquai': (0, 400)}
report = {}
for name, (x, z) in CHECK.items():
    i = idx(x, z)
    # nearest free cell within 4 m
    best = None
    for dz in range(-2, 3):
        for dx in range(-2, 3):
            j = i + dz * width + dx
            if 0 <= j < len(free) and free[j]: best = j; break
        if best is not None: break
    report[name] = ('reachable' if best is not None and seen[best] else ('free, NOT reachable' if best is not None else 'no free cell'))
islands = []
mark = bytearray(seen)
for s0 in range(width * depth):
    if not free[s0] or mark[s0]: continue
    comp = [s0]; mark[s0] = 1; k = 0
    while k < len(comp):
        i = comp[k]; k += 1; xi, zi = i % width, i // width
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, nz = xi + dx, zi + dz
            if 0 <= nx < width and 0 <= nz < depth:
                j = nz * width + nx
                if free[j] and not mark[j]: mark[j] = 1; comp.append(j)
    if len(comp) >= 25:
        c = comp[len(comp) // 2]; islands.append((len(comp), minX + (c % width) * step, minZ + (c // width) * step))
islands.sort(reverse=True)

# --- 0.5 m detail patches over the Polybahn stations: the 2 m grid cannot follow their thin, rotated
# walls and 3.6 m doors. The game checks a patch first (height + blocked), the 2 m grid elsewhere.
PATCH_STEP, PATCH_THIN, PATCH_MARGIN = 0.5, 0.25, 6.0  # thin reach = half a cell
pts = sorted((c.x, -c.y) for o, me, polys, tag in walk if tag == 'Polybahn_halls'
             for c in (o.matrix_world @ p.center for p in polys))
cut = max(range(1, len(pts)), key=lambda k: pts[k][0] - pts[k - 1][0]) if len(pts) > 1 else len(pts)
patches, patch_report = [], {}
# narrow ramps from the hand-drawn edit areas (edit-areas.json): area 2, area 3 (terrace ramp), area 5
EXTRA_PATCHES = {'area2 ramp': [(53.0, 86.0), (80.0, 138.0)], 'area3 terrace ramp': [(194.0, 59.0), (212.0, 82.0)],
                 'area5 corridor': [(-30.0, -153.0), (2.0, -143.0)]}
groups = [('bottom', pts[:cut]), ('top', pts[cut:])] + [(k, v) for k, v in EXTRA_PATCHES.items()]
for name, cl in groups:
    if not cl: continue
    snap = lambda v, f: f(v / PATCH_STEP) * PATCH_STEP
    px0, px1 = snap(min(x for x, _ in cl) - PATCH_MARGIN, math.floor), snap(max(x for x, _ in cl) + PATCH_MARGIN, math.ceil)
    pz0, pz1 = snap(min(z for _, z in cl) - PATCH_MARGIN, math.floor), snap(max(z for _, z in cl) + PATCH_MARGIN, math.ceil)
    pw, pd = int(round((px1 - px0) / PATCH_STEP)) + 1, int(round((pz1 - pz0) / PATCH_STEP)) + 1
    pg, pr, pk = grid_for(px0, pz0, pw, pd, PATCH_STEP, PATCH_THIN)
    # reachability inside the patch, seeded from its border cells whose 2 m cell is reachable
    pfree = [pg[i] is not None and pk[i] == 0 for i in range(pw * pd)]
    pseen = bytearray(pw * pd); q = deque()
    for i in range(pw * pd):
        xi, zi = i % pw, i // pw
        if pfree[i] and (xi < 2 or zi < 2 or xi >= pw - 2 or zi >= pd - 2):
            j = idx(px0 + xi * PATCH_STEP, pz0 + zi * PATCH_STEP)
            if 0 <= j < len(seen) and seen[j]: pseen[i] = 1; q.append(i)
    while q:
        i = q.popleft(); xi, zi = i % pw, i // pw
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, nz = xi + dx, zi + dz
            if 0 <= nx < pw and 0 <= nz < pd:
                j = nz * pw + nx
                if pfree[j] and not pseen[j]: pseen[j] = 1; q.append(j)
    floor_cells = [i for i in range(pw * pd) if H_bvh.ray_cast(Vector((px0 + (i % pw) * PATCH_STEP, -(pz0 + (i // pw) * PATCH_STEP), (pg[i] or 0) + 0.3)), DOWN, 0.8)[0] is not None]
    walkable_floor = [i for i in floor_cells if pfree[i]]
    patch_report[name] = {'bounds': [px0, pz0, px1, pz1], 'cells': [pw, pd], 'hall floor cells': len(floor_cells),
                          'free floor': len(walkable_floor), 'reached floor': sum(pseen[i] for i in walkable_floor)}
    patches.append({'minX': px0, 'minZ': pz0, 'step': PATCH_STEP, 'width': pw, 'depth': pd, 'ground': pg, 'roof': pr})

def encode(vals):
    return base64.b64encode(b''.join(struct.pack('<H', 65535 if v is None else max(0, min(65534, round(v * 100)))) for v in vals)).decode()
grid = {'minX': minX, 'maxX': maxX, 'minZ': minZ, 'maxZ': maxZ, 'step': step, 'width': width, 'depth': depth,
        'ground': encode(ground), 'roof': encode(roof),
        'patches': [{**pt, 'ground': encode(pt['ground']), 'roof': encode(pt['roof'])} for pt in patches]}
if os.path.exists(MAP): grid['sourceHash'] = hashlib.sha256(open(MAP, 'rb').read()).hexdigest()
json.dump(grid, open(os.path.join(ZH_DIR, 'world-grid.json'), 'w'), separators=(',', ':'))
for o in meshes: o.evaluated_get(dg).to_mesh_clear()
interior_holes = sum(1 for i in range(width * depth) if ground[i] is None and 0 < i % width < width - 1 and 0 < i // width < depth - 1)
WALK_REPORT = {'passerelle_decks': decks, 'free': n_free, 'reachable': n_reach, 'water': kind.count(1), 'walls': kind.count(2), 'cliffs': kind.count(3),
               'interior_holes': interior_holes, 'checks': report, 'patches': patch_report, 'unreachable_islands': islands[:8]}
print(json.dumps(WALK_REPORT, indent=1), f'{time.time() - t_walk:.0f} s')

if globals().get('WALK_PNG'):  # debug map: green reachable, orange free but unreachable, grey wall, blue water, magenta hole
    import zlib
    rows = []
    for zi in range(depth):
        r = bytearray([0])
        for xi in range(width):
            i = zi * width + xi
            if ground[i] is None: c = (255, 0, 255)
            elif kind[i] == 1: c = (60, 110, 220)
            elif kind[i] == 2: c = (90, 90, 90)
            elif kind[i] == 3: c = (30, 30, 30)
            elif seen[i]: s = int(120 + min(135, max(0, ground[i] * 2.5))); c = (40, s, 60)
            else: c = (255, 140, 0)
            r += bytes(c)
        rows.append(bytes(r))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, depth, 8, 2, 0, 0, 0)) + \
          chunk(b'IDAT', zlib.compress(b''.join(rows), 6)) + chunk(b'IEND', b'')
    open(WALK_PNG, 'wb').write(png); print('debug png', WALK_PNG)
