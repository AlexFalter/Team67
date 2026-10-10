import bpy, math, random, os
from mathutils import Vector
ROOT='/Users/mgershman/zurich-eth-run'
random.seed(1905)
collection=bpy.data.collections.new('Einstein Teleporter Models');bpy.context.scene.collection.children.link(collection)
for o in bpy.context.selected_objects:o.select_set(False)
def material(name,color,metal=0,glow=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=.38 if metal else .75
 if glow:n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=glow
 return m
skin=material('Warm skin',(.67,.43,.30));hair=material('Silver white hair',(.81,.80,.72));suit=material('Tweed charcoal',(.19,.22,.24));shirt=material('Ivory collar',(.83,.78,.62));dark=material('Shoes and pupils',(.045,.045,.047));bronze=material('Brushed copper',(.48,.25,.10),.78);steel=material('Midnight steel',(.055,.095,.12),.75);cyan=material('Ion turquoise',(.045,.8,.73),.3,3);gold=material('Warm indicators',(.95,.55,.08),.4,2)
def own(o,name,mat,parent):
 o.name=name
 for c in list(o.users_collection):c.objects.unlink(o)
 collection.objects.link(o);o.parent=parent
 if mat:o.data.materials.append(mat)
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=True
 return o
def root(name):
 o=bpy.data.objects.new(name,None);collection.objects.link(o);return o
def ball(name,loc,scale,mat,parent):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=loc);o=own(bpy.context.object,name,mat,parent);o.scale=scale;return o
def box(name,loc,scale,mat,parent,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=own(bpy.context.object,name,mat,parent);o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=3;o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o
def rod(name,a,b,r,mat,parent):
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=d.length,location=(Vector(a)+Vector(b))/2);o=own(bpy.context.object,name,mat,parent);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def ring(name,loc,major,minor,mat,parent):
 bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=10,location=loc,major_radius=major,minor_radius=minor);o=own(bpy.context.object,name,mat,parent);o.rotation_euler.x=math.pi/2;return o
albert=root('AlbertEinstein')
for side in [-1,1]:
 ball('Leather shoe',(side*.14,-.065,.085),(.105,.21,.085),dark,albert)
 rod('Trouser leg',(side*.14,0,.15),(side*.13,0,.86),.105,suit,albert)
ball('Tweed jacket torso',(0,0,1.07),(.29,.18,.34),suit,albert)
box('Ivory shirt front',(0,-.174,1.24),(.19,.025,.24),shirt,albert,.01)
for side in [-1,1]:
 lapel=box('Tweed lapel',(side*.12,-.18,1.24),(.095,.035,.28),suit,albert,.01);lapel.rotation_euler.y=side*.24
 rod('Jacket sleeve',(side*.27,0,1.3),(side*.37,-.03,.91),.088,suit,albert)
 ball('Expressive hand',(side*.37,-.05,.85),(.07,.065,.105),skin,albert)
for z in [.95,1.06,1.16]:ball('Jacket button',(.035,-.184,z),(.017,.01,.017),dark,albert)
rod('Neck',(0,0,1.35),(0,0,1.49),.085,skin,albert)
ball('Head',(0,0,1.62),(.18,.155,.235),skin,albert)
for side in [-1,1]:
 ball('Ear',(side*.18,0,1.61),(.035,.032,.067),skin,albert)
 ball('Eye ivory',(side*.073,-.145,1.665),(.040,.012,.022),shirt,albert)
 ball('Pupil',(side*.073,-.157,1.663),(.013,.006,.013),dark,albert)
 brow=ball('Bushy eyebrow',(side*.073,-.15,1.70),(.057,.014,.018),hair,albert);brow.rotation_euler.y=side*.17
 ball('Moustache',(side*.045,-.157,1.545),(.061,.025,.032),hair,albert)
ball('Nose',(0,-.159,1.606),(.033,.06,.052),skin,albert)
ball('Mouth',(0,-.15,1.507),(.046,.009,.009),dark,albert)
for i in range(38):
 a=random.uniform(0,math.tau);z=random.uniform(1.70,1.86);x=math.cos(a)*.17;y=math.sin(a)*.13
 if y<-.05 and z<1.80:continue
 tuft=ball('Wild silver hair',(x,y,z),(.055,.06,random.uniform(.065,.115)),hair,albert);tuft.rotation_euler=(random.uniform(-.6,.6),random.uniform(-.6,.6),a)
for side in [-1,1]:
 for i in range(5):ball('Flared temple hair',(side*(.17+i*.011),.035,1.66+i*.028),(.065,.055,.035),hair,albert)
portal=root('EinsteinTeleporter')
box('Landing plinth',(0,0,.12),(2.9,1.9,.24),steel,portal,.12)
box('Copper deck trim',(0,0,.25),(2.6,1.65,.045),bronze,portal,.025)
ring('Outer copper portal',(0,.25,1.62),1.30,.105,bronze,portal)
ring('Steel structural ring',(0,.29,1.62),1.17,.095,steel,portal)
ring('Luminous ion channel',(0,.16,1.62),1.11,.037,cyan,portal)
for i in range(12):
 a=math.tau*i/12;x=math.sin(a)*1.29;z=1.62+math.cos(a)*1.29
 b=box('Radial coil',(x,.25,z),(.19,.31,.16),steel,portal,.025);b.rotation_euler.y=a
 ball('Coil status lamp',(x,.075,z),(.045,.025,.045),gold if i%3==0 else cyan,portal)
for side in [-1,1]:
 rod('Stabilizer',(side*1.10,.4,.27),(side*.92,.4,.76),.08,bronze,portal)
 for i in range(5):ring('Induction coil',(side*1.27,.25,.46+i*.075),.12,.02,bronze,portal)
box('Control pedestal',(1.12,-.54,.72),(.37,.36,.94),steel,portal)
box('Turquoise control display',(1.12,-.735,1.03),(.24,.024,.15),cyan,portal,.01)
for i in range(3):ball('Console switch',(1.04+i*.075,-.744,.86),(.021,.018,.021),gold,portal)
for x in [-.85,-.4,0,.4,.85]:box('Deck light strip',(x,-.45,.28),(.025,.8,.015),cyan,portal,.003)
def export(obj,file):
 bpy.ops.object.select_all(action='DESELECT')
 obj.select_set(True)
 for o in obj.children_recursive:o.select_set(True)
 bpy.context.view_layer.objects.active=obj
 bpy.ops.export_scene.gltf(filepath=ROOT+'/public/models/'+file,export_format='GLB',use_selection=True,export_apply=True)
export(albert,'einstein.glb');export(portal,'einstein-teleporter.glb')
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/assets/blender/einstein-teleporter.blend',copy=True)
print('Exported Einstein and teleporter, editable blend saved; previous scene objects preserved.')
