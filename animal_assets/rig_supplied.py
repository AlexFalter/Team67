import bpy,math,os,aud,contextlib,io,json
from mathutils import Vector,Matrix,Quaternion
scene=bpy.context.scene
OUT='/Users/robertopais/Documents/random/hackathons/Team67/animal_assets'
# A real field recording, quiet and gently low-pass filtered.
sound=aud.Sound.file(OUT+'/real_moo_source.ogg').lowpass(1800).volume(.48)
sound.write(OUT+'/soft_moo.wav',44100,1,aud.FORMAT_S16,aud.CONTAINER_WAV,aud.CODEC_PCM,0,4096)
def clamp(x):return max(0,min(1,x))
def smooth(x):x=clamp(x);return x*x*(3-2*x)
for name,fx,fy,hx,hy,height in [('Longhorn',.229,-.255,.215,.99,1.65),('Cow',.165,-.336,.17,1.21,1.50)]:
 ob=bpy.data.objects[name+'_Original'];offset=ob.location.copy()
 ad=bpy.data.armatures.new(name+'_Skeleton');rig=bpy.data.objects.new(name+'_Rig',ad);scene.collection.objects.link(rig);rig.location=offset
 bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 def bone(n,h,t,p=None):
  b=ad.edit_bones.new(n);b.head=h;b.tail=t
  if p:b.parent=ad.edit_bones[p]
 bone('root',(0,0,0),(0,0,.2));bone('body',(0,.35,.85),(0,-.15,1.03),'root')
 bone('neck',(0,-.40,1.05),(0,-.72,1.10),'body');bone('head',(0,-.72,1.10),(0,-1.12,.99),'neck')
 bone('jaw',(0,-1.02,.92),(0,-1.29,.86),'head')
 bone('tail',(0,hy+.08,1.08),(0,hy+.14,.50),'body')
 for s,side in [(-1,'L'),(1,'R')]:
  for label,x,y in [('F',fx,fy),('H',hx,hy)]:
   bn=label+side;k=(s*x,y+(.05 if label=='H' else .02),.43)
   bone('upper.'+bn,(s*x,y,.86),k,'body');bone('lower.'+bn,k,(s*x,y,.11),'upper.'+bn)
   bone('hoof.'+bn,(s*x,y,.11),(s*x,y-.10,.055),'lower.'+bn)
 bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
 ob.parent=rig;ob.location=(0,0,0)
 # Region-based skinning keeps head/horns rigid and blends the bend zones.
 for v in ob.data.vertices:
  x,y,z=v.co;weights={'body':1}
  if y<-.53:
   h=smooth((-.53-y)/.25);weights={'neck':1-h,'head':h}
   if y<-1.10 and z<(.99 if name=='Longhorn' else .90):
    jaw=.50*smooth((-1.10-y)/.20)*smooth(((.99 if name=='Longhorn' else .90)-z)/.07)
    weights={'head':1-jaw,'jaw':jaw}
  elif y>hy+.035 and abs(x)<.075 and z<1.18:
   t=smooth((1.18-z)/.25);weights={'body':1-t,'tail':t}
  else:
   label,xpos,ypos=min([('F',fx,fy),('H',hx,hy)],key=lambda q:abs(y-q[2]))
   if abs(y-ypos)<.26 and abs(x)>.075 and z<.90:
    side='L' if x<0 else 'R';bn=label+side
    if z<.16:
     foot=1-smooth((z-.105)/.055);weights={'hoof.'+bn:foot,'lower.'+bn:1-foot}
    else:
     low=1-smooth((z-.36)/.14);body=smooth((z-.63)/.25)
     weights={'lower.'+bn:low*(1-body),'upper.'+bn:(1-low)*(1-body),'body':body}
  for bn,w in weights.items():
   if w>0:
    group=ob.vertex_groups.get(bn) or ob.vertex_groups.new(name=bn);group.add([v.index],w,'REPLACE')
 mod=ob.modifiers.new('Animal skin','ARMATURE');mod.object=rig
 rig.animation_data_create()
 for p in rig.pose.bones:p.rotation_mode='QUATERNION'
 for clip,count in [('SlowWalk',96),('Moo',120),('IdleWalkMoo',360)]:
  rig.animation_data.action=None;action=bpy.data.actions.new(name+'_'+clip);rig.animation_data.action=action
  for f in range(count+1):
   time=f/30
   for p in rig.pose.bones:p.location=(0,0,0);p.rotation_quaternion=Quaternion((1,0,0,0))
   if clip=='SlowWalk':amp=1;phase=f/96
   elif clip=='IdleWalkMoo':amp=math.sin(math.pi*time/4)**2 if time<4 else 0;phase=time/3.2
   else:amp=0;phase=0
   moo_start=.8 if clip=='Moo' else 6
   moo=math.sin(math.pi*clamp((time-moo_start)/2.2))**2 if clip!='SlowWalk' else 0
   rig.pose.bones['body'].location.y=-.013*amp
   rig.pose.bones['neck'].rotation_quaternion=Quaternion((1,0,0),-.055*moo)
   rig.pose.bones['head'].rotation_quaternion=Quaternion((1,0,0),-.09*moo)
   rig.pose.bones['jaw'].rotation_quaternion=Quaternion((1,0,0),.09*moo)
   rig.pose.bones['tail'].rotation_quaternion=Quaternion((0,0,1),.065*math.sin(math.tau*f/count*2))
   bpy.context.view_layer.update()
   def orient(n,h,t):
    p=rig.pose.bones[n];b=rig.data.bones[n];q=(b.tail_local-b.head_local).rotation_difference(t-h)@b.matrix_local.to_quaternion()
    p.matrix=Matrix.Translation(h)@q.to_matrix().to_4x4();bpy.context.view_layer.update()
   for s,side in [(-1,'L'),(1,'R')]:
    for label,x,y,shift in [('F',fx,fy,0 if s<0 else .5),('H',hx,hy,.75 if s<0 else .25)]:
     bn=label+side;u=(phase+shift)%1
     if u<.7:dy=.105*(-1+2*u/.7);lift=0
     else:
      t=(u-.7)/.3;m=.21*.3/.7
      dy=.105*(1-6*t*t+4*t*t*t)+m*(2*t*t*t-3*t*t+t);lift=.045*math.sin(math.pi*t)**2
     A=Vector((s*x,y+dy*amp,.11+lift*amp+.007*amp))
     H=rig.pose.bones['upper.'+bn].head.copy();a=ad.bones['upper.'+bn].length;b=ad.bones['lower.'+bn].length
     d=A-H;dist=min(d.length,a+b-.00001);axis=d.normalized();along=(a*a-b*b+dist*dist)/(2*dist)
     bend=Vector((0,1,0));bend=(bend-axis*bend.dot(axis)).normalized()
     K=H+axis*along+bend*math.sqrt(max(0,a*a-along*along))
     orient('upper.'+bn,H,K);orient('lower.'+bn,K,A);orient('hoof.'+bn,A,A+Vector((0,-.1,-.055)))
   for p in rig.pose.bones:
    p.keyframe_insert('location',frame=f,group=p.name);p.keyframe_insert('rotation_quaternion',frame=f,group=p.name)
  action.use_fake_user=True
  tr=rig.animation_data.nla_tracks.new();tr.name=clip;tr.strips.new(clip,0,action);tr.mute=True
 rig.animation_data.action=bpy.data.actions[name+'_IdleWalkMoo']
 rig['source_archive']=name;rig['moo_event_seconds']=6.0

