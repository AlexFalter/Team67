"""Stylized performer and rolling party speaker from the supplied Tiki Tiki reference."""
import bpy, math, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=61

def mat(name,color,metal=0,glow=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.65
 if glow:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=glow
 return m
hoodie=mat('Charcoal hoodie',(.033,.039,.046));jeans=mat('Washed pale blue denim',(.43,.60,.73));skin=mat('Warm skin',(.78,.55,.39));hair=mat('Brown tousled fringe',(.16,.09,.043));sole=mat('White sneaker soles',(.9,.91,.88));black=mat('Speaker cabinet and sneakers',(.018,.019,.025));grille=mat('Speaker mesh',(.055,.063,.075),.25);pink=mat('Pink LED rings',(1,.015,.28),glow=2);blue=mat('Blue LED details',(.015,.25,1),glow=2);metal=mat('Telescoping handle',(.25,.27,.3),.8);shirt=mat('Olive T-shirt hem',(.38,.4,.24))
def empty(name,loc=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=loc;return o

def mesh(name,loc,scale,material,parent=None,shape='box'):
 if shape=='sphere':bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8)
 elif shape=='cylinder':bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=1,depth=1)
 else:bpy.ops.mesh.primitive_cube_add(size=1)
 o=bpy.context.object;o.name=name;o.parent=parent;o.location=loc;o.scale=scale;o.data.materials.append(material)
 if shape=='box':
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);b=o.modifiers.new('Soft edges','BEVEL');b.width=.018;b.segments=2
 return o
root=empty('TikiPerformer');body=empty('DanceBody',(0,0,.92),root)
mesh('Hoodie torso',(0,0,.28),(.49,.30,.57),hoodie,body)
mesh('Olive shirt hem',(0,0,-.015),(.46,.28,.085),shirt,body)
mesh('Hoodie pocket',(0,-.163,.13),(.30,.025,.14),hoodie,body)
mesh('Bunched hood',(0,.055,.59),(.23,.17,.12),hoodie,body,'sphere')
for x in [-.065,.065]:mesh('Drawstring',(x,-.17,.43),(.009,.009,.14),sole,body)
head=empty('NoddingHead',(0,-.015,.73),body)
mesh('Face',(0,0,0),(.145,.125,.185),skin,head,'sphere')
mesh('Nose',(0,-.132,-.01),(.027,.04,.032),skin,head,'sphere')
mesh('Hair cap',(0,.017,.12),(.153,.13,.105),hair,head,'sphere')
for i in range(7):
 tuft=mesh('Tousled fringe',((i-3)*.035,-.083,.12-(i%3)*.015),(.041,.048,.09),hair,head,'sphere');tuft.rotation_euler.y=(i-3)*.13
for x in [-.055,.055]:
 mesh('Eye',(x,-.117,.018),(.016,.009,.012),black,head,'sphere');mesh('Brow',(x,-.119,.05),(.038,.009,.009),hair,head)
mesh('Smile',(0,-.121,-.066),(.056,.008,.01),hair,head)
limbs=[]
for side in [-1,1]:
 arm=empty('LeftArm' if side<0 else 'RightArm',(side*.27,0,.49),body)
 mesh('Hoodie sleeve',(side*.025,0,-.17),(.15,.17,.38),hoodie,arm)
 mesh('Hand',(side*.025,0,-.40),(.062,.056,.085),skin,arm,'sphere')
 leg=empty('LeftLeg' if side<0 else 'RightLeg',(side*.125,0,.91),root)
 mesh('Denim leg',(0,0,-.38),(.19,.21,.77),jeans,leg)
 mesh('Denim seam',(side*.097,0,-.37),(.007,.18,.68),jeans,leg)
 mesh('Sneaker',(0,-.07,-.85),(.19,.32,.11),black,leg)
 mesh('Sneaker sole',(0,-.07,-.91),(.195,.33,.045),sole,leg)
 mesh('White sneaker trim',(0,-.215,-.83),(.13,.015,.025),sole,leg)
 limbs.append((side,arm,leg))
# Reference speaker sits on the ground, with a pull handle and two large illuminated drivers.
speaker=empty('MusicBox',(.66,.08,0),root)
mesh('Party speaker cabinet',(0,0,.51),(.40,.34,.96),black,speaker)
mesh('Front grille',(0,-.18,.51),(.355,.025,.84),grille,speaker)
for z in [.30,.71]:
 driver=mesh('Speaker driver',(0,-.202,z),(.15,.15,.025),black,speaker,'cylinder');driver.rotation_euler.x=math.pi/2
 bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,major_radius=.142,minor_radius=.013)
 ring=bpy.context.object;ring.name='Glowing speaker ring';ring.parent=speaker;ring.location=(0,-.227,z);ring.rotation_euler.x=math.pi/2;ring.data.materials.append(pink)
 cone=mesh('Driver center',(0,-.225,z),(.065,.065,.021),grille,speaker,'sphere')
mesh('Blue LED strip',(0,-.205,.94),(.30,.012,.013),blue,speaker)
mesh('Top control panel',(0,-.05,1.001),(.25,.15,.018),grille,speaker)
for i in range(4):mesh('Control button',((i-1.5)*.048,-.05,1.017),(.012,.012,.008),blue if i==0 else black,speaker,'cylinder')
for x in [-.125,.125]:
 mesh('Pull handle rails',(x,.11,1.16),(.018,.018,.42),metal,speaker)
 wheel=mesh('Trolley wheel',(x,.1,.065),(.055,.055,.05),black,speaker,'cylinder');wheel.rotation_euler.y=math.pi/2
mesh('Pull handle grip',(0,.11,1.37),(.29,.035,.035),black,speaker)
for frame in range(1,62):
 t=(frame-1)/60*2*math.pi;scene.frame_set(frame)
 body.location.z=.92+.025*(1-math.cos(2*t));body.rotation_euler.z=.06*math.sin(t)
 head.rotation_euler.x=.08*math.sin(2*t)
 for side,arm,leg in limbs:
  arm.rotation_euler=(.24+.22*math.sin(t+side),side*.12,side*.12+.12*math.sin(t))
  leg.rotation_euler.x=.035*math.sin(t+side*math.pi/2)
  arm.keyframe_insert('rotation_euler',frame=frame);leg.keyframe_insert('rotation_euler',frame=frame)
 body.keyframe_insert('location',frame=frame);body.keyframe_insert('rotation_euler',frame=frame);head.keyframe_insert('rotation_euler',frame=frame)
# Batch static meshes per pivot; keep the speaker separate for audio origin and inspection.
for parent in [body,head,speaker,*[a for _,a,_ in limbs],*[l for _,_,l in limbs]]:
 children=[o for o in parent.children if o.type=='MESH']
 if len(children)>1:
  bpy.ops.object.select_all(action='DESELECT')
  for o in children:o.select_set(True)
  bpy.context.view_layer.objects.active=children[0];bpy.ops.object.join()
scene.frame_set(1)
out=ROOT/'public/models/tiki-performer';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/tiki-performer.blend'))
opts=dict(filepath=str(out/'tiki-performer.glb'),export_format='GLB',export_yup=True,export_animations=True,export_frame_range=True)
if 'export_animation_mode' in bpy.ops.export_scene.gltf.get_rna_type().properties:opts['export_animation_mode']='SCENE'
bpy.ops.export_scene.gltf(**opts)
