import bpy, math, os
from mathutils import Vector
# Game coordinates: X lateral, Y height, Z rear; Blender uses Z up.
P=lambda p: Vector((p[0],-p[2],p[1]))
old=bpy.data.collections.get('PubliBike')
if old:
 for o in list(old.objects): bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(old)
collection=bpy.data.collections.new('PubliBike'); bpy.context.scene.collection.children.link(collection)
root=bpy.data.objects.new('PubliBike',None); collection.objects.link(root)
def material(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); n.inputs['Base Color'].default_value=(*color,1); n.inputs['Metallic'].default_value=metal; n.inputs['Roughness'].default_value=rough
 return m
pink=material('PubliBike berry enamel',(.48,.025,.25),.35,.3)
black=material('Rubber and grips',(.018,.022,.027),0,.8)
metal=material('Brushed alloy',(.45,.52,.56),.8,.32)
dark=material('Graphite components',(.045,.055,.065),.5,.42)
white=material('White branding',(.93,.94,.91),0,.4)
red=material('Rear reflector',(.75,.015,.02),.25,.25)
amber=material('Amber reflectors',(.95,.36,.015),.2,.3)
objects=[]
def finish(o,name,mat,parent=root):
 o.name=name
 for c in list(o.users_collection): c.objects.unlink(o)
 collection.objects.link(o); o.data.materials.append(mat); o.parent=parent; objects.append(o)
 if o.type=='MESH':
  for f in o.data.polygons: f.use_smooth=True
 return o
def bar(name,a,b,r,mat,parent=root,verts=12):
 a,b=P(a),P(b); d=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d.length,location=(a+b)/2)
 o=bpy.context.object; o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y')
 return finish(o,name,mat,parent)
def box(name,p,size,mat,bevel=.02,parent=root):
 bpy.ops.mesh.primitive_cube_add(size=1,location=P(p)); o=bpy.context.object; o.scale=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel; mod.segments=2
  bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,name,mat,parent)
def tube(name,pts,r,mat,parent=root):
 c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.bevel_depth=r; c.bevel_resolution=2
 s=c.splines.new('POLY'); s.points.add(len(pts)-1)
 for v,p in zip(s.points,pts): v.co=(*P(p),1)
 o=bpy.data.objects.new(name,c); collection.objects.link(o); o.data.materials.append(mat); o.parent=parent; objects.append(o); return o
def ring(name,center,r,thick,mat,parent=root):
 bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,location=P(center),major_radius=r,minor_radius=thick,rotation=(0,math.pi/2,0)); return finish(bpy.context.object,name,mat,parent)
# Wheel assemblies retain independent origins for runtime rolling.
for z,label in [(1,'RearWheel'),(-1,'FrontWheel')]:
 wheel=bpy.data.objects.new(label,None); collection.objects.link(wheel); wheel.parent=root
 ring(label+' tyre',(0,.62,z),.565,.065,black,wheel)
 ring(label+' alloy rim',(0,.62,z),.505,.022,metal,wheel)
 bar(label+' hub',(-.115,.62,z),(.115,.62,z),.055,dark,wheel)
 for i in range(24):
  a=i*math.tau/24
  side=.036 if i%2 else -.036
  bar('Tension spoke',(side,.62,z),(0,.62+.497*math.cos(a),z+.497*math.sin(a)),.006,metal,wheel,6)
 for a in [0,math.pi]:
  box('Wheel reflector',(.013,.62+.38*math.cos(a),z+.38*math.sin(a)),(.035,.10,.035),amber,.008,wheel)
 ring('Brake rotor',(.082,.62,z),.145,.009,metal,wheel)
 # Move pivot while retaining assembled world coordinates.
 wheel.location=P((0,.62,z))
 for o in wheel.children: o.location-=wheel.location
rear=(0,.62,1); crank=(0,.65,.15); seat=(0,1.35,.45); head=(0,1.32,-.65)
for a,b in [(rear,crank),(rear,seat),(seat,crank)]: bar('Rear frame stay',a,b,.038,pink)
# Deep low-entry frame instead of a diamond top tube.
tube('Step through down tube',[head,(0,1.05,-.56),(0,.73,-.30),crank],.072,pink)
tube('Low entry brace',[seat,(0,.94,.35),(0,.85,-.26),(0,1.17,-.62)],.045,pink)
bar('Head tube',(0,1.16,-.60),(0,1.48,-.72),.065,pink)
for x in [-.11,.11]:
 tube('Front fork',[(x,.62,-1),(x,.85,-.91),(x,1.21,-.62)],.034,dark)
 bar('Rear axle',(0,.62,1),(x,.62,1),.025,metal)
