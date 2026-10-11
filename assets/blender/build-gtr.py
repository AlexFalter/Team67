"""Original stylized R35 GT-R, metres, facing game -Z; editable Blender source."""
import bpy, math, pathlib
BASE=pathlib.Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,c,metal=0,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Base Color'].default_value=(*c,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough;return m
paint=mat('GT-R metallic crimson',(.57,.012,.025),.65,.28);black=mat('Carbon and grille',(.018,.023,.028),.3,.6);glass=mat('Smoked glass',(.055,.12,.18),.6,.18);rubber=mat('Performance tires',(.014,.015,.018),0,.9);silver=mat('Forged alloy',(.42,.47,.52),.85,.3);red=mat('Circular red tail lamps',(.9,.012,.025),.15,.25);white=mat('LED headlamps',(.72,.89,1),.3,.2)
def xyz(p):return (p[0],-p[2],p[1])
def box(name,p,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.name=name;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 bevel=o.modifiers.new('soft panel edges','BEVEL');bevel.width=.025;bevel.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name);return o
def hull(name,sections,m):
 verts=[]
 for z,w,b,t in sections:verts.extend([(-w/2,-z,b),(w/2,-z,b),(w/2,-z,t),(-w/2,-z,t)])
 faces=[(3,2,1,0)]
 for i in range(len(sections)-1):
  for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
 faces.append(tuple((len(sections)-1)*4+j for j in range(4)))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(m);return o
def cylinder(name,p,r,depth,m,axis='x'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=depth,location=xyz(p));o=bpy.context.object;o.name=name;o.data.materials.append(m)
 if axis=='x':o.rotation_euler.y=math.pi/2
 elif axis=='z':o.rotation_euler.x=math.pi/2
 for face in o.data.polygons:face.use_smooth=True
 return o
hull('Wide R35 coupe body',[(-2.28,1.72,.36,.63),(-1.9,1.9,.35,.88),(-.8,1.91,.35,1.02),(.7,1.91,.35,1.04),(1.85,1.93,.35,.93),(2.25,1.78,.4,.84)],paint)
hull('Roof and cabin',[(-.82,1.6,.93,.97),(-.25,1.46,.94,1.47),(.72,1.45,.94,1.48),(1.25,1.66,.94,1.01)],glass)
box('Carbon roof',(0,1.48,.28),(1.4,.055,.95),black)
for side in [-1,1]:
 box('Door sill',(side*.97,.38,0),(.055,.1,2.95),black)
 box('Door handle',(side*.963,1.02,.3),(.025,.035,.16),silver)
 box('Mirror',(side*1.06,1.14,-.58),(.19,.12,.23),black)
 box('B pillar',(side*.749,1.23,.3),(.035,.45,.055),black)
 box('Front fender vent',(side*.973,.73,-.95),(.02,.16,.23),black)
 for z in [-1.4,1.4]:
  box('Flared arch top',(side*.965,.86,z),(.14,.12,.8),paint)
for x in [-.64,.64]:
 o=box('Angular LED headlamp',(x,.8,-2.01),(.46,.11,.15),white);o.rotation_euler.z=-x*.14
box('Front grille',(0,.54,-2.27),(1.1,.27,.065),black)
for x in [-.7,.7]:box('Bumper air duct',(x,.49,-2.24),(.26,.17,.065),black)
box('Front splitter',(0,.33,-2.28),(1.98,.055,.25),black)
box('Rear diffuser',(0,.39,2.22),(1.77,.21,.12),black)
for x in [-.68,-.37,.37,.68]:
 cylinder('GT-R signature round tail lamp',(x,.79,2.252),.118,.028,red,'z')
 cylinder('Tail lamp inner lens',(x,.79,2.27),.068,.015,black,'z')
for x in [-.72,-.5,.5,.72]:cylinder('Quad exhaust',(x,.4,2.29),.067,.14,silver,'z')
for x in [-.67,.67]:box('Wing mount',(x,1.07,1.81),(.055,.35,.16),black)
box('Rear spoiler',(0,1.25,1.83),(2.02,.06,.3),black)
for x in [-1,1]:box('Wing endplate',(x,1.27,1.82),(.045,.17,.33),black)
box('Rear plate',(0,.59,2.28),(.38,.11,.02),white)
# Badge lettering is authored geometry, never a fetched logo.
bpy.ops.object.text_add(location=xyz((0,.79,2.29)),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='GT-R badge';o.data.body='GT-R';o.data.size=.07;o.data.align_x='CENTER';o.data.extrude=.003;o.data.materials.append(silver);bpy.ops.object.convert(target='MESH')
# Merge static panels by material; keep four articulated wheels separate.
for m in [paint,black,glass,silver,red,white]:
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==m]
 if not objects:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name='GT-R '+m.name
for side in [-1,1]:
 for z in [-1.4,1.4]:
  p=(side*.96,.355,z);name=('front' if z<0 else 'rear')+('-left' if side<0 else '-right')
  pivot=bpy.data.objects.new(name,None);pivot.location=xyz(p);bpy.context.collection.objects.link(pivot);bpy.context.view_layer.update()
  meshes=[cylinder('Tire',p,.355,.25,rubber),cylinder('Alloy rim',(side*1.097,.355,z),.265,.026,silver),cylinder('Wheel hub',(side*1.115,.355,z),.095,.035,black)]
  for i in range(6):
   a=i*math.tau/6;o=box('Split spoke',(side*1.12,.355+math.cos(a)*.15,z+math.sin(a)*.15),(.02,.25,.035),black);o.rotation_euler.x=a;meshes.append(o)
  # Two draw calls per wheel: rim and tire/detail.
  for m in [rubber,silver,black]:
   objects=[o for o in meshes if o.data.materials[0]==m];bpy.ops.object.select_all(action='DESELECT')
   for o in objects:o.select_set(True)
   bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.parent=pivot;o.matrix_parent_inverse=pivot.matrix_world.inverted()
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'assets/blender/gtr.blend'))
bpy.ops.export_scene.gltf(filepath=str(BASE/'apps/client/public/models/gtr/gtr.glb'),export_format='GLB',export_yup=True)
