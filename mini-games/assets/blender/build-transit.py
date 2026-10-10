import bpy, math, os
from mathutils import Vector, Matrix
P=lambda p: Vector((p[0],-p[2],p[1]))
old=bpy.data.collections.get('ZurichTransit')
if old:
 for o in list(old.objects): bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(old)
collection=bpy.data.collections.new('ZurichTransit'); bpy.context.scene.collection.children.link(collection)
root=bpy.data.objects.new('ZurichTransit',None); collection.objects.link(root)
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
 o=bpy.data.objects.new(text,c); collection.objects.link(o); o.data.materials.append(mat); o.parent=None; objects.append(o); o.location=P(p)
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
 bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join(); bpy.context.object.name=name+'Geometry'
 bpy.ops.object.select_all(action='DESELECT'); root.select_set(True)
 for o in root.children: o.select_set(True)
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
for x in [-1.065,1.065]:box('Red side wall',(x,.95,0),(.07,1.05,4.8),red,.025)
for z in [-2.365,2.365]:box('Red end wall',(0,.95,z),(2.13,1.05,.07),red,.025)
box('Cabin floor',(0,.49,0),(2.12,.10,4.67),dark,.015)
for x in [-.70,.70]:
 box('Interior bench',(x,.90,0),(.52,.15,3.9),cream,.035)
 for z in [-1.8,1.8]:bar('Interior grab pole',(x,.65,z),(x,2.23,z),.022,metal)
box('Ivory roof',(0,2.30,0),(2.32,.15,4.98),cream,.06)
box('Roof ridge',(0,2.39,0),(1.9,.09,4.6),cream,.04)
windows(4.8,2.2,1.79,.72,[-1.7,-.6,.6,1.7])
for s in [-1,1]:
 for z in [-2.32,-1.2,0,1.2,2.32]:box('Red cabin pillar',(s*1.11,1.76,z),(.065,.96,.065),red,.009)
 box('Ivory waist stripe',(s*1.115,1.30,0),(.028,.08,4.70),cream,.008)
 box('Sliding door outline',(s*1.15,1.2,.6),(.025,1.75,.99),dark,.006)
 box('Door red panel',(s*1.168,.87,.6),(.016,.85,.89),red,.005)
 box('Door glass',(s*1.168,1.72,.6),(.018,.73,.86),glass,.009)
 box('Door split',(s*1.18,1.24,.6),(.016,1.65,.025),metal,.003)
 bar('Door handle',(s*1.195,1.07,.84),(s*1.195,1.32,.84),.012,metal)
 box('Entry step',(s*1.18,.35,.6),(.25,.09,1.05),metal,.008)
 label('UBS Polybahn',(s*1.135,.93,-.91),.18,white,'right' if s==1 else 'left')
for z in [-2.415,2.415]:
 box('End windshield',(0,1.78,z),(1.85,.78,.025),glass,.03)
 box('End center pillar',(0,1.8,z),( .055,.81,.04),red,.008)
 box('Bumper',(0,.48,z),(1.98,.10,.12),black,.02)
 label('POLYBAHN',(0,1.14,z*1.01),.18,white,'front' if z<0 else 'back')
 for x in [-.82,.82]:box('Headlamp',(x,.80,z),( .15,.12,.035),cream,.022)
 wheel(z*.68,.24,1.7)
export_model('polybahn')
glass=opaque_glass
# Three modular tram sections fit the current seven-metre section spacing.
tram=new_model('tram')
box('Tram underframe',(0,.43,0),(2.02,.32,6.2),dark,.08)
box('VBZ blue lower body',(0,1.13,0),(2.3,1.25,6.5),blue,.08)
box('White window band',(0,2.21,0),(2.3,.94,6.5),white,.07)
box('Roof',(0,2.95,0),(2.34,.17,6.55),white,.06)
box('Roof HVAC',(0,3.12,.1),(1.55,.24,2.1),dark,.04)
windows(6.5,2.3,2.20,.72,[-2.42,-1.32,.96,2.18])
for s in [-1,1]:
 box('Blue waist stripe',(s*1.164,1.73,0),(.025,.13,6.3),blue,.005)
 box('Double door trim',(s*1.185,1.61,-.08),(.03,2.1,1.13),black,.016)
 for z in [-.36,.20]:
  box('Door white panel',(s*1.206,1.60,z),(.02,2.02,.53),white,.01)
  box('Door glass',(s*1.22,2.03,z),(.02,.95,.43),glass,.009)
  box('Door bottom',(s*1.22,.95,z),(.02,.55,.43),blue,.008)
 box('Door threshold',(s*1.20,.53,-.08),(.1,.06,1.16),metal,.008)
 label('ZÜRICH',(s*1.18,1.12,1.82),.20,white,'right' if s==1 else 'left')
 for z in [-2.75,2.75]:box('Side marker',(s*1.18,.89,z),(.025,.07,.11),amber,.01)
