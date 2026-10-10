"""Original El Tony vending cabinet and aluminum cans, built in an isolated scene."""
import bpy, math, os
ROOT='/Users/mgershman/zurich-eth-run'
previous=bpy.context.window.scene
scene=bpy.data.scenes.new('Mate Vending Model');bpy.context.window.scene=scene
with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
 collection=scene.collection
 objects=[]
 def mat(name,color,metal=0,glow=0):
  m=bpy.data.materials.new(name);m.use_nodes=True;n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=.3 if metal else .45
  if glow:n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=glow
  return m
 blue=mat('Cobalt enamel',(.035,.09,.36),.55);dark=mat('Graphite inset',(.009,.018,.035),.25);silver=mat('Brushed aluminum',(.57,.63,.69),.85);gold=mat('Warm gold lettering',(.95,.70,.19),.45);light=mat('Cool shelf lighting',(.57,.88,1),.1,2.2)
 colors=[mat('Classic navy',(.025,.06,.15),.5),mat('Zero silver',(.65,.67,.64),.65),mat('Mint green',(.04,.35,.08),.5),mat('Ginger orange',(.65,.12,.015),.5)]
 def own(o,name,parent,material):
  o.name=name;o.parent=parent
  if material:o.data.materials.append(material)
  if o.type=='MESH':
   for p in o.data.polygons:p.use_smooth=True
  return o
 def root(name):
  o=bpy.data.objects.new(name,None);collection.objects.link(o);return o
 def pos(p):return (p[0],-p[2],p[1])
 def box(name,p,size,material,parent,bevel=.025):
  bpy.ops.mesh.primitive_cube_add(size=1,location=pos(p));o=own(bpy.context.view_layer.objects.active,name,parent,material);o.scale=(size[0],size[2],size[1]);
  with bpy.context.temp_override(object=o,active_object=o,selected_objects=[o],selected_editable_objects=[o]):bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  if bevel:b=o.modifiers.new('Machined rounded edges','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Panel normals','WEIGHTED_NORMAL')
  return o
 def cylinder(name,p,r,h,material,parent):
  bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=h,location=pos(p));return own(bpy.context.view_layer.objects.active,name,parent,material)
 def text(name,body,p,size,material,parent):
  bpy.ops.object.text_add(location=pos(p));o=own(bpy.context.view_layer.objects.active,name,parent,material);o.rotation_euler=(math.pi/2,0,math.pi);o.data.body=body;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.extrude=.0005
  with bpy.context.temp_override(object=o,active_object=o,selected_objects=[o],selected_editable_objects=[o]):bpy.ops.object.convert(target='MESH')
  return o
 # Reuse the supplied product photography for the printed wrap; do not approximate the logo.
 label_materials=[]
 for flavor in ['basic','light','mint','ginger']:
  m=mat('El Tony '+flavor+' photographic label',(1,1,1),.18)
  nodes=m.node_tree.nodes;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Roughness'].default_value=.36
  image=nodes.new('ShaderNodeTexImage');image.image=bpy.data.images.load(ROOT+'/public/assets/tony-mate/cans/'+flavor+'.png');image.extension='REPEAT'
  m.node_tree.links.new(image.outputs['Color'],bs.inputs['Base Color']);label_materials.append(m)
 def can(parent,p,flavor,name):
  r=root(name);r.parent=parent;r.location=pos(p)
  # Rounded shoulders, a narrower neck and foot match the short 330 ml reference cans.
  rings=[(.007,.061),(.016,.069),(.030,.074),(.239,.074),(.264,.063),(.276,.061)]
  verts=[];faces=[];count=64
  for y,radius in rings:
   for i in range(count):
    angle=math.tau*i/count;verts.append((radius*math.cos(angle),radius*math.sin(angle),y))
  for j in range(len(rings)-1):
   for i in range(count):faces.append((j*count+i,j*count+(i+1)%count,(j+1)*count+(i+1)%count,(j+1)*count+i))
  mesh=bpy.data.meshes.new(name+' printed wrap');mesh.from_pydata(verts,[],faces);mesh.update()
  body=bpy.data.objects.new(name+' reference label',mesh);collection.objects.link(body);own(body,body.name,r,label_materials[flavor])
  uv=mesh.uv_layers.new(name='Product label UV')
  for face in mesh.polygons:
   j=face.index//count;i=face.index%count
   # Front is Blender +Y (game -Z); image center faces the player. Repeat on the back.
   for loop,(column,row) in zip(face.loop_indices,[(i,j),(i+1,j),(i+1,j+1),(i,j+1)]):
    u=.065+.87*(column/count*2-(i//(count//2)));v=.08+(rings[row][0]-.007)/(.276-.007)*.91
    uv.data[loop].uv=(u,v)
  cylinder('Bottom rolled metal rim',(0,.006,0),.062,.010,silver,r)
  cylinder('Top rolled metal rim',(0,.278,0),.062,.009,silver,r)
  cylinder('Recessed can lid',(0,.281,0),.056,.004,silver,r)
  # Oval ring pull, rather than a solid rectangle.
  bpy.ops.mesh.primitive_torus_add(major_radius=.012,minor_radius=.003,major_segments=16,minor_segments=6,location=pos((0,.285,-.010)))
  tab=own(bpy.context.object,'Ring pull tab',r,silver);tab.scale=(.7,1,1)
  return r
 machine=root('MateMachine_Blender')
 # Hollow front construction keeps the glass shelves and collection tray visible.
 box('Cabinet back',(0,1.36,.30),(1.95,2.6,.30),blue,machine,.06)
 for x in [-.91,.91]:box('Cabinet side',(x,1.36,-.05),(.13,2.6,.90),blue,machine,.04)
 box('Header crown',(0,2.53,-.13),(1.83,.24,.78),blue,machine,.045)
 box('Heavy kick plate',(0,.16,-.11),(1.83,.20,.8),blue,machine)
 for x in [-.78,.78]:box('Rubber foot',(x,.04,.16),(.18,.08,.42),dark,machine,.018)
 # Screen-left stocked window; screen-right real interaction panel.
 box('Display recess',(.35,1.45,.065),(1.05,1.75,.12),dark,machine)
 for x in [-.20,.88]:box('Window door frame',(x,1.45,-.43),(.055,1.83,.07),silver,machine,.009)
 for y in [.56,2.34]:box('Window cross frame',(.34,y,-.43),(1.14,.055,.07),silver,machine,.009)
 for i in range(4):
  y=2.0-i*.37
  box('Shelf tray',(.34,y-.045,-.16),(1.02,.035,.52),silver,machine,.006)
  box('Shelf LED strip',(.34,y-.02,-.39),(1.0,.012,.014),light,machine,.003)
  for x in [.03,.33,.63]:can(machine,(x,y,-.27),i,f'StockCan_{i}_{x}')
  text('Flavor shelf number',f'0{i+1}',(.77,y-.04,-.44),.045,gold,machine)
 box('Payment console',(-.58,1.46,-.45),(.70,1.98,.095),dark,machine,.026)
 for x in [-.955,-.205]:box('Payment chrome trim',(x,1.46,-.48),(.018,2.03,.014),silver,machine,.003)
 box('Card reader lip',(-.58,.65,-.515),(.55,.055,.035),silver,machine,.008)
 box('Collection cavity',(.34,.36,.10),(1.11,.37,.10),dark,machine)
 box('Collection sill',(.34,.18,-.43),(1.16,.065,.38),silver,machine,.012)
 for x in [-.23,.91]:box('Collection side lip',(x,.34,-.31),(.045,.29,.30),blue,machine)
 box('Collection overhead',(.34,.55,-.31),(1.17,.08,.30),blue,machine)
 text('Cabinet brand','EL TONY MATE',(0,2.54,-.54),.16,gold,machine)
 text('Cabinet detail','COLD BREW  /  330 ml  /  SWISS ENERGY',(.05,2.40,-.54),.036,silver,machine)
 for y in [.92,1.06,1.20,1.34]:box('Side vent slat',(.986,y,.10),(.012,.035,.38),dark,machine,.003)
 # Export only the new scene's objects. Existing Blender scenes remain untouched.
 def export(root,path):
  bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
  for o in root.children_recursive:o.select_set(True)
  bpy.context.view_layer.objects.active=root
  bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_apply=True,use_active_scene=True)
 export(machine,ROOT+'/public/models/mate-machine.glb')
 prize=can(None,(0,0,0),2,'MintCan_Blender');export(prize,ROOT+'/public/models/mate-can-mint.glb')
 prize.location.x=3
 bpy.data.libraries.write(ROOT+'/assets/blender/mate-machine.blend',{scene},fake_user=True)
bpy.context.window.scene=previous
print('Exported 12 reference-textured cans and matching collectible Mint can; restored previous scene.')
