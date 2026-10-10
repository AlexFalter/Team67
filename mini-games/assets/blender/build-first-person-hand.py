"""Bake CC0 Godot XR Tools anatomy into lightweight posed first-person meshes."""
import bpy, math
from mathutils import Vector, Matrix
BASE='/Users/mgershman/zurich-eth-run'
bpy.ops.wm.open_mainfile(filepath=BASE+'/assets/blender/xr-hand/hand_r.blend')
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.name=='mesh_Hand_R')
for o in list(bpy.context.scene.objects):
 if o not in (arm,mesh):bpy.data.objects.remove(o,do_unlink=True)
with bpy.data.libraries.load(BASE+'/assets/blender/xr-hand/animations_hand_r.blend')as(s,t):t.actions=s.actions
skin=bpy.data.materials.new('Textured skin');skin.use_nodes=True
nodes=skin.node_tree.nodes;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Roughness'].default_value=.65
tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(BASE+'/assets/blender/xr-hand/skin.png');skin.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
mesh.data.materials.clear();mesh.data.materials.append(skin)
# Source has length along Blender Y, spread along Z, dorsal surface along -X.
# Converted to a vertical reverse grip: fingers travel left and wrap behind handle.
M=Matrix(((0,-1,0,.11), (1,0,0,-.034), (0,0,1,-.076),(0,0,0,1)))
# Blender coordinates above export to game (x,z,-y).
root=bpy.data.objects.new('FirstPersonHand',None);bpy.context.collection.objects.link(root)
for pose,name in [('Grip','Knife hand'),('Grip','Walking hand')]:
 arm.animation_data_clear()
 for bone in arm.pose.bones:bone.rotation_mode='QUATERNION';bone.matrix_basis.identity()
 action=bpy.data.actions[pose]
 for layer in action.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for f in bag.fcurves:
     try:arm.path_resolve(f.data_path)[f.array_index]=f.evaluate(1)
     except (ValueError,AttributeError):pass
 bpy.context.view_layer.update()
 if name=='Knife hand':
  # A slightly relaxed index rather than a rigid pointing finger.
  for b in arm.pose.bones:
   if b.name.startswith('Index_') and 'Metacarpal' not in b.name:
    b.rotation_mode='QUATERNION';b.rotation_quaternion.identity()
  arm.pose.bones['Index_Distal_R'].rotation_quaternion=arm.pose.bones['Middle_Distal_R'].rotation_quaternion.copy()
 bpy.context.view_layer.update()
 if name=='Knife hand':
  b=arm.pose.bones['Index_Proximal_R'];pivot=b.head.copy();b.matrix=Matrix.Translation(pivot) @ Matrix.Rotation(.95,4,'X') @ Matrix.Translation(-pivot) @ b.matrix
  bpy.context.view_layer.update()
 if name=='Walking hand':
  for part in ['Proximal','Intermediate','Distal']:
   arm.pose.bones['Index_'+part+'_R'].rotation_quaternion=arm.pose.bones['Middle_'+part+'_R'].rotation_quaternion.copy()
  bpy.context.view_layer.update()
 baked=bpy.data.meshes.new_from_object(mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()))
 baked.transform(M)

 o=bpy.data.objects.new(name,baked);bpy.context.collection.objects.link(o);o.parent=root
 for f in baked.polygons:f.use_smooth=True
# Cloth sleeve is shaped along wrist axis, with curved rings and subtle folds.
def cloth(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.95;return m
cream=cloth('Cream cotton',(.89,.8,.65));rib=cloth('Ribbed cuff',(.70,.64,.53))
# Game wrist is at (.11,-.076,.06); sleeve exits down/right toward player.
P=lambda p:Vector((p[0],-p[2],p[1]))
centers=[((.11,-.076,.034),.028),((.135,-.093,.055),.033),((.17,-.13,.10),.038),((.22,-.20,.16),.048),((.27,-.32,.23),.057),((.32,-.56,.35),.064)]
verts=[];faces=[]
axis=(P(centers[-1][0])-P(centers[0][0])).normalized();u=axis.cross(Vector((0,0,1))).normalized();v=axis.cross(u)
for k,(p,r) in enumerate(centers):
 for i in range(32):
  a=math.tau*i/32;fold=1+.025*math.sin(a*8+k);verts.append(P(p)+(u*math.cos(a)+v*math.sin(a))*r*fold)
for k in range(len(centers)-1):
 for i in range(32):faces.append((k*32+i,k*32+(i+1)%32,(k+1)*32+(i+1)%32,(k+1)*32+i))
data=bpy.data.meshes.new('Sleeve cloth');data.from_pydata(verts,[],faces);data.materials.append(cream);data.materials.append(rib)
o=bpy.data.objects.new('Hoodie sleeve',data);bpy.context.collection.objects.link(o);o.parent=root
for f in data.polygons:f.use_smooth=True;f.material_index=1 if f.index<32 else 0
sub=o.modifiers.new('Fabric smoothing','SUBSURF');sub.levels=2
bpy.data.objects.remove(mesh,do_unlink=True);bpy.data.objects.remove(arm,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=BASE+'/public/models/first-person-hand.glb',export_format='GLB',use_selection=True,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=BASE+'/assets/blender/first-person-hand.blend')
