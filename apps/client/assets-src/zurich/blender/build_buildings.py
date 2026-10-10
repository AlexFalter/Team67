import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Style the official LoD2 buildings: clean faces, walls/roofs split by orientation, window UVs.

Source objects in 'Buildings' stay untouched (hidden); styled copies go to 'BuildingsStyled'.
Per face: material G_Wall / G_WallGround (shop band) / G_Roof / G_RoofFlat / G_Plain.
UVMap: walls = window cells (u: whole windows per wall, v: floors from the ground), roofs = tile
rows along the eaves. 'Style' UV layer = (category, seed) per building: the game picks colours
from theme.buildings at load time. 'Col' = preview colour from the current theme (Blender only).
"""
import bmesh, math, json, zlib
from mathutils import Vector

GROUND_FLOOR = 3.6   # m, shop band height (geometry: changing it needs a rebuild)
FLOOR = 3.1          # m, target upper floor height (fitted per building to whole floors)
CELL = 2.8           # m, target window spacing (fitted per wall to whole windows)
ROOF_TILE = 2.0      # m per roof texture repeat
ROOF_THICK = 0.35    # m fascia band under pitched/spire roof edges (no 'cardboard' roofs)
FASCIA_MIN = 0.8     # m; shorter roof edges get no band
CATEGORIES = ['residential', 'office', 'commercial', 'other', 'structure', 'landmark']
LANDMARK_H = 40     # m; non-residential buildings this tall = churches/towers/museums
SPIRE_NZ = 0.5      # roof faces steeper than this, in the top part of a landmark = copper spire/dome
POINTY_NZ = 0.6     # roof faces steeper than ~53° that meet at a peak = pointy roof (any building)
POINTY_SIZE = 15.0  # m, max footprint of a pointy roof (larger = ordinary hip roof)
SPIRE_FROM = 0.55   # fraction of landmark height above which steep roofs count as spire
ART = {
    'Gebaeude_Wohngebaeude': 'residential',
    'Gebaeude_Verwaltung': 'office',
    'Gebaeude_Gastgewerbe': 'commercial', 'Gebaeude_Handel': 'commercial',
    'Gebaeude_Industrie_Gewerbe': 'other', 'Gebaeude_Verkehr': 'other', 'Gebaeude_Nebengebaeude': 'other',
    'Gebaeude_Land_Forstwirtschaft_Gaertnerei': 'other',
}  # everything else (shelters, piers, bridges, landing stages, chimney, parts) = structure, no windows
MATS = ['G_Wall', 'G_WallGround', 'G_Roof', 'G_RoofFlat', 'G_Plain', 'G_WallShutters', 'G_RoofSpire', 'G_Timber']
WALL, GROUNDW, ROOF, FLAT, PLAIN, SHUTTERS, SPIRE, TIMBER = range(8)
TIMBER_BUILDINGS = {'B_302040285'}
FORCE_WINDOWS = {'B_140004'}  # Polybahn Central building: windows above the arcade even next to its neighbour  # Polybahn top station: half-timbered walls, 3 m panels

exec(open(ZH_DIR + '/blender/ground_materials.py').read())  # theme + materials
def lin(h):
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in hexrgb(h)]

exec(open(ZH_DIR + '/blender/guard.py').read())  # manual edits: 'Manual Removed' collection, 'keep' property
MANUAL_GONE = manual_removed()
src = bpy.data.collections['Buildings']
dst = bpy.data.collections.get('BuildingsStyled')
if dst:
    for o in list(dst.objects):
        if o.get('keep'): continue  # hand-edited: leave as is
        m = o.data; bpy.data.objects.remove(o); bpy.data.meshes.remove(m)
else:
    dst = bpy.data.collections.new('BuildingsStyled'); bpy.context.scene.collection.children.link(dst)
mats = [bpy.data.materials.get(n) or bpy.data.materials.new(n) for n in MATS]
walls_pal, roofs_pal = theme['buildings']['walls'], theme['buildings']['roofs']
from mathutils.bvhtree import BVHTree
_gbvh = BVHTree.FromObject(bpy.data.objects['Ground'], bpy.context.evaluated_depsgraph_get())
# all source buildings in one BVH; face index -> building index (to ignore a building's own faces)
_occ_verts, _occ_polys, _occ_owner = [], [], []
for _bi, _o in enumerate(bpy.data.collections['Buildings'].objects):
    _m = _o.data; _base = len(_occ_verts)
    _occ_verts += [_o.matrix_world @ v.co for v in _m.vertices]
    for _p in _m.polygons:
        _occ_polys.append([_base + i for i in _p.vertices]); _occ_owner.append(_bi)
_occ_bvh = BVHTree.FromPolygons(_occ_verts, _occ_polys)
_occ_index = {o.name: i for i, o in enumerate(bpy.data.collections['Buildings'].objects)}
def covered(p, me_idx, r=0.2):
    """True if another building's surface is within r of p (party walls, abutting walls)."""
    return any(_occ_owner[h[2]] != me_idx for h in _occ_bvh.find_nearest_range(p, r))

