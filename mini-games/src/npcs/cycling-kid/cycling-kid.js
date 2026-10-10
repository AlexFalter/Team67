import song from '../../../assets/audio/cycling-kid-song-edit.json' with {type:'json'};
import * as THREE from 'three';
import {createStudent} from '../../player/student-model.js';
import {createFittedRider} from './rider-fit.js';
import {createWorldAccess} from '../../world/core/world-access.js';
import {createEncounterSubtitle} from '../../shared/dialogue/encounter-ui.js';
import {updateDialogueVolume} from '../../shared/dialogue/dialogue-distance.js';

export function createCyclingKid(scene,world,solver,makeBicycle,{near,avoid=[]}={}){
 const access=createWorldAccess(world,solver),radius=2.8,speed=2.2,isVocalTime=()=>song.vocalWindows.some(([start,end])=>audio.currentTime>=start&&audio.currentTime<=end);
 const bounds=world.data.encounterBounds??world.data.playableBounds;
 let center=null;
 // Validate the whole loop and the bicycle's width, not only its centre point.
 search:for(const distance of [13,18,24,32,40])for(let side=0;side<16;side++){
  const angle=side*Math.PI/8,x=near[0]+Math.cos(angle)*distance,z=near[1]+Math.sin(angle)*distance;
  if(x-radius-1<bounds.minX+12||x+radius+1>bounds.maxX-12||z-radius-1<bounds.minZ+12||z+radius+1>bounds.maxZ-12)continue;
  if(avoid.some(p=>Math.hypot(x-(p.x??p[0]),z-(p.z??p[1]))<radius+5))continue;
  const candidate=new THREE.Vector3(x,world.height(x,z),z);if(!access.clearFloor(x,z))continue;
  const heights=[];
  for(let i=0;i<96;i++)for(const r of [radius-.8,radius,radius+.8]){const a=i/96*Math.PI*2,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;if(!access.clearFloor(px,pz)){heights.push(Infinity);continue;}heights.push(world.height(px,pz));}
  if(!heights.every(Number.isFinite)||Math.max(...heights)-Math.min(...heights)>.65)continue;
  if(!world.data.route.slice(0,12).some(p=>access.walkablePath(new THREE.Vector3(p[0],world.height(...p),p[1]),candidate)))continue;
  center=candidate;break search;
 }
 if(!center)throw Error('No safe circular route for the singing PubliBike cyclist');
 const group=new THREE.Group();group.name='Singing PubliBike cyclist';scene.add(group);
 const bike=makeBicycle();bike.scale.setScalar(.86);group.add(bike);
 const rig=createStudent();rig.player.scale.setScalar(1);group.add(rig.player);
 // Adult student rider; remove the backpack so it does not clip the saddle.
 rig.player.traverse(o=>{if(!o.isMesh||!o.material?.color)return;o.material=o.material.clone();const color=o.material.color.getHexString();if(['cf633d','a9432d'].includes(color))o.visible=false;});
 const animation=createFittedRider(rig,bike),mouth=new THREE.Mesh(new THREE.BoxGeometry(.065,.024,.012),new THREE.MeshStandardMaterial({color:'#703b32'}));mouth.position.set(0,1.54,-.171);rig.player.add(mouth);
 const audio=new Audio(`/audio/${song.file}`);audio.loop=true;audio.preload='auto';audio.volume=0;
 const caption=createEncounterSubtitle('cycling-kid-caption');caption.textContent='Cyclist: “Du bist gut genug.”';
 let angle=0,age=0,enabled=false,pending=false,failed=false,played=false,generation=0;
 function pose(dt=0){group.position.set(center.x+Math.cos(angle)*radius,0,center.z+Math.sin(angle)*radius);group.position.y=world.height(group.position.x,group.position.z);group.rotation.y=Math.atan2(Math.sin(angle),-Math.cos(angle));animation.update(dt,speed);for(const wheel of bike.userData.wheels)wheel.rotation.x-=speed*dt/.29;mouth.scale.y=audio.paused||!isVocalTime()?1:1+Math.abs(Math.sin(audio.currentTime*14))*1.8;group.updateMatrixWorld(true);}
 pose();
 function stop(){generation++;audio.pause();pending=false;caption.hidden=true;}
 function retry(){failed=false;}addEventListener('pointerdown',retry);addEventListener('keydown',retry);
 return {group,rig,bike,audio,center,radius,contacts:animation.contacts,
  update(dt,position,active=true){dt=Math.max(0,Math.min(.1,dt||0));enabled=active;if(!active){stop();return;}age+=dt;angle=(angle+speed/radius*dt)%(Math.PI*2);pose(dt);updateDialogueVolume(audio,position,group.position,{dt,volume:.55,near:4,far:22});
   if(audio.volume>.005&&audio.paused&&!pending&&!failed){pending=true;const token=++generation;audio.play().then(()=>{if(token!==generation)return;pending=false;played=true;}).catch(()=>{if(token===generation){pending=false;failed=true;}});}
   if(audio.volume<=.005&&!audio.paused)audio.pause();caption.hidden=audio.paused||audio.volume<.09||!isVocalTime();
  },
  reset(){stop();audio.currentTime=0;angle=age=0;failed=played=false;animation.reset();for(const wheel of bike.userData.wheels)wheel.rotation.x=0;pose();},
  dispose(){stop();group.removeFromParent();caption.remove();removeEventListener('pointerdown',retry);removeEventListener('keydown',retry);audio.removeAttribute('src');audio.load();},
  state:()=>({center:center.toArray(),radius,speed,angle,age,position:group.position.toArray(),enabled,played,failed,singing:!audio.paused,volume:audio.volume,audioTime:audio.currentTime,phrase:'Du bist gut genug',originalRecording:true,songSection:song.section,sourceStart:song.start,vehicle:'PubliBike',rider:'adult',loop:true})
 };
}