# Remove the rejected cow scenes and their now-unused objects from this working file.
for old in list(bpy.data.scenes):
 if old.name.startswith('Low Poly Cow'):
  objects=list(old.objects);bpy.data.scenes.remove(old)
  for o in objects:
   if o.users==0:bpy.data.objects.remove(o,do_unlink=True)
scene.render.fps=30;scene.frame_start=0;scene.frame_end=359;scene.frame_set(45)
seq=scene.sequence_editor_create();strips=getattr(seq,'strips',None)
if strips is None:strips=seq.sequences
strip=strips.new_sound('Quiet natural moo',filepath=OUT+'/soft_moo.wav',channel=1,frame_start=180)
strip.sound.pack()
scene.timeline_markers.new('Natural moo',frame=180)
for name in ['Longhorn','Cow']:
 rig=bpy.data.objects[name+'_Rig'];ob=bpy.data.objects[name+'_Original']
 for o in scene.objects:o.select_set(False)
 rig.select_set(True);ob.select_set(True);bpy.context.view_layer.objects.active=rig
 loc=rig.location.copy();rig.location=(0,0,0);rig.animation_data.action=None
 for tr in rig.animation_data.nla_tracks:tr.mute=False
 with contextlib.redirect_stdout(io.StringIO()):
  bpy.ops.export_scene.gltf(filepath=OUT+'/'+name.lower()+'.glb',export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_skins=True,export_yup=True,export_force_sampling=True)
 rig.location=loc
 for tr in rig.animation_data.nla_tracks:tr.mute=True
 rig.animation_data.action=bpy.data.actions[name+'_IdleWalkMoo']
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/supplied_cows_animated.blend')
print('Original supplied meshes rigged, three clips exported per animal; natural moo packed.')