def street_level(bm, zmin):
    """Lowest ground just outside the footprint (LoD2 solids reach ~3 m below the street)."""
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    pts = [(min(xs) - 1.5, cy), (max(xs) + 1.5, cy), (cx, min(ys) - 1.5), (cx, max(ys) + 1.5),
           (min(xs) - 1.5, min(ys) - 1.5), (max(xs) + 1.5, max(ys) + 1.5), (min(xs) - 1.5, max(ys) + 1.5), (max(xs) + 1.5, min(ys) - 1.5)]
    zs = [h[0].z for x, y in pts if (h := _gbvh.ray_cast(Vector((x, y, 500)), Vector((0, 0, -1))))[0] is not None]
    return min(max(min(zs), zmin), zmin + 6) if zs else zmin

FACADE_MARGIN = 0.7   # m of plain plaster at both ends of a facade (no windows around corners)
ROOF_PAD = 0.35       # m between the top window row and the roof / gable edge
MIN_WINDOW_RUN = 1.8  # m; narrower facades stay plain


def layout_facades(bm, is_wall, base, floor_h, shop_band, windows, upper_mat, me_idx=-1):
    """Window layout per facade (coplanar connected wall faces).

    Windows only fill a rectangle of whole columns x whole floors that fits inside the facade
    outline with margins; the facade is cut along that rectangle. Wall faces get their material
    here and an int face layer 'facade' (index into the returned params list, -1 = plain):
    params[i] = (material, s0, cell_width, z0, row_height)."""
    params = []
    layer = bm.faces.layers.int.get('facade') or bm.faces.layers.int.new('facade')
    for f in bm.faces:
        f[layer] = -1
        if is_wall(f): f.material_index = PLAIN
    if not windows: return params
    # facade planes: same orientation (2 deg buckets), depth clustered with a 0.45 m gap tolerance
    # (pilasters/relief of ~0.1-0.3 m stay one facade)
    by_angle = {}
    for f in [f for f in bm.faces if is_wall(f)]:
        n2 = f.normal.to_2d()
        if n2.length < 1e-6: continue
        n2.normalize()
        by_angle.setdefault(round(math.degrees(math.atan2(n2.y, n2.x)) / 2.0) % 180, []).append(
            (f.calc_center_median().to_2d().dot(n2), f))
    groups = {}
    for key, items in by_angle.items():
        items.sort(key=lambda it: it[0])
        cluster, last = 0, None
        for d, f in items:
            if last is not None and d - last > 0.45: cluster += 1
            groups.setdefault((key, cluster), []).append(f); last = d
    for fs in groups.values():
        # pieces of one wall plane: connected by edges OR touching side by side (T-junction seams in the data)
        fset, seen, pieces = set(fs), set(), []
        for f0 in fs:
            if f0 in seen: continue
            comp, stack = [], [f0]; seen.add(f0)
            while stack:
                c = stack.pop(); comp.append(c)
                for e in c.edges:
                    for o in e.link_faces:
                        if o in fset and o not in seen: seen.add(o); stack.append(o)
            pieces.append(comp)
        n_ = fs[0].normal.to_2d().normalized(); t_ = Vector((-n_.y, n_.x))
        box = [(min(v.co.to_2d().dot(t_) for f in c for v in f.verts), max(v.co.to_2d().dot(t_) for f in c for v in f.verts),
                min(v.co.z for f in c for v in f.verts), max(v.co.z for f in c for v in f.verts)) for c in pieces]
        parent = list(range(len(pieces)))
        def root(i):
            while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for i in range(len(pieces)):
            for j in range(i + 1, len(pieces)):
                a, b = box[i], box[j]
                if a[0] - 0.15 < b[1] and b[0] - 0.15 < a[1] and a[2] < b[3] - 0.5 and b[2] < a[3] - 0.5:
                    parent[root(i)] = root(j)
        merged = {}
        for i, c in enumerate(pieces): merged.setdefault(root(i), []).extend(c)
        for comp in merged.values():
            n2 = sum((f.normal.to_2d() for f in comp), Vector((0, 0))).normalized()
            t = Vector((-n2.y, n2.x))
            polys = [[(v.co.to_2d().dot(t), v.co.z) for v in f.verts] for f in comp]
            ss = [p[0] for poly in polys for p in poly]
            smin, smax = min(ss), max(ss)
            if smax - smin - 2 * FACADE_MARGIN < MIN_WINDOW_RUN: continue
            d_off = sum(f.calc_center_median().to_2d().dot(n2) for f in comp) / len(comp)
            def span(sx):
                zs = []
                for poly in polys:
                    for (a_s, a_z), (b_s, b_z) in zip(poly, poly[1:] + poly[:1]):
                        if (a_s - sx) * (b_s - sx) <= 0 and abs(b_s - a_s) > 1e-6:
                            zs.append(a_z + (b_z - a_z) * (sx - a_s) / (b_s - a_s))
                return (min(zs), max(zs)) if zs else None
            up0 = base + (GROUND_FLOOR if shop_band else 0)
            rows = []  # (z0, z1, kind) ; kind 'shop' or floor index
            if shop_band: rows.append((base, base + GROUND_FLOOR, 'shop'))
            top_all = max(p[1] for poly in polys for p in poly)
            k = 0
            while up0 + (k + 1) * floor_h <= top_all - ROOF_PAD + 1e-6:
                rows.append((up0 + k * floor_h, up0 + (k + 1) * floor_h, k)); k += 1
            if not rows: continue
            # free[r][j]: sample j (every 0.5 m inside the end margins) usable for row r
            STEP = 0.5
            samples = [smin + FACADE_MARGIN + STEP * j for j in range(int((smax - smin - 2 * FACADE_MARGIN) / STEP) + 1)]
            spans = [span(sx) for sx in samples]
            def point(sx, z):
                p2 = t * sx + n2 * (d_off + 0.08)
                return Vector((p2.x, p2.y, z))
            free = []
            for z0, z1, kind in rows:
                pad = ROOF_PAD if kind != 'shop' else 0.0
                rowfree = []
                for sx, sp in zip(samples, spans):
                    ok = sp is not None and sp[0] <= z0 + (0.6 if kind == 'shop' else 0.05) and sp[1] >= z1 + pad
                    if ok and me_idx >= 0:
                        ok = not covered(point(sx, (z0 + z1) / 2), me_idx) and not covered(point(sx, z0 + 0.4), me_idx) \
                             and not covered(point(sx, z1 - 0.4), me_idx)
                    rowfree.append(ok)
                free.append(rowfree)
            # main interval = longest free run over all rows; the column grid is centred in it
            best = (0, 0, -1)
            for r, rowfree in enumerate(free):
                j = 0
                while j < len(rowfree):
                    if rowfree[j]:
                        j2 = j
                        while j2 + 1 < len(rowfree) and rowfree[j2 + 1]: j2 += 1
                        if j2 - j > best[1] - best[0]: best = (j, j2, r)
                        j = j2 + 1
                    else: j += 1
            if best[2] < 0: continue
            A, B = samples[best[0]], samples[best[1]]
            # keep away from occluders at the run ends (not needed at the facade ends: margin already applied)
            if best[0] > 0: A += 0.4
            if best[1] < len(samples) - 1: B -= 0.4
            if B - A < MIN_WINDOW_RUN: continue
            cols = max(1, round((B - A) / CELL)); cw = (B - A) / cols; rs0 = A
            def cell_free(r, i):
                lo, hi = rs0 + cw * (i + 0.15), rs0 + cw * (i + 0.85)
                js = [j for j, sx in enumerate(samples) if lo - STEP / 2 <= sx <= hi + STEP / 2]
                return bool(js) and all(free[r][j] for j in js)
            valid = [[cell_free(r, i) for i in range(cols)] for r in range(len(rows))]
            if not any(any(v) for v in valid): continue
            zcuts = sorted({z for r, (z0, z1, _) in enumerate(rows) if any(valid[r]) for z in (z0, z1)})
            geom = list({*comp, *(e for f in comp for e in f.edges), *(v for f in comp for v in f.verts)})
            t3 = Vector((t.x, t.y, 0))
            cuts = [(t3 * (rs0 + cw * i), t3) for i in range(cols + 1)] + [(Vector((0, 0, z)), Vector((0, 0, 1))) for z in zcuts]
            for co, no in cuts:
                res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-4)
                geom = [g for g in res['geom'] if g.is_valid]
            shop_p = upper_p = None
            for f in [g for g in geom if isinstance(g, bmesh.types.BMFace)]:
                c = f.calc_center_median(); i = math.floor((c.to_2d().dot(t) - rs0) / cw)
                if not 0 <= i < cols: continue
                for r, (z0, z1, kind) in enumerate(rows):
                    if not (z0 - 1e-3 <= c.z <= z1 + 1e-3) or not valid[r][i]: continue
                    if kind == 'shop':
                        if shop_p is None: params.append((GROUNDW, rs0, cw, base, GROUND_FLOOR)); shop_p = len(params) - 1
                        f[layer] = shop_p; f.material_index = GROUNDW
                    else:
                        if upper_p is None: params.append((upper_mat, rs0, cw, up0, floor_h)); upper_p = len(params) - 1
                        f[layer] = upper_p; f.material_index = upper_mat
                    break
    return params


