import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Find bridge decks that the land cover draped into the river.

A deck = connected non-water ground faces sitting near the local water level, close to water,
touching raised bank ground at two opposite ends. Returns dicts with faces/verts/fixed verts and
a local frame (x along the bridge, y across).
"""
import bmesh, math
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

def find_decks(bm, mats, min_area=25.0):
    wi, qi, fi = mats.index('G_Water'), mats.index('G_Quay'), mats.index('G_Footprint')
    water_v = [v for v in bm.verts if any(f.material_index == wi for f in v.link_faces)]
    kd = KDTree(len(water_v))
    for i, v in enumerate(water_v): kd.insert((v.co.x, v.co.y, 0), i)
    kd.balance()
    def water_level(p, r=25):
        near = kd.find_range((p.x, p.y, 0), r)
        return min(water_v[i].co.z for _, i, _ in near) if near else None
    sunk = set()
    for f in bm.faces:
        if f.material_index in (wi, qi, fi): continue
        c = f.calc_center_median(); wl = water_level(c)
        if wl is not None and c.z < wl + 1.5: sunk.add(f)
    decks, seen = [], set()
    for f in sunk:
        if f in seen: continue
        region, stack = [], [f]; seen.add(f)
        while stack:
            c = stack.pop(); region.append(c)
            for e in c.edges:
                for o in e.link_faces:
                    if o in sunk and o not in seen: seen.add(o); stack.append(o)
        area = sum(r.calc_area() for r in region)
        if area < min_area: continue
        verts = {v for r in region for v in r.verts}
        wl = min(water_level(v.co, 40) or 99 for v in verts)
        rset = set(region)
        fixed = {v for v in verts if any(o not in rset and o.material_index not in (wi, qi) and o.calc_center_median().z > wl + 1.5 for o in v.link_faces)}
        if len(fixed) < 2: continue
        # two bank clusters = the fixed verts farthest apart, split by nearest seed
        pts = list(fixed)
        cen = sum((v.co.xy for v in pts), Vector((0, 0))) / len(pts)
        a = max(pts, key=lambda v: ((v.co.xy - cen).length, v.co.x, v.co.y))  # deterministic bank ends
        b = max(pts, key=lambda v: (v.co.xy - a.co.xy).length)
        span = (b.co.xy - a.co.xy).length
        ca = [v for v in pts if (v.co.xy - a.co.xy).length < (v.co.xy - b.co.xy).length]
        cb = [v for v in pts if v not in ca]
        if span < 12 or not ca or not cb: continue
        pa = sum((v.co for v in ca), Vector()) / len(ca); pb = sum((v.co for v in cb), Vector()) / len(cb)
        axis = (pb - pa).to_2d()
        if axis.length < 10: continue
        mid = (pa + pb) / 2
        ang = math.atan2(axis.y, axis.x)
        frame = Matrix.Translation((mid.x, mid.y, 0)) @ Matrix.Rotation(ang, 4, 'Z')
        decks.append(dict(faces=region, verts=verts, fixed=fixed, frame=frame, length=axis.length,
                          water_z=wl, area=area, center=mid))
    return decks


def official_bridges():
    """Official deck objects (type Bruecke_Passerelle) in the source building collection: (name, min, max)."""
    out = []
    for o in bpy.data.collections['Buildings'].objects:
        if o.get('art_txt') != 'Bruecke_Passerelle': continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        out.append((o.name, Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))),
                    Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))))
    return out


def spans_water(deck, is_water_at, is_deck_at):
    """Across the deck at its middle (and +-25% of its length): water on both sides."""
    F = deck['frame']
    hits = 0
    for u in (0.0, -0.25 * deck['length'], 0.25 * deck['length']):
        ok = True
        for s in (-1, 1):
            y = 0.0
            while y * s < 40 and is_deck_at(F @ Vector((u, y, 0))): y += s * 0.5
            if not any(is_water_at(F @ Vector((u, y + s * d, 0))) for d in (0.5, 2, 4, 6)): ok = False
        hits += ok
    return hits >= 2


def best_frame(faces, is_water_at, is_deck_at):
    """Bridge axis = heading (5° steps) where probes across the deck most often find water on both sides.

    Returns (frame, length, score); frame origin at the deck centroid, x along the bridge."""
    area = sum(f.calc_area() for f in faces) or 1
    c = sum((f.calc_center_median() * f.calc_area() for f in faces), Vector()) / area
    best = None
    for deg in range(0, 180, 5):
        F = Matrix.Translation((c.x, c.y, 0)) @ Matrix.Rotation(math.radians(deg), 4, 'Z')
        score, width = 0, 0.0
        for u in range(-12, 13, 3):
            ok = True
            for s in (-1, 1):
                y = 0.0
                while abs(y) < 40 and is_deck_at(F @ Vector((u, y, 0))): y += s * 0.5
                width += abs(y)
                if not any(is_water_at(F @ Vector((u, y + s * d, 0))) for d in (0.5, 2, 4, 6)): ok = False
            score += ok
        key = (score, -width)
        if best is None or key > best[0]: best = (key, F)
    F = best[1]
    ext = []
    for s in (-1, 1):
        x = 0.0
        while abs(x) < 200 and is_deck_at(F @ Vector((x, 0, 0))): x += s * 0.5
        ext.append(abs(x))
    # recentre along the axis
    shift = (ext[1] - ext[0]) / 2
    F = F @ Matrix.Translation((shift, 0, 0))
    return F, ext[0] + ext[1], best[0][0]
