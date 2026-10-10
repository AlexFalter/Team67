import bpy, math, os
from mathutils import Vector, Matrix
P=lambda p: Vector((p[0],-p[2],p[1]))
old=bpy.data.collections.get('PolybahnAnimation')
if old:
 for o in list(old.objects): bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(old)
collection=bpy.data.collections.new('PolybahnAnimation'); bpy.context.scene.collection.children.link(collection)
root=bpy.data.objects.new('PolybahnAnimation',None); collection.objects.link(root)
def material(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); n.inputs['Base Color'].default_value=(*color,1); n.inputs['Metallic'].default_value=metal; n.inputs['Roughness'].default_value=rough
 return m
red=material('Transit red',(.65,.025,.035),.25,.32)
blue=material('VBZ blue',(.025,.15,.42),.25,.35)
white=material('Warm white body',(.88,.9,.91),.15,.4)
cream=material('Polybahn ivory roof',(.9,.84,.67),.15,.4)
glass=material('Tinted glazing',(.025,.07,.095),.55,.2)
black=material('Tyres and seals',(.015,.019,.023),0,.8)
metal=material('Brushed steel',(.4,.46,.49),.8,.3)
dark=material('Chassis graphite',(.045,.055,.06),.5,.5)
amber=material('Amber destination',(.95,.48,.04),0,.35)
objects=[]
def finish(o,name,mat,parent=None):
 o.name=name
 for c in list(o.users_collection): c.objects.unlink(o)
 collection.objects.link(o); o.data.materials.append(mat); o.parent=parent or root; objects.append(o)
 if o.type=='MESH':
  for f in o.data.polygons: f.use_smooth=True
 return o
def bar(name,a,b,r,mat,parent=None,verts=12):
 a,b=P(a),P(b); d=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d.length,location=(a+b)/2)
 o=bpy.context.object; o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y')
 return finish(o,name,mat,parent)
def box(name,p,size,mat,bevel=.02,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=P(p)); o=bpy.context.object; o.scale=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel; mod.segments=2
  bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,name,mat,parent)
def tube(name,pts,r,mat,parent=None):
 c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.bevel_depth=r; c.bevel_resolution=2
 s=c.splines.new('POLY'); s.points.add(len(pts)-1)
 for v,p in zip(s.points,pts): v.co=(*P(p),1)
 o=bpy.data.objects.new(name,c); collection.objects.link(o); o.data.materials.append(mat); o.parent=parent or root; objects.append(o); return o
def ring(name,center,r,thick,mat,parent=None):
 bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,location=P(center),major_radius=r,minor_radius=thick,rotation=(0,math.pi/2,0)); return finish(bpy.context.object,name,mat,parent)
# Helpers use root dynamically; model roots stay at ground level.
def new_model(name):
 global root,objects
 root=bpy.data.objects.new(name,None); collection.objects.link(root); objects=[]; return root
def label(text,p,size,mat,face='front'):
 c=bpy.data.curves.new(text,'FONT'); c.body=text; c.size=size; c.align_x='CENTER'; c.align_y='CENTER'; c.extrude=.0008
 o=bpy.data.objects.new(text,c); collection.objects.link(o); o.data.materials.append(mat); o.parent=root; objects.append(o); o.location=P(p)
 if face=='front': u,v=Vector((-1,0,0)),Vector((0,0,1))
 elif face=='back': u,v=Vector((1,0,0)),Vector((0,0,1))
 elif face=='right': u,v=Vector((0,1,0)),Vector((0,0,1))
 else: u,v=Vector((0,-1,0)),Vector((0,0,1))
 o.rotation_euler=Matrix((u,v,u.cross(v))).transposed().to_euler();return o
def wheel(z,r,width=2.2):
 for s in [-1,1]:
  ring('Tyre',(s*width/2,r,z),r*.79,r*.21,black)
  bar('Wheel hub',(s*(width/2-.05),r,z),(s*(width/2+.08),r,z),r*.55,metal,verts=24)
  bar('Hub cap',(s*(width/2+.08),r,z),(s*(width/2+.09),r,z),r*.25,dark)
def windows(length,width,y,h,positions):
 for side in [-1,1]:
  for z in positions:
   for dy in [-h/2-.02,h/2+.02]:box('Window gasket',(side*(width/2+.012),y+dy,z),(.035,.035,.94),black,.008)
   for dz in [-.45,.45]:box('Window gasket',(side*(width/2+.012),y,z+dz),(.035,h,.035),black,.008)
   box('Window glass',(side*(width/2+.035),y,z),(.024,h,.85),glass,.022)
   box('Window mullion',(side*(width/2+.051),y,z),(.018,h,.025),metal,.005)
