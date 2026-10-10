import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Scene light from the theme's "lighting": sun lamp (direction/colour/strength) + world sky colour.

Same values the game uses (MapViewer: DirectionalLight + HemisphereLight). Set THEME_NAME to preview
another theme. The viewport's material preview is switched to scene lights + scene world.
"""
import math
exec(open(ZH_DIR + '/blender/ground_materials.py').read())  # theme, hexrgb
L = theme['lighting']
lin = lambda h: [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in hexrgb(h)]

sun = bpy.data.objects.get('Sun')
if not sun:
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    bpy.context.scene.collection.objects.link(sun)
sun.data.color = lin(L['sun'])
sun.data.energy = L['sunIntensity'] * 1.6          # W/m2; the game divides by pi (three.js punctual light units)
sun.data.angle = math.radians(2.0)                 # slightly soft shadows
el, az = math.radians(L['sunElevation']), math.radians(L['sunAzimuth'])
# the lamp points down -Z of its object: rotate so it shines FROM azimuth/elevation (azimuth from north, clockwise)
sun.rotation_euler = (math.pi / 2 - el, 0, math.pi - az)
sun.location = (0, -500, 600)

world = bpy.context.scene.world or bpy.data.worlds.new('World')
bpy.context.scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (*lin(L['skyLight']), 1)
bg.inputs['Strength'].default_value = L['hemiIntensity'] * 0.55
bpy.context.scene.view_settings.view_transform = 'AgX'
bpy.context.scene.view_settings.exposure = math.log2(L.get('exposure', 1))  # game: toneMappingExposure (linear)
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        sh = area.spaces.active.shading
        sh.type = 'MATERIAL'; sh.use_scene_lights = True; sh.use_scene_world = True
print('scene light from theme', THEME_NAME, L)
