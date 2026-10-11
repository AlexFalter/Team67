import bpy, math, os, pathlib
from mathutils import Vector
BASE=str(pathlib.Path(__file__).resolve().parents[2])
# Build in a dedicated collection; preserve the user's existing scene.
old=bpy.data.collections.get('ETH_ErstiBag')
if old:
 for o in list(old.objects): bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(old)
c=bpy.data.collections.new('ETH_ErstiBag');bpy.context.scene.collection.children.link(c)
P=lambda p:Vector((p[0],-p[2],p[1]))
def mat(name,col):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*col,1)
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*col,1);n.inputs['Roughness'].default_value=.88
 return m
navy=mat('Navy woven canvas',(.018,.035,.085));cream=mat('Cream cotton cord',(.82,.79,.68));white=mat('White screen print',(.91,.92,.9));sleeve=mat('Student hoodie',(.88,.8,.64));skin=mat('Skin',(.50,.28,.17))
def finish(o,name,m,parent):
 o.name=name
 for col in list(o.users_collection):col.objects.unlink(o)
 c.objects.link(o);o.parent=parent
 if m:o.data.materials.append(m)
 if o.type=='MESH':
  for f in o.data.polygons:f.use_smooth=True
 return o
def empty(name,parent=None):
 o=bpy.data.objects.new(name,None);c.objects.link(o);o.parent=parent;return o
def tube(name,pts,r,m,parent):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=2
 s=curve.splines.new('POLY');s.points.add(len(pts)-1)
 for v,p in zip(s.points,pts):v.co=(*P(p),1)
 o=bpy.data.objects.new(name,curve);c.objects.link(o);o.parent=parent;o.data.materials.append(m);return o
def sphere(name,loc,size,m,parent):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=P(loc));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);return finish(o,name,m,parent)
def text(label,loc,size,parent):
 curve=bpy.data.curves.new(label,'FONT');curve.body=label;curve.size=size;curve.align_x='CENTER';curve.extrude=.0003
 o=bpy.data.objects.new(label,curve);c.objects.link(o);o.data.materials.append(white);o.parent=parent;o.location=P(loc);o.rotation_euler=(math.pi/2,0,math.pi);return o
bag=empty('ErstiBag')
# Elliptical fabric shell: bulged lower body, gathered opening, gentle vertical folds.
verts=[];faces=[];rows=18;cols=48
for j in range(rows+1):
 t=j/rows;y=.025+t*.51;w=.18*(.85+.18*math.sin(t*math.pi))*(1-.16*t**8);d=.073*(.8+.25*math.sin(t*math.pi))
 for i in range(cols):
  a=i/cols*math.tau;fold=(.004+.008*t**5)*math.sin(a*12+t*2)
  verts.append(P(((w+fold)*math.cos(a),y+.007*math.sin(a*7)*t**4,(d+fold*.7)*math.sin(a))))
for j in range(rows):
 for i in range(cols):
  a=j*cols+i;b=j*cols+(i+1)%cols;faces.append((a,b,b+cols,a+cols))
faces.append(tuple(range(cols-1,-1,-1)))
mesh=bpy.data.meshes.new('Folded canvas shell');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('CanvasBag',mesh);c.objects.link(o);o.parent=bag;o.data.materials.append(navy)
for f in mesh.polygons:f.use_smooth=True
# Gathered mouth and sewn side seams.
for y in [.49,.51]:tube('Gathered hem',[(.153*math.cos(i/48*math.tau),y+.006*math.sin(i/48*math.tau*12),.061*math.sin(i/48*math.tau)) for i in range(49)],.005,navy,bag)
for side in [-1,1]:
 tube('Side seam',[(side*(.17+.01*math.sin(t*math.pi)),.03+t*.47,0) for t in [i/16 for i in range(17)]],.0025,navy,bag)
 tube('Cotton drawstring',[(side*.14,.51,-.062),(side*.23,.49,-.08),(side*.26,.36,-.10),(side*.245,.12,-.09),(side*.18,.028,0),(side*.22,.12,.085),(side*.235,.34,.09),(side*.20,.48,.07),(side*.14,.51,.061)],.006,cream,bag)
 sphere('Cord knot',(side*.18,.03,0),(.009,.009,.012),cream,bag)