def export_model(name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects: o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.convert(target='MESH')
 for parent in [root]+[o for o in root.children if o.type=='EMPTY']:
  meshes=[o for o in parent.children if o.type=='MESH']
  bpy.ops.object.select_all(action='DESELECT')
  for o in meshes: o.select_set(True)
  if meshes:
   bpy.context.view_layer.objects.active=meshes[0]; bpy.ops.object.join(); meshes[0].name=parent.name+'Geometry'
 bpy.ops.object.select_all(action='DESELECT')
 def select_tree(o):
  o.select_set(True)
  for child in o.children: select_tree(child)
 select_tree(root)
 path='/Users/mgershman/zurich-eth-run/public/models/'+name+'.glb'
 bpy.ops.export_scene.gltf(filepath=path,use_selection=True,export_apply=True)
 print(name,os.path.getsize(path))
# Compact red funicular; dimensions match the existing in-game carriage.
opaque_glass=glass
glass=material('Polybahn transparent windows',(.09,.19,.23),.1,.22)
glass.diffuse_color=(.09,.19,.23,.22)
next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Alpha'].default_value=.22
poly=new_model('polybahn')
box('Underframe',(0,.32,0),(1.8,.35,4.35),dark,.08)
for x in [-1.065,1.065]:
 for z,length in [(-1.15,2.5),(1.75,1.3)]:box('Red side wall',(x,.95,z),(.07,1.05,length),red,.025)
for z in [-2.365,2.365]:box('Red end wall',(0,.95,z),(2.13,1.05,.07),red,.025)
box('Cabin floor',(0,.49,0),(2.12,.10,4.67),dark,.015)
for x in [-.70,.70]:
 box('Interior bench',(x,.90,0),(.52,.15,3.9),cream,.035)
 for z in [-1.8,1.8]:bar('Interior grab pole',(x,.65,z),(x,2.23,z),.022,metal)
box('Ivory roof',(0,2.30,0),(2.32,.15,4.98),cream,.06)
box('Roof ridge',(0,2.39,0),(1.9,.09,4.6),cream,.04)
windows(4.8,2.2,1.79,.72,[-1.7,-.6,1.7])
for s in [-1,1]:
 for z in [-2.32,-1.2,0,1.2,2.32]:box('Red cabin pillar',(s*1.11,1.76,z),(.065,.96,.065),red,.009)
 for z,length in [(-1.15,2.5),(1.75,1.3)]:box('Ivory waist stripe',(s*1.115,1.30,z),(.028,.08,length),cream,.008)
 # The fixed shell has a real opening, with two sliding leaves per side.
 for z in [.10,1.10]:box('Door jamb',(s*1.16,1.30,z),(.035,1.9,.04),metal,.008)
 box('Door lintel',(s*1.16,2.23,.60),(.035,.05,1.05),metal,.008)
 for leaf in [-1,1]:
  door=bpy.data.objects.new('Door_'+str(s)+'_'+str(leaf),None);collection.objects.link(door);door.parent=root
  z=.60+leaf*.23
  box('Door red panel',(s*1.18,.91,z),(.022,.88,.44),red,.008,door)
  box('Door glass',(s*1.18,1.74,z),(.022,.74,.40),glass,.008,door)
  for edge in [z-.22,z+.22]:box('Door upright',(s*1.19,1.29,edge),(.025,1.72,.025),metal,.004,door)
  box('Door waist',(s*1.19,1.34,z),(.025,.04,.44),cream,.006,door)
  bar('Door handle',(s*1.205,1.10,z),(s*1.205,1.31,z),.012,metal,door)
 box('Entry step',(s*1.18,.35,.6),(.25,.09,1.05),metal,.008)
 label('UBS Polybahn',(s*1.135,.93,-.91),.18,white,'right' if s==1 else 'left')
for z in [-2.415,2.415]:
 box('End windshield',(0,1.78,z),(1.85,.78,.025),glass,.03)
 box('End center pillar',(0,1.8,z),( .055,.81,.04),red,.008)
 box('Bumper',(0,.48,z),(1.98,.10,.12),black,.02)
 label('POLYBAHN',(0,1.14,z*1.01),.18,white,'front' if z<0 else 'back')
 for x in [-.82,.82]:box('Headlamp',(x,.80,z),( .15,.12,.035),cream,.022)
 start=len(objects);wheel(z*.68,.24,1.7)
 axle=bpy.data.objects.new('Axle_'+('front' if z<0 else 'rear'),None);collection.objects.link(axle);axle.parent=root;axle.location=P((0,.24,z*.68))
 for o in objects[start:]:o.parent=axle;o.location-=axle.location
export_model('polybahn')

for c in bpy.data.collections:
 if c!=collection:
  for o in c.objects:
   if o.type not in ['CAMERA','LIGHT']:o.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath='/Users/mgershman/zurich-eth-run/assets/blender/polybahn-animation.blend')
print('Saved rigged doors and wheel axles')
