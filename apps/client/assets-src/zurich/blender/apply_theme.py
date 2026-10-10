import bpy, os
ZH_DIR = globals().get('ZH_DIR') or os.path.dirname(bpy.data.filepath)  # apps/client/assets-src/zurich
"""Recolour the Blender preview from a theme file: set THEME_NAME before exec'ing (default summer)."""
exec(open(ZH_DIR + '/blender/ground_materials.py').read())

def lin(h):
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in hexrgb(h)]

pal = theme['trees']
trees = bpy.data.collections.get('Trees')
for ob in (trees.objects if trees else []):
    colours = pal['conifer'] if ob['kind'] == 'Cone' else pal['leaves']
    ob.color = (*[c * ob.get('jitter', 1.0) for c in lin(colours[ob['color'] % len(colours)])], 1)
print('trees recoloured', len(trees.objects) if trees else 0)

# Buildings: recolour the preview 'Col' attribute from each building's category + seed.
styled = bpy.data.collections.get('BuildingsStyled')
if styled:
    walls, roofs = theme['buildings']['walls'], theme['buildings']['roofs']
    for ob in styled.objects:
        me = ob.data; col = me.color_attributes.get('Col')
        if not col: continue
        cat, seed = ob['category'], ob['seed']
        by_mat = {'G_Roof': roofs['pitched'], 'G_RoofFlat': roofs['flat'], 'G_RoofSpire': roofs['spire']}
        names = [m.name for m in me.materials]
        for p in me.polygons:
            pal = by_mat.get(names[p.material_index], walls[cat])
            rgb = (*hexrgb(pal[seed % len(pal)]), 1.0)
            for li in p.loop_indices: col.data[li].color_srgb = rgb
    print('buildings recoloured', len(styled.objects))
