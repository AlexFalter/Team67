import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {featurePlacement} from '../../world/placements/feature-placement.js';
import {createWorldAccess} from '../../world/core/world-access.js';
import {createFeatureLifecycle,disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {updateDialogueVolume} from '../../shared/dialogue/dialogue-distance.js';

/** Map-independent Blender dancer; host owns placement, ticking and audio settings. */
export async function createTikiPerformer(scene,world,solver,{placement,avoid=[],avoidPaths=[],signal}={}){
 const site=featurePlacement(world,'tikiPerformer',placement),access=createWorldAccess(world,solver);
 let center=site.position?new THREE.Vector3(...site.position):null;
 search:for(const anchor of center?[]:site.searchAnchors??[site.anchor])candidate:for(const [dx,dz] of [[0,0],[4,0],[-4,0],[0,4],[0,-4],[8,0],[-8,0]]){
  const x=anchor[0]+dx,z=anchor[1]+dz,y=world.height(x,z);
  if(avoid.some(p=>Math.hypot((p.x??p[0])-x,(p.z??p[1])-z)<3))continue;
  // Keep the entire performer/speaker footprint outside moving vehicle corridors.
  if(avoidPaths.some(path=>path.slice(1).some((b,i)=>{
   const a=path[i],vx=b[0]-a[0],vz=b[1]-a[1],length=vx*vx+vz*vz;
   const t=length?Math.max(0,Math.min(1,((x-a[0])*vx+(z-a[1])*vz)/length)):0;
   return Math.hypot(x-a[0]-t*vx,z-a[1]-t*vz)<3.5;
  })))continue;
  if(!access.clearFloor(x,z))continue;
  for(let i=0;i<16;i++){
   const a=i*Math.PI/8,px=x+Math.cos(a)*1.2,pz=z+Math.sin(a)*1.2;
   if(!access.clearFloor(px,pz)||Math.abs(world.height(px,pz)-y)>.1)continue candidate;
  }
  if(!access.walkablePath(new THREE.Vector3(anchor[0],world.height(...anchor),anchor[1]),new THREE.Vector3(x,y,z)))continue;
  center=new THREE.Vector3(x,y,z);break search;
 }
 if(!center)throw Error('No clear level ground for the Tiki performer');
 const response=await fetch('/models/tiki-performer/tiki-performer.glb',{signal});
 if(!response.ok)throw Error(`Tiki performer model failed to load (${response.status})`);
 const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'');
 if(signal?.aborted){disposeOwnedObject(gltf.scene);signal.throwIfAborted();}
 const group=new THREE.Group();group.name='Tiki Tiki · street performer';group.position.copy(center);group.rotation.y=site.heading??0;group.add(gltf.scene);
 gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 const clip=gltf.animations.length?new THREE.AnimationClip('Tiki backflips',Math.max(...gltf.animations.map(a=>a.duration)),gltf.animations.flatMap(a=>a.tracks)):null;
 if(!clip){disposeOwnedObject(group);throw Error('Tiki performer has no dance animation');}
 const mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(clip).play();scene.add(group);group.updateMatrixWorld(true);
 const speaker=group.getObjectByName('MusicBox'),speakerPosition=new THREE.Vector3();
 const audio=new Audio('/audio/tiki-tiki.mp3');audio.preload='auto';audio.volume=0;
 const lifecycle=createFeatureLifecycle();let age=0,cooldown=0,pending=false,failed=false,plays=0,generation=0,enabled=false;
 const retry=()=>{failed=false;};lifecycle.listen(window,'pointerdown',retry);lifecycle.listen(window,'keydown',retry);
 function stop(){generation++;audio.pause();audio.currentTime=0;audio.volume=0;pending=false;}
 audio.onended=()=>{cooldown=3;};
 return {group,center,audio,mixer,
  update(dt,listener,{active=true,muted=false}={}){
   if(lifecycle.disposed)return;dt=Math.max(0,Math.min(.1,dt||0));enabled=active;
   if(!active){if(!audio.paused||pending)stop();return;}
   age+=dt;mixer.update(dt);cooldown=Math.max(0,cooldown-dt);
   speaker.getWorldPosition(speakerPosition);
   updateDialogueVolume(audio,listener,speakerPosition,{dt,muted,volume:.32,near:3,far:19});
   if(audio.volume<=.005){if(!audio.paused||pending)stop();return;}
   if(audio.paused&&!pending&&!failed&&cooldown===0){
    pending=true;const token=++generation;audio.currentTime=0;
    audio.play().then(()=>{if(token!==generation||lifecycle.disposed)return;pending=false;plays++;}).catch(()=>{if(token===generation){pending=false;failed=true;}});
   }
  },
  reset(){if(lifecycle.disposed)return;stop();age=cooldown=plays=0;failed=false;mixer.setTime(0);},
  dispose(){if(lifecycle.disposed)return;audio.onended=null;stop();lifecycle.dispose();mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);disposeOwnedObject(group);audio.removeAttribute('src');audio.load();},
  state:()=>({center:center.toArray(),position:group.position.toArray(),age,enabled,plays,failed,sounding:!audio.paused,volume:audio.volume,animation:clip.name,duration:clip.duration,source:'Blender',hasMusicBox:!!speaker})
 };
}