bar('Seat post',(0,1.22,.45),(0,1.48,.45),.035,metal)
box('Comfort saddle',(0,1.51,.45),(.38,.105,.32),black,.045)
bar('Handlebar stem',(0,1.4,-.68),(0,1.69,-.72),.035,metal)
tube('Swept handlebars',[(-.47,1.69,-.55),(-.32,1.72,-.7),(0,1.72,-.77),(.32,1.72,-.7),(.47,1.69,-.55)],.027,metal)
for s in [-1,1]:
 bar('Textured grip',(s*.32,1.7,-.64),(s*.49,1.68,-.54),.039,black)
 bar('Brake lever',(s*.27,1.68,-.74),(s*.44,1.65,-.69),.014,dark)
 tube('Brake cable',[(s*.28,1.68,-.74),(s*.22,1.44,-.88),(s*.13,1.22,-.69),(s*.11,.79,-.94)],.008,black)
# Full mudguards: swept arcs, separate from rotating wheels.
for z in [-1,1]:
 pts=[(0,.62+.655*math.sin(a),z+.655*math.cos(a)) for a in [math.pi*.04+i*math.pi*.92/32 for i in range(33)]]
 # Broad ribbon formed as mesh.
 vs=[]
 for p in pts:
  for x in [-.083,.083]: vs.append(tuple(P((x,p[1],p[2]))))
 me=bpy.data.meshes.new('Mudguard ribbon'); me.from_pydata(vs,[],[(2*i,2*i+1,2*i+3,2*i+2) for i in range(32)]); me.update()
 o=bpy.data.objects.new('Painted mudguard',me); collection.objects.link(o); o.parent=root; o.data.materials.append(pink); objects.append(o)
 mod=o.modifiers.new('Mudguard thickness','SOLIDIFY'); mod.thickness=.012
 for x in [-.10,.10]: bar('Mudguard stay',(x,.62,z),(x,.95,z+.55),.009,metal)
box('Battery and chain housing',(0,.89,.40),(.16,.35,.42),dark,.03)
bar('Crank axle',(-.22,.65,.15),(.22,.65,.15),.032,metal)
ring('Chainwheel',(.10,.65,.15),.18,.023,dark)
for x,y,z in [(.20,.50,.15),(-.20,.80,.15)]:
 bar('Crank arm',(x,.65,.15),(x,y,z),.022,metal)
 box('Pedal',(x,y,z),(.19,.045,.15),black,.01)
tube('Enclosed chain line',[(.10,.65,1),(.10,.79,.15),(.10,.51,.15),(.10,.60,1)],.023,dark)
box('Front light',(0,1.39,-.84),(.13,.09,.10),dark,.025)
box('Headlight lens',(0,1.39,-.898),(.10,.06,.018),white,.012)
box('Rear light',(0,1.05,1.59),(.12,.07,.045),red,.012)
box('Rear rack',(0,1.35,1.02),(.32,.055,.62),dark,.018)
for x in [-.14,.14]:
 bar('Rack support',(x,.65,1),(x,1.33,1.27),.015,metal)
 bar('Rack rail',(x,1.39,.73),(x,1.39,1.32),.016,metal)
bar('Kickstand',(-.10,.66,.25),(-.23,.02,.54),.016,dark)
# Compact front carrier, with open floor and rails.
for x in [-.22,.22]:
 bar('Carrier support',(x,1.17,-.70),(x,1.46,-1.19),.016,dark)
 tube('Carrier sides',[(x,1.46,-.88),(x,1.46,-1.42),(x,1.64,-1.42),(x,1.64,-.88)],.014,dark)
for z in [-.90,-1.03,-1.16,-1.29,-1.42]: bar('Carrier floor',(-.22,1.46,z),(.22,1.46,z),.012,dark)
box('Carrier brand panel',(0,1.57,-1.43),(.44,.16,.025),pink,.008)
# White legible side branding on the battery cover, on both sides.
for side in [-1,1]:
 c=bpy.data.curves.new('PubliBike wordmark','FONT'); c.body='PubliBike'; c.size=.11; c.align_x='CENTER'; c.extrude=.0005
 o=bpy.data.objects.new('PubliBike wordmark',c); collection.objects.link(o); o.data.materials.append(white); o.parent=root; objects.append(o)
 o.location=P((side*.086,.88,.40))
 # Text local x runs along the bike, local y up, outward normal lateral.
 from mathutils import Matrix
 u=Vector((0,side,0)); v=Vector((0,0,1)); n=u.cross(v)
 o.rotation_euler=Matrix((u,v,n)).transposed().to_euler()
# Convert curves and consolidate fixed geometry per material for economical draw calls.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:
 o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.convert(target='MESH')
for parent in [root]+[o for o in root.children if o.type=='EMPTY']:
 meshes=[o for o in parent.children if o.type=='MESH']
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes: o.select_set(True)
 if meshes:
  bpy.context.view_layer.objects.active=meshes[0]; bpy.ops.object.join(); meshes[0].name=parent.name+'Geometry'
# Export only bike, keeping the user's default scene intact.
bpy.ops.object.select_all(action='DESELECT')
def select_tree(o):
 o.select_set(True)
 for c in o.children: select_tree(c)
select_tree(root)
path='/Users/mgershman/zurich-eth-run'
bpy.ops.export_scene.gltf(filepath=path+'/public/models/publibike.glb',use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=path+'/assets/blender/publibike.blend')
print('PubliBike exported',os.path.getsize(path+'/public/models/publibike.glb'))
