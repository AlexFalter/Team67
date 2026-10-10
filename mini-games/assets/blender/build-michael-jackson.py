"""Original stylized Billie Jean dancer; rebuild with Blender --background --python this file."""
import bpy, math, pathlib
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.scene.render.fps=30;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=61
bpy.context.preferences.filepaths.save_version=0

def mat(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.48;return m
black=mat('Midnight sequinned jacket',(.025,.03,.045),.3);pants=mat('Black trousers',(.035,.035,.04));white=mat('Ivory shirt and white socks',(.95,.94,.88));glove=mat('Single sparkling white glove',(1,1,1),.35);skin=mat('Warm pale skin',(.79,.59,.46));hair=mat('Black curls',(.018,.012,.018));shoe=mat('Black polished loafers',(.015,.015,.02),.45);silver=mat('Silver sequins',(.61,.65,.74),.8);red=mat('Fedora ribbon',(.25,.025,.04))

def empty(name,loc=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=loc;return o

def mesh(name,loc,scale,material,parent=None,shape='box'):
 if shape=='sphere':bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1)
 elif shape=='cylinder':bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=1,depth=1)
 else:bpy.ops.mesh.primitive_cube_add(size=1)
 o=bpy.context.object;o.name=name;o.parent=parent;o.location=loc;o.scale=scale;o.data.materials.append(material)
 if shape=='box':
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);b=o.modifiers.new('Tailored edges','BEVEL');b.width=.018;b.segments=2
 return o
root=empty('MichaelJackson');body=empty('Torso',(0,0,.95),root)
mesh('Jacket',(0,0,.28),(.48,.28,.53),black,body)
mesh('White V shirt',(0,-.154,.31),(.24,.02,.4),white,body)
for side in [-1,1]:
 lapel=mesh('Jacket lapel',(side*.115,-.17,.38),(.095,.045,.34),black,body);lapel.rotation_euler.y=side*.2
mesh('Silver belt',(0,-.146,.018),(.31,.026,.055),silver,body)
head=empty('Head',(0,-.015,.70),body)
mesh('Face',(0,-.015,0),(.145,.125,.19),skin,head,'sphere')
mesh('Nose',(0,-.14,-.013),(.035,.035,.035),skin,head,'sphere')
for side in [-1,1]:
 mesh('Eyes',(side*.055,-.123,.025),(.021,.018,.012),hair,head)
 mesh('Sideburn',(side*.127,-.03,0),(.027,.06,.19),hair,head)
mesh('Smile',(0,-.132,-.075),(.062,.009,.011),red,head)
for i in range(13):
 a=i*2*math.pi/13;mesh('Curls',(math.cos(a)*.12,math.sin(a)*.1+.025,.10),(.042,.045,.05),hair,head,'sphere')
mesh('Fedora brim',(0,0,.16),(.26,.22,.028),black,head,'cylinder')
mesh('Fedora crown',(0,.01,.245),(.165,.14,.17),black,head,'cylinder')
mesh('Fedora band',(0,.01,.205),(.168,.143,.035),red,head,'cylinder')
# A few bright accents read as sequins without creating a heavy mesh.
for i in range(14):mesh('Sequin',((i%4-1.5)*.075,-.147,.1+(i//4)*.09),(.014,.008,.014),silver,body)
arms=[]
for side in [-1,1]:
 arm=empty('LeftArm' if side<0 else 'RightArm',(side*.26,0,.48),body);arms.append(arm)
 mesh('Sleeve',(side*.03,0,-.14),(.14,.16,.34),black,arm)
 fore=empty('Forearm',(side*.06,-.04,-.31),arm)
 mesh('Lower sleeve',(0,-.09,-.10),(.115,.14,.22),black,fore)
 hand=empty('GlovedHand' if side>0 else 'BareHand',(0,-.12,-.24),fore)
 mesh('Hand',(0,0,0),(.065,.055,.085),glove if side>0 else skin,hand,'sphere')
 for finger in range(4):mesh('Finger',((finger-1.5)*.018,-.026,-.052),(.012,.026,.045),glove if side>0 else skin,hand)
legs=[]
for side in [-1,1]:
 upper=mesh('LeftThigh' if side<0 else 'RightThigh',(0,0,0),(.14,.15,.40),pants,root)
 shin=mesh('LeftShin' if side<0 else 'RightShin',(0,0,0),(.12,.13,.38),pants,root)
 foot=empty('LeftFoot' if side<0 else 'RightFoot',(side*.11,-.12,.045),root)
 mesh('Loafer',(0,.10,.025),(.16,.30,.08),shoe,foot)
 mesh('White sock',(0,.16,.14),(.105,.11,.18),white,foot)
 legs.append((side,upper,shin,foot))

def segment(o,a,b):
 d=b-a;o.location=(a+b)/2;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.scale.z=d.length/.4
for frame in range(1,62):
 t=(frame-1)/60*2*math.pi;bpy.context.scene.frame_set(frame)
 body.location.z=.95+.014*math.sin(t*2);body.rotation_euler.y=.045*math.sin(t);head.rotation_euler.x=-.09+.035*math.cos(t)
 for side,upper,shin,foot in legs:
  phase=t+(math.pi if side<0 else 0);heel=max(0,math.sin(phase))*.58
  foot.location=(side*.11,-.12+.22*math.cos(phase),.045);foot.rotation_euler.x=heel
  ankle=Vector((side*.11,foot.location.y+.14*math.cos(heel),.14+.14*math.sin(heel)))
  hip=Vector((side*.11,0,body.location.z));knee=(hip+ankle)/2+Vector((0,-.09,0))
  segment(upper,hip,knee);segment(shin,knee,ankle)
  for o in [upper,shin,foot]:
   for prop in ['location','rotation_euler','scale']:o.keyframe_insert(prop,frame=frame)
 for i,arm in enumerate(arms):arm.rotation_euler=(.18+.08*math.sin(t+i*math.pi),.05*math.sin(t),(-1 if i==0 else 1)*.08);arm.keyframe_insert('rotation_euler',frame=frame)
 body.keyframe_insert('location',frame=frame);body.keyframe_insert('rotation_euler',frame=frame);head.keyframe_insert('rotation_euler',frame=frame)
# Join static pieces by parent: keep animated pivots, share palette and batch details.
for parent in [body,head,*arms,*[o for o in bpy.data.objects if o.name.startswith(('Forearm','GlovedHand','BareHand','LeftFoot','RightFoot'))]]:
 children=[o for o in list(parent.children) if o.type=='MESH' and not o.animation_data]
 if len(children)>1:
  bpy.ops.object.select_all(action='DESELECT')
  for o in children:o.select_set(True)
  bpy.context.view_layer.objects.active=children[0];bpy.ops.object.join()
bpy.context.scene.frame_set(1)
out=ROOT/'public/models/michael-jackson';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/michael-jackson.blend'))
props=bpy.ops.export_scene.gltf.get_rna_type().properties
opts=dict(filepath=str(out/'michael-jackson.glb'),export_format='GLB',export_yup=True,export_animations=True,export_frame_range=True)
if 'export_animation_mode' in props:opts['export_animation_mode']='SCENE'
bpy.ops.export_scene.gltf(**opts)
print('Built Michael Jackson dancer with 2-second looping moonwalk.')
