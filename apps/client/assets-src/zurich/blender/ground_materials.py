import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Blender preview of the theme: same palettes/patterns as apps/client/src/maps/zurich/theme.ts."""
import bpy, json, random

THEMES = ZH_DIR + '/../../src/maps/zurich/themes/'
THEME_NAME = globals().get('THEME_NAME', 'autumn')  # same default as theme.ts

def load_theme(name):
    t = json.load(open(THEMES + name + '.json'))
    if 'extends' in t:
        base = load_theme(t['extends'])
        for k, v in t.items():
            base[k] = {**base[k], **v} if isinstance(v, dict) and isinstance(base.get(k), dict) else v
        return base
    return t

theme = load_theme(THEME_NAME)
N = theme['texture']['pixels']

def hexrgb(h):
    h = h.lstrip('#')
    return [(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]

def pick(weights, rnd):
    r = rnd.random() * sum(weights)
    for i, w in enumerate(weights):
        r -= w
        if r <= 0: return i
    return 0

FONT = {"A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"], "C": ["011", "100", "100", "100", "011"], "D": ["110", "101", "101", "101", "110"], "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"], "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"], "I": ["111", "010", "010", "010", "111"], "J": ["001", "001", "001", "101", "010"], "K": ["101", "101", "110", "101", "101"], "L": ["100", "100", "100", "100", "111"], "M": ["101", "111", "111", "101", "101"], "N": ["110", "101", "101", "101", "101"], "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"], "Q": ["010", "101", "101", "110", "011"], "R": ["110", "101", "110", "101", "101"], "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"], "U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"], "W": ["101", "101", "111", "111", "101"], "X": ["101", "101", "010", "101", "101"], "Y": ["101", "101", "010", "010", "010"], "Z": ["111", "001", "010", "100", "111"], " ": ["000", "000", "000", "000", "000"], "-": ["000", "000", "111", "000", "000"], "c": ["000", "011", "100", "100", "011"], "o": ["000", "010", "101", "101", "010"], "p": ["000", "110", "101", "110", "100"]}

def text_mask(text, w, h):
    """3x5 pixel font, 1 px spacing, centred; returns set of (x, y) letter pixels."""
    tw = len(text) * 4 - 1
    x0, y0 = (w - tw) // 2, (h - 5) // 2
    on = set()
    for i, ch in enumerate(text):
        for r, row in enumerate(FONT.get(ch) or FONT.get(ch.upper(), FONT[' '])):
            for c, bit in enumerate(row):
                if bit == '1': on.add((x0 + i * 4 + c, y0 + r))
    return on

def phash(a, b, salt=0):
    """Deterministic 32-bit hash, identical in theme.ts."""
    return ((a * 73856093) ^ (b * 19349663) ^ (salt * 83492791)) & 0xffffffff

def pattern_index(spec, x, y, rnd):
    p = spec['pattern']
    w = spec.get('weights') or [1] * len(spec['palette'])
    if p == 'noise': return pick(w, rnd)
    if p == 'tiles':
        tw, th = spec['tile']; row = y // th
        xs = (x + (row % 2) * spec.get('stagger', 0)) % N
        return 0 if (y % th == 0 or xs % tw == 0) else pick(w, rnd)
    if p == 'rails':
        if x % 16 in (5, 11): return 3
        if y % 4 == 0 and 3 <= x % 16 <= 13: return 2
        return 0 if rnd.random() < 0.7 else 1
    if p == 'water':
        if (y % 8 == 3 and (x + y * 3) % 16 < 4) or (y % 8 == 7 and (x + 8 + y * 3) % 16 < 3): return 2
        return 0 if rnd.random() < 0.85 else 1
    if p == 'window':  # one facade cell = one window on one floor; y=0 is the top row
        x0, x1, y0, y1 = N * 4 // 16, N * 12 // 16, N * 3 // 16, N * 13 // 16
        if x0 <= x < x1 and y0 <= y < y1:
            if x in (x0, x1 - 1) or y in (y0, y1 - 1) or x == (x0 + x1) // 2: return 1
            return 3 if (x - x0) == (y - y0) and x - x0 < 3 else 2
        if y == y1 and x0 - 1 <= x <= x1:
            return 7 if spec.get('flowers') and x0 <= x < x1 and x % 2 == 0 else 4  # sill / flower box
        if spec.get('shutters') and y0 <= y < y1 and (x0 - 3 <= x < x0 or x1 <= x < x1 + 3):
            return 6 if y % 3 else 1  # louvred shutters
        if y == 0: return 4  # cornice line between floors
        return 5 if (x + y) % 2 == 0 and rnd.random() < 0.18 else 0  # plaster dither
    if p == 'shopfront':  # ground floor: sign band, big glazing with mullions, dark plinth
        if y < N * 2 // 16: return 5 if (x // 2) % 2 else 1  # striped awning
        if y >= N * 14 // 16: return 6
        x0, x1, y0 = N // 16, N * 15 // 16, N * 3 // 16
        if x0 <= x < x1 and y0 <= y:
            if x in (x0, x1 - 1) or y == y0 or x == N // 2: return 1
            return 3 if (x - x0) == (y - y0) and x - x0 < 3 else 2
        return 4 if y == y0 - 1 else 0
    if p == 'text':
        w, h = spec['size']
        if 'mask' not in spec: spec['mask'] = text_mask(spec['text'], w, h)
        return 1 if (x, y) in spec['mask'] else 0
    if p == 'timber':  # half-timbering: frame + X brace per 16 px panel, plaster dither
        m = N - 1
        if x in (0, m) or y in (0, m) or x == y or x + y == m: return 1
        return 2 if rnd.random() < 0.12 else 0
    if p == 'leaves':  # chunky 2x2 leaf clusters: light, shade, deep shade, highlight
        r = phash(x >> 1, y >> 1) % 100
        return 1 if r < 14 else 2 if r < 34 else 3 if r < 42 else 4 if r < 50 else 0
    if p == 'bark':  # vertical furrows, a few knots, light streaks
        if phash(x // 3, y // 3, 7) % 100 < 4: return 3
        if (x + ((y >> 2) & 1)) % 4 == 0: return 1
        if x % 4 == 2 and phash(x, y >> 1, 3) % 3 == 0: return 2
        return 4 if phash(x, y, 5) % 100 < 15 else 0
    if p == 'rooftiles':  # rows of tiles running along the eaves
        if y % 4 == 3: return 2
        if (x + (y // 4) * 2) % 4 == 0: return 1
        return 3 if rnd.random() < 0.08 else 0
    raise ValueError(p)

def texture(name, spec):
    rnd = random.Random(name)
    pal = [hexrgb(c) for c in spec['palette']]
    pixels = []
    # Blender images start at the bottom row; flip so the PNG matches the browser canvas.
    W, H = spec.get('size', (N, N))
    rows = [[pal[pattern_index(spec, x, y, rnd)] for x in range(W)] for y in range(H)]
    for row in reversed(rows):
        for c in row: pixels += (*c, 1.0)
    img = bpy.data.images.get('T_' + name)  # update in place: materials keep pointing at the same image
    if img is None: img = bpy.data.images.new('T_' + name, W, H, alpha=False)
    elif tuple(img.size) != (W, H): img.scale(W, H)
    img.pixels = pixels
    img.pack()
    return img

def surface_material(mat_name, img, rough=1.0):
    m = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    m.use_nodes = True
    nt = m.node_tree
    for n in [n for n in nt.nodes if n.type == 'TEX_IMAGE']: nt.nodes.remove(n)
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Closest'; tex.location = (-400, 300)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    return m

TINTED = {'Wall', 'WallShutters', 'WallGround', 'Roof', 'RoofFlat', 'RoofSpire', 'Plain'}  # multiplied by the per-building colour attribute
for name, spec in theme['surfaces'].items():
    m = surface_material('G_' + name, texture(name, spec), 0.6 if name == 'Water' else 1.0)
    m.diffuse_color = (*hexrgb(spec['palette'][0]), 1)
    nt = m.node_tree
    for n in [n for n in nt.nodes if n.type in ('VERTEX_COLOR', 'MIX')]: nt.nodes.remove(n)
    if name in TINTED:
        tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE'); bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        col = nt.nodes.new('ShaderNodeVertexColor'); col.layer_name = 'Col'; col.location = (-400, 0)
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.location = (-150, 200)
        mix.inputs['Factor'].default_value = 1.0
        sock = lambda socks, ident: next(x for x in socks if x.identifier == ident)
        nt.links.new(tex.outputs['Color'], sock(mix.inputs, 'A_Color')); nt.links.new(col.outputs['Color'], sock(mix.inputs, 'B_Color'))
        nt.links.new(sock(mix.outputs, 'Result_Color'), bsdf.inputs['Base Color'])
print('theme', THEME_NAME, 'applied to', len(theme['surfaces']), 'surfaces')