for z in [-3.27,3.27]:
 box('End glazing',(0,2.12,z),(1.98,1.04,.045),glass,.045)
 box('Destination panel',(0,2.65,z),(1.86,.25,.05),black,.013)
 label('6',(0,2.65,z+math.copysign(.04,z)),.21,amber,'front' if z<0 else 'back')
 box('Front bumper',(0,.67,z),(2.10,.18,.10),dark,.018)
 for x in [-.80,.80]:box('Headlight',(x,.99,z),(.22,.11,.045),white,.023)
 for x in [-.38,.38]:bar('Wiper',(x,1.71,z*1.01),(x+.13,2.23,z*1.01),.012,black)
for z in [-2,2]: wheel(z,.36,2.0)
export_model('tram')
# ETH eLink: articulated electric shuttle, white/red angular graphics.
bus=new_model('eth-link')
for center,length in [(-3.55,10.55),(5.8,6.0)]:
 box('Low floor chassis',(0,.55,center),(2.4,.32,length),dark,.10)
 box('White lower body',(0,1.19,center),(2.55,1.0,length),white,.08)
 box('Black glazing belt',(0,2.22,center),(2.55,1.18,length),glass,.07)
 box('White roof',(0,2.94,center),(2.58,.24,length),white,.09)
 for s in [-1,1]:
  box('Side sill',(s*1.28,.73,center),(.025,.14,length-.1),dark,.012)
  for z in [center-length/2+.8+i*1.15 for i in range(int((length-1)/1.15))]:
   box('Window divider',(s*1.295,2.22,z),(.028,1.16,.042),black,.005)
 # Electric equipment along roof.
 box('Roof battery',(0,3.17,center),(1.85,.3,length*.65),white,.055)
# Accordion articulation between both body sections.
box('Articulated joint',(0,1.65,2.0),(2.3,2.34,1.45),dark,.05)
for z in [1.3+i*.085 for i in range(18)]:box('Accordion rib',(0,1.67,z),(2.44,2.43,.035),black,.008)
for z in [-5.9,.7,6.2]:wheel(z,.48,2.46)
for s in [-1,1]:
 for z in [-6.8,-2.6,5.4]:
  box('Shuttle door frame',(s*1.302,1.69,z),(.023,2.06,1.12),black,.012)
  for dz in [-.28,.28]:
   box('Door glazing',(s*1.322,1.72,z+dz),(.018,1.97,.50),glass,.013)
   bar('Door grab line',(s*1.34,1.18,z+dz),(s*1.34,2.0,z+dz),.012,metal)
 for z in [-8,0,8]:box('Amber side marker',(s*1.3,.84,z),(.024,.06,.14),amber,.008)
 # Angular red polygons on both sides, modeled rather than external photo textures.
 for z,y,w,h in [(-4.6,1.10,.8,.8),(-.4,2.48,1,.63),(4.0,1.05,.85,.65),(7.6,2.52,1.3,.6),(-7.8,.76,.5,.3)]:
  vs=[tuple(P((s*1.31,y-h/2,z))),tuple(P((s*1.31,y,z-w/2))),tuple(P((s*1.31,y+h/2,z))),tuple(P((s*1.31,y,z+w/2)))]
  me=bpy.data.meshes.new('Red diamond');me.from_pydata(vs,[],[(0,1,2,3)]);me.update();o=bpy.data.objects.new('Red ETH graphic',me);collection.objects.link(o);o.parent=None;o.data.materials.append(red);objects.append(o)
 label('ETH Zürich',(s*1.33,1.15,-4.10),.30,dark,'right' if s==1 else 'left')
 label('eLink',(s*1.33,1.13,6.9),.29,red,'right' if s==1 else 'left')
 label('Zentrum – Hönggerberg',(s*1.33,2.55,-3.55),.19,white,'right' if s==1 else 'left')
 box('Mirror housing',(s*1.52,2.36,-8.4),(.18,.55,.18),dark,.045)
 bar('Mirror arm',(s*1.23,2.60,-8.15),(s*1.51,2.6,-8.4),.025,dark)
box('Front windscreen',(0,2.02,-8.84),(2.20,1.28,.04),glass,.06)
box('Front destination',(0,2.70,-8.86),(2.10,.26,.04),black,.012)
label('ETH eLink',(0,2.70,-8.89),.23,amber)
box('Front grille',(0,1.06,-8.85),(1.85,.34,.04),black,.025)
for y in [.95,1.03,1.11,1.19]:box('Grille slat',(0,y,-8.878),(1.72,.018,.02),metal,.003)
for x in [-.95,.95]:box('Bus headlight',(x,.87,-8.86),(.28,.16,.04),white,.03)
for x in [-.48,.48]:bar('Windscreen wiper',(x,1.53,-8.89),(x+.13,2.28,-8.89),.015,black)
box('Rear red panel',(0,1.13,8.83),(2.45,.88,.04),red,.035)
for x in [-1,1]:box('Tail light',(x,1.19,8.87),(.13,.30,.025),red,.02)
export_model('eth-link')
# Keep existing PubliBike source separate; this file contains the transit collection.
for o in bpy.data.collections.get('PubliBike').objects if bpy.data.collections.get('PubliBike') else []: o.hide_set(True)
poly.location.x=-6; tram.location.x=0; bus.location.x=7
bpy.ops.wm.save_as_mainfile(filepath='/Users/mgershman/zurich-eth-run/assets/blender/transit.blend')
print('Transit collection saved')
