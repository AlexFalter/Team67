"""Rebuild the ETH Link's flat, pixel-style livery in its existing GLB.

Run from the repository root with Blender:
  blender -b --python apps/client/assets-src/eth-link/update_livery.py

Coordinates below are Blender coordinates (Z up). The export preserves the
bus's original glTF placement, dimensions, articulation, wheels and doors.
The pixel wordmark is derived from the existing public/assets/eth-zurich.svg.
"""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

import bpy
import bmesh
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parents[4]
MODEL = ROOT / 'apps/client/public/models/battle-bus.glb'
LOGO = ROOT / 'apps/client/public/assets/eth-zurich.svg'


def logo_contours():
    """Flatten the wordmark's absolute SVG commands for pixel scan conversion."""
    path = ET.parse(LOGO).find('.//{http://www.w3.org/2000/svg}path')
    tokens = re.findall(r'[MLHVCZ]|-?\d+(?:\.\d+)?', path.attrib['d'])
    contours, points = [], []
    cursor = (0, 0)
    i = 0
    while i < len(tokens):
        command = tokens[i]
        i += 1
        if command == 'Z':
            contours.append(points)
            points = []
            continue
        count = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6}[command]
        while i < len(tokens) and tokens[i] not in 'MLHVCZ':
            values = list(map(float, tokens[i:i + count]))
            i += count
            if command in ('M', 'L'):
                cursor = tuple(values)
                points.append(cursor)
            elif command == 'H':
                cursor = (values[0], cursor[1])
                points.append(cursor)
            elif command == 'V':
                cursor = (cursor[0], values[0])
                points.append(cursor)
            else:
                a, b, c, d = cursor, values[:2], values[2:4], values[4:]
                for step in range(1, 9):
                    t = step / 8
                    points.append(tuple((1-t)**3*a[k] + 3*(1-t)**2*t*b[k]
                                        + 3*(1-t)*t*t*c[k] + t**3*d[k] for k in range(2)))
                cursor = tuple(d)
    assert contours and not points, 'Expected closed wordmark outlines'
    return contours


def pixel_spans():
    """Rasterize at 240 x 40; horizontal pixel runs become flat mesh quads."""
    contours = logo_contours()
    for row in range(40):
        y = (row + 0.5) / 2
        crossings = []
        for points in contours:
            for a, b in zip(points, points[1:] + points[:1]):
                if (a[1] > y) != (b[1] > y):
                    crossings.append(a[0] + (y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
        crossings.sort()
        pixels = [any(a <= (col + 0.5)/2 < b for a, b in zip(crossings[::2], crossings[1::2]))
                  for col in range(240)]
        start = None
        for col, filled in enumerate(pixels + [False]):
            if filled and start is None:
                start = col
            elif not filled and start is not None:
                yield start, col, row
                start = None


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(MODEL))
# Keep generated graphics separate so this script can be rerun on the result.
for obj in list(bpy.context.scene.objects):
    if obj.name.startswith('ETH_Link_livery_'):
        bpy.data.objects.remove(obj, do_unlink=True)

base = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
materials = {mat.name.split('.')[0]: mat for mat in base.data.materials}
# Preserve the existing red, with neutral bodywork and charcoal window glass.
for name, color, roughness, metallic in [
    ('Warm white body', (0.91, 0.91, 0.89, 1), 0.7, 0.05),
    ('Tinted glazing', (0.018, 0.022, 0.025, 1), 0.4, 0.05),
]:
    mat = materials[name]
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    mat.diffuse_color = color

# Remove the old floating red diamonds and tiny generic side lettering.
mesh = bmesh.new()
mesh.from_mesh(base.data)
remove = []
for face in mesh.faces:
    coords = [base.matrix_world @ v.co for v in face.verts]
    material = base.data.materials[face.material_index].name
    on_side = all(abs(v.x) > 1.30 for v in coords)
    old_red = 'Transit red' in material and all(-8.2 < v.y < 8.2 for v in coords)
    old_wordmark = ('Chassis graphite' in material and
                    all(3.35 < v.y < 4.85 and 1.0 < v.z < 1.30 for v in coords))
    if on_side and (old_red or old_wordmark):
        remove.append(face)
bmesh.ops.delete(mesh, geom=remove, context='FACES')
mesh.to_mesh(base.data)
mesh.free()

red = materials['Transit red']
white = materials['Warm white body']
vertices, faces = {red: [], white: []}, {red: [], white: []}


def panel(side, points, material, offset=0):
    # Both sides share the pattern, with the logo facing forwards for each viewer.
    coords = [Vector((side * (1.338 + offset), y, z)) for y, z in points]
    bucket = vertices[material]
    start = len(bucket)
    bucket.extend(coords)
    for tri in tessellate_polygon([coords]):
        face = tuple(start + (v if isinstance(v, int) else coords.index(v)) for v in tri)
        faces[material].append(face if side > 0 else tuple(reversed(face)))


for side in (-1, 1):
    # The large rear field and stepped diagonal patches echo the reference bus.
    # Keep the articulation, wheel arches, entry doorway and route display clear.
    panel(side, [(-8.65, 1.42), (-8.65, 2.78), (-4.6, 2.78),
                 (-4.3, 2.43), (-3.5, 2.43), (-3.5, 1.7),
                 (-3.15, 1.42), (-3.7, 0.8), (-4.55, 0.8), (-4.2, 1.42)], red)
    for points in [
        [(-3.2, 2.78), (-2.5, 2.78), (-2.1, 2.3), (-2.8, 2.3)],
        [(-2.1, 0.82), (-1.25, 0.82), (-0.9, 1.14), (-1.75, 1.14)],
        [(0.0, 1.38), (0.85, 1.38), (1.25, 0.86), (0.4, 0.86)],
        [(3.7, 2.38), (4.8, 2.38), (4.45, 1.82), (3.35, 1.82)],
        [(4.5, 0.84), (5.2, 0.84), (4.95, 1.12), (4.25, 1.12)],
        [(6.8, 2.76), (7.55, 2.76), (7.35, 2.48), (6.6, 2.48)],
        [(7.75, 0.86), (8.2, 0.86), (8.02, 1.10), (7.57, 1.10)],
    ]:
        panel(side, points, red)
    # A true ETH Zürich wordmark, rendered as crisp square pixels in geometry.
    # Its 3.5 m width keeps the thinner Zürich letters readable in gameplay.
    width = 3.5
    for start, end, row in pixel_spans():
        def point(col, r):
            return (-6.3 + side * (col / 240 - 0.5) * width,
                    2.22 - r / 240 * width)
        panel(side, [point(start, row), point(end, row),
                     point(end, row+1), point(start, row+1)], white, 0.006)

for material in (red, white):
    data = bpy.data.meshes.new('ETH_Link_livery_' + material.name)
    data.from_pydata(vertices[material], [], faces[material])
    data.materials.append(material)
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(obj)

bpy.ops.export_scene.gltf(filepath=str(MODEL), export_format='GLB',
                          export_yup=True, export_materials='EXPORT')
print(f'Updated {MODEL}')