def style(ob):
    cat = ART.get(ob.get('art_txt'), 'structure')
    seed = zlib.crc32(ob.name.encode()) % 997
    windows = cat != 'structure'
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts[:], edges=bm.edges[:])
    bm.normal_update()
    zmin = min(v.co.z for v in bm.verts)
    if ob.get('art_txt') == 'Pfeiler':  # river piers: keep them below the (lifted) bridge decks
        for v in bm.verts:
            h = _gbvh.ray_cast(Vector((v.co.x, v.co.y, 500)), Vector((0, 0, -1)))
            if h[0] is not None and h[0].z > zmin + 0.5: v.co.z = min(v.co.z, h[0].z - 0.95)
    # hidden bottom faces on the ground
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9 and f.calc_center_median().z < zmin + 0.5], context='FACES')
    if not bm.faces: bm.free(); return None
    base = street_level(bm, zmin)  # floors and the shop band start at the street, not at the buried bottom
    # walls: truly vertical faces always; near-vertical ones only below the eaves (steep spires = roof)
    vert_tops = sorted(max(v.co.z for v in f.verts) for f in bm.faces if abs(f.normal.z) < 0.01)
    eave0 = vert_tops[len(vert_tops) // 2] if vert_tops else base
    is_wall = lambda f: abs(f.normal.z) < 0.01 or (abs(f.normal.z) < 0.1 and f.calc_center_median().z < eave0)
    walls = [f for f in bm.faces if is_wall(f)]
    height = max(v.co.z for v in bm.verts) - base
    if cat not in ('residential', 'structure') and height >= LANDMARK_H: cat = 'landmark'
    shutters = cat == 'residential' and seed % 3 != 0
    timber = ob.name in TIMBER_BUILDINGS
    shop_band = windows and not timber and cat != 'landmark' and height > GROUND_FLOOR + 1.5
    # fit upper floors between shop band and eaves (median wall top)
    tops = sorted(max(v.co.z for v in f.verts) for f in bm.faces if is_wall(f))
    eave = tops[len(tops) // 2] if tops else base + height
    upper = eave - base - (GROUND_FLOOR if shop_band else 0)
    floor_h = upper / max(1, round(upper / FLOOR)) if upper > 1.5 else FLOOR
    # pointy roofs: steep roof faces grouped around a peak vertex (3+ steep faces, nothing higher nearby)
    steep = lambda f: not is_wall(f) and 0 < f.normal.z < POINTY_NZ
    pointy = set()
    for v in bm.verts:
        fs = [f for f in v.link_faces if steep(f)]
        if len(fs) < 3 or any(e.other_vert(v).co.z > v.co.z + 0.01 for e in v.link_edges): continue
        region, stack = set(fs), list(fs)
        while stack:
            c = stack.pop()
            for e in c.edges:
                for o in e.link_faces:
                    if o not in region and steep(o): region.add(o); stack.append(o)
        xs = [w.co.x for f in region for w in f.verts]; ys = [w.co.y for f in region for w in f.verts]
        if max(max(xs) - min(xs), max(ys) - min(ys)) <= POINTY_SIZE: pointy |= region
    params = layout_facades(bm, is_wall, base, floor_h, shop_band, windows and not timber, SHUTTERS if shutters else WALL, -1 if ob.name in FORCE_WINDOWS else _occ_index.get(ob.name, -1))
    # re-merge the cut pieces (same plane + same material) and drop collinear cut vertices
    walls_now = [f for f in bm.faces if is_wall(f)]
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=list({v for f in walls_now for v in f.verts}),
                             edges=list({e for f in walls_now for e in f.edges}), delimit={'MATERIAL'})
    flayer = bm.faces.layers.int['facade']
    uv = bm.loops.layers.uv.new('UVMap'); st = bm.loops.layers.uv.new('Style')
    col = bm.loops.layers.color.new('Col')
    wall_c = walls_pal[cat][seed % len(walls_pal[cat])]
    flat_ids, pitched = roofs_pal['flat'], roofs_pal['pitched']
    for f in bm.faces:
        n = f.normal
        if is_wall(f):
            t = Vector((-n.y, n.x)).normalized() if n.xy.length > 1e-6 else Vector((1, 0))
            info = params[f[flayer]] if f[flayer] >= 0 else None
            if timber: f.material_index = TIMBER
            elif info: f.material_index = info[0]
            else: f.material_index = PLAIN
            for l in f.loops:
                sv, z = l.vert.co.xy.dot(t), l.vert.co.z
                if timber: l[uv].uv = (sv / 3.0, (z - base) / 3.0)
                elif info: l[uv].uv = ((sv - info[1]) / info[2], (z - info[3]) / info[4])
                else: l[uv].uv = (sv / CELL, (z - base) / FLOOR)  # plain plaster, same pixel scale as windows
            c = wall_c
        elif n.z > 0.97 or n.z < -0.3:
            f.material_index = FLAT if n.z > 0 else PLAIN
            for l in f.loops: l[uv].uv = (l.vert.co.x / 4, l.vert.co.y / 4)
            c = flat_ids[seed % len(flat_ids)] if n.z > 0 else wall_c
        else:
            spire = f in pointy or (cat == 'landmark' and n.z < SPIRE_NZ and f.calc_center_median().z > base + SPIRE_FROM * height)
            f.material_index = SPIRE if spire else ROOF
            h = Vector((0, 0, 1)).cross(n).normalized(); d = n.cross(h).normalized()
            for l in f.loops: l[uv].uv = (l.vert.co.dot(h) / ROOF_TILE, l.vert.co.dot(d) / ROOF_TILE)
            c = (roofs_pal['spire'] if f.material_index == SPIRE else pitched)[seed % len(roofs_pal['spire'] if f.material_index == SPIRE else pitched)]
        rgb = (*hexrgb(c), 1.0)  # byte colour layer: Blender stores these as sRGB
        for l in f.loops:
            l[st].uv = (CATEGORIES.index(cat), seed)
            l[col] = rgb
    # roof thickness: a band hanging below every pitched/spire roof edge that is not shared with another roof face
    roofish = {ROOF, SPIRE}
    for f in [f for f in bm.faces if f.material_index in roofish]:
        fc = f.calc_center_median()
        for e in f.edges:
            if any(o is not f and o.material_index in roofish for o in e.link_faces): continue
            a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
            h = Vector((b.x - a.x, b.y - a.y, 0))
            if (b - a).length < FASCIA_MIN or h.length < 1e-3: continue
            out = Vector((-h.y, h.x, 0)).normalized()
            if out.dot((a + b) / 2 - fc) < 0: out = -out
            o = out * 0.06; dz = Vector((0, 0, ROOF_THICK))
            nf = bm.faces.new([bm.verts.new(p) for p in (a + o, b + o, b + o - dz, a + o - dz)])
            nf.material_index = f.material_index; nf.normal_update()
            if nf.normal.dot(out) < 0: nf.normal_flip()
            hd = h.normalized(); src = f.loops[0]
            for l in nf.loops:
                l[uv].uv = ((l.vert.co - a).to_2d().dot(hd.to_2d()) / ROOF_TILE, l.vert.co.z / ROOF_TILE)
                l[st].uv = src[st].uv; l[col] = src[col]
    me = bpy.data.meshes.new(ob.name + '_s'); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(ob.name + '_s', me)
    for k in ('art_txt', 'egid', 'h_boden', 'h_first'):
        if k in ob: o[k] = ob[k]
    o['category'] = cat; o['seed'] = seed
    dst.objects.link(o)
    return len(me.polygons)

import time; t0 = time.time()
faces = 0
for ob in src.objects:
    if ob.name in MANUAL_GONE or kept(ob.name + '_s'): continue
    faces += style(ob) or 0
bpy.context.view_layer.layer_collection.children['Buildings'].hide_viewport = True
tris = 0
for o in dst.objects:
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print('styled', len(dst.objects), 'faces', faces, 'tris', tris, round(time.time() - t0, 1), 's')
