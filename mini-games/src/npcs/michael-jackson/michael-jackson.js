import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {featurePlacement} from '../../world/placements/feature-placement.js';
import {createWorldAccess} from '../../world/core/world-access.js';
import {createFeatureLifecycle,disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {updateDialogueVolume} from '../../shared/dialogue/dialogue-distance.js';

// Host supplies placement and terrain; the dancer never imports a particular map.
export async function createMichaelJackson(scene,world,solver,{placement,avoid=[],signal}={}){
 const site=featurePlacement(world,'michaelJackson',placement),access=createWorldAccess(world,solver);
 const radius=site.radius??1.4,speed=site.speed??.65,lifecycle=createFeatureLifecycle();
 let center;
 search:for(const anchor of site.searchAnchors??[site.anchor])candidate:for(const offset of [[0,0],[4,0],[-4,0],[0,4],[0,-4],[7,0],[-7,0],[0,7],[0,-7]]){
  const x=anchor[0]+offset[0],z=anchor[1]+offset[1],y=world.height(x,z);
  if(avoid.some(p=>p&&Math.hypot((p.x??p[0])-x,(p.z??p[1])-z)<radius+3))continue;
  if(!access.clearFloor(x,z))continue;
  for(let i=0;i<48;i++)for(const r of [radius-.5,radius,radius+.5]){
   const angle=i/48*Math.PI*2,px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r;
   if(!access.clearFloor(px,pz)||Math.abs(world.height(px,pz)-y)>.18)continue candidate;
  }
  if(!access.walkablePath(new THREE.Vector3(anchor[0],world.height(...anchor),anchor[1]),new THREE.Vector3(x,y,z)))continue;
  center=new THREE.Vector3(x,y,z);break search;
 }
 if(!center)throw Error('No clear level moonwalk area near the configured Michael Jackson placement');
 const response=await fetch('/models/michael-jackson/michael-jackson.glb',{signal});
 if(!response.ok)throw Error(`Michael Jackson model failed to load (${response.status})`);
 const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'');
 if(signal?.aborted){disposeOwnedObject(gltf.scene);signal.throwIfAborted();}
 const group=new THREE.Group();group.name='Michael Jackson · perpetual moonwalk';group.add(gltf.scene);scene.add(group);
 gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 const mixer=new THREE.AnimationMixer(gltf.scene);
 const clip=gltf.animations.length?new THREE.AnimationClip('Moonwalk',Math.max(...gltf.animations.map(a=>a.duration)),gltf.animations.flatMap(a=>a.tracks)):null;
 if(!clip){disposeOwnedObject(group);throw Error('Michael Jackson model has no moonwalk animation');}
 const action=mixer.clipAction(clip);action.setLoop(THREE.LoopRepeat,Infinity).play();
 const audio=new Audio('/audio/michael-jackson-hee-hee.mp3');audio.preload='auto';audio.volume=0;
 let age=0,angle=0,cooldown=0,pending=false,failed=false,played=false,enabled=false,plays=0,generation=0;
 const retry=()=>{failed=false;if(enabled&&audio.volume>.005)play();};lifecycle.listen(window,'pointerdown',retry);lifecycle.listen(window,'keydown',retry);
 function pose(){group.position.set(center.x+Math.cos(angle)*radius,0,center.z+Math.sin(angle)*radius);group.position.y=world.height(group.position.x,group.position.z);group.rotation.y=Math.PI-angle;group.updateMatrixWorld(true);}
 function play(){
  if(lifecycle.disposed||pending||!audio.paused||cooldown>0)return;
  pending=true;const token=++generation;
  audio.currentTime=0;audio.play().then(()=>{if(token!==generation||lifecycle.disposed)return;pending=false;played=true;plays++;cooldown=7;}).catch(()=>{if(token===generation){pending=false;failed=true;}});
 }
 function stop(){generation++;audio.pause();audio.currentTime=0;pending=false;}
 pose();
 return {group,center,radius,audio,mixer,
  update(dt,listener,{active=true,muted=false}={}){
   if(lifecycle.disposed)return;dt=Math.max(0,Math.min(.1,dt||0));enabled=active;
   if(!active){if(!audio.paused||pending)stop();return;}
   age+=dt;angle=(angle+speed/radius*dt)%(Math.PI*2);mixer.update(dt);pose();cooldown=Math.max(0,cooldown-dt);
   updateDialogueVolume(audio,listener,group.position,{dt,muted,volume:.8,near:6,far:28});
   if(audio.volume<=.005){if(!audio.paused||pending)stop();return;}
   if(!failed)play();
  },
  reset(){if(lifecycle.disposed)return;stop();age=angle=cooldown=plays=0;failed=played=false;mixer.setTime(0);pose();},
  dispose(){if(lifecycle.disposed)return;stop();lifecycle.dispose();mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);disposeOwnedObject(group);audio.removeAttribute('src');audio.load();},
  state:()=>({center:center.toArray(),position:group.position.toArray(),radius,speed,angle,age,enabled,played,plays,failed,sounding:!audio.paused,volume:audio.volume,animation:clip.name,duration:clip.duration,source:'Blender',moonwalking:true})
 };
}
