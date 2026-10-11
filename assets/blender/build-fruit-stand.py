import bpy, math, pathlib
from mathutils import Vector
BASE=pathlib.Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.72;return m
wood=material('warm oak',(.38,.18,.065));dark=material('crate wood',(.21,.09,.025));red=material('tomato red',(.85,.035,.015));green=material('leaf green',(.08,.3,.025));applemat=material('apple green',(.4,.65,.035));cream=material('awning cream',(.94,.85,.62));stripe=material('awning red',(.65,.035,.025))
def xyz(p):return (p[0],-p[2],p[1])
def box(name,p,size,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.name=name;o.scale=(size[0],size[2],size[1]);o.data.materials.append(mat);return o
def fruit(name,p,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=xyz(p));o=bpy.context.object;o.name=name;o.scale=(.11,.11,.095);o.data.materials.append(mat)
 for f in o.data.polygons:f.use_smooth=True
 box(name+' stem',(p[0],p[1]+.105,p[2]),(.014,.06,.014),dark)
 for i in range(5):
  a=i*math.tau/5;leaf=box(name+' leaf',(p[0]+math.cos(a)*.035,p[1]+.1,p[2]+math.sin(a)*.035),(.065,.008,.02),green);leaf.rotation_euler.z=a
 return o
def label(text,p):
 bpy.ops.object.text_add(location=xyz(p),rotation=(math.pi/2,0,math.pi));o=bpy.context.object;o.name=text;o.data.body=text;o.data.size=.17;o.data.align_x='CENTER';o.data.extrude=.002;o.data.materials.append(cream)
box('counter',(0,.9,0),(2.8,.12,1.1),wood)
for x in [-1.25,1.25]:
 for z in [-.4,.4]:box('leg',(x,.43,z),(.11,.86,.11),wood)
 box('canopy pole',(x,1.6,.4),(.075,2.9,.075),wood)
for i in range(10):box('striped canopy',(-1.35+i*.3,2.7,0),(.3,.09,1.5),stripe if i%2 else cream)
box('front sign',(0,.67,-.565),(2.4,.4,.05),dark);label('APPLES  &  TOMATOES',(0,.66,-.60))
for center,mat,name in [(-.7,applemat,'Apple'),(.7,red,'Tomato')]:
 box('crate floor',(center,1,0),(1.2,.08,.8),dark)
 for z in [-.4,.4]:box('crate edge',(center,1.1,z),(1.2,.2,.04),wood)
 for x in [center-.6,center+.6]:box('crate edge',(x,1.1,0),(.04,.2,.8),wood)
 for i in range(4):
  for j in range(3):
   if name=='Apple':fruit(name,(center-.42+i*.28,1.14,-.25+j*.25),mat)
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'assets/blender/fruit-stand.blend'))
# Keep the .blend editable; merge the exported static stand by material.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.convert(target='MESH')
for mat in [wood,dark,red,green,applemat,cream,stripe]:
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
 if not objects:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
bpy.ops.export_scene.gltf(filepath=str(BASE/'apps/client/public/models/fruit/stand.glb'),export_format='GLB')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
fruit('Tomato',(0,0,0),red)
bpy.ops.export_scene.gltf(filepath=str(BASE/'apps/client/public/models/fruit/tomato.glb'),export_format='GLB')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
fruit('Apple',(0,0,0),applemat)
bpy.ops.export_scene.gltf(filepath=str(BASE/'apps/client/public/models/fruit/apple.glb'),export_format='GLB')