text('vseth',(0,.235,-.079),.085,bag);text('ETH ZÜRICH',(0,.14,-.077),.028,bag);text('WELCOME · ERSTI-BAG',(0,.092,-.071),.018,bag)
# White central emblem, stylized association mark.
tube('VSETH emblem',[(-.085,.37,-.083),(-.06,.325,-.087),(0,.31,-.089),(.06,.345,-.087),(.07,.40,-.083),(.03,.43,-.08),(-.04,.418,-.081),(-.06,.385,-.084),(.04,.365,-.089)],.016,white,bag)
def export(root,path,animated=False):
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
 for child in root.children_recursive:child.select_set(True)
 bpy.context.view_layer.objects.active=root
 bpy.ops.export_scene.gltf(filepath=BASE+path,export_format='GLB',use_selection=True,export_animations=animated,export_animation_mode='NLA_TRACKS',export_frame_range=False)
export(bag,'/apps/client/public/models/ersti-bag.glb')
# Camera-local rig with independent shoulder, elbow and hand pivots.
rig=empty('BagFirstPerson');grip=empty('BagGrip',rig);bag.parent=grip;bag.location=P((0,-.51,0))
pivots=[]
for side in [-1,1]:
 shoulder=empty(('Left' if side<0 else 'Right')+'Arm',rig)
 sphere('Hoodie forearm',(0,-.15,.10),(.072,.22,.075),sleeve,shoulder)
 sphere('Palm',(0,.008,-.055),(.046,.058,.031),skin,shoulder)
 for f in range(4):sphere('Curled finger',(-.029+f*.019,.015,-.083),(.01,.028,.016),skin,shoulder)
 sphere('Thumb',(-side*.047,-.005,-.075),(.018,.035,.023),skin,shoulder)
 pivots.append(shoulder)
# Pose samples are authored in camera coordinates (+Y up, -Z forward).
poses={
 'Pickup':[(0,(-.27,-.29,-.49),(.29,-.26,-.48),(.23,-.83,-.95)),(.22,(-.17,-.50,-.8),(.20,-.54,-.9),(.18,-.97,-.91)),(.44,(-.18,-.27,-.7),(.20,-.18,-.69),(.22,-.49,-.69)),(.68,(-.26,-.27,-.51),(.28,-.09,-.65),(.29,-.12,-.65))],
 'Throw':[(0,(-.26,-.27,-.51),(.28,-.09,-.65),(.29,-.12,-.65)),(.19,(-.19,-.28,-.55),(.40,.00,-.26),(.41,-.04,-.27)),(.32,(-.19,-.27,-.55),(.43,.14,-.13),(.44,.10,-.16)),(.43,(-.17,-.22,-.66),(.13,.01,-.96),(.13,-.05,-.95)),(.59,(-.22,-.27,-.58),(.10,-.17,-.95),(.12,-.15,-.98)),(.91,(-.27,-.29,-.49),(.29,-.26,-.48),(.29,-.12,-.65))]}
for label,samples in poses.items():
 for obj,idx in [(pivots[0],1),(pivots[1],2),(grip,3)]:
  obj.animation_data_create();obj.animation_data.action=None
  for t,*positions in samples:
   obj.location=P(positions[idx-1]);obj.rotation_euler=(0,0,0)
   if obj==pivots[1]:obj.rotation_euler.x=(.35 if .15<t<.4 else -.3 if .4<t<.7 else -.1) if label=='Throw' else -.1
   if obj==grip:obj.rotation_euler.x= -.22 if label=='Throw' and .15<t<.4 else .08
   obj.keyframe_insert(data_path='location',frame=1+t*60);obj.keyframe_insert(data_path='rotation_euler',frame=1+t*60)
  action=obj.animation_data.action;action.name=label+'_'+obj.name;obj.animation_data.action=None
  track=obj.animation_data.nla_tracks.new();track.name=label;track.strips.new(label,1,action)
bpy.context.scene.render.fps=60
bpy.context.scene.frame_set(1)
export(rig,'/apps/client/public/models/ersti-bag-fps.glb',True)
bpy.data.libraries.write(BASE+'/assets/blender/ersti-bag.blend',{c})
print('Exported navy drawstring bag and Pickup/Throw first-person clips')
