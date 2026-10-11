import {createDialogueAudio} from '../../shared/dialogue/dialogue-audio.js';
import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {featurePlacement} from '../../world/placements/feature-placement.js';
import {gameConfig} from '../../config/game-config.js';
import {styleEncounterLine} from '../../shared/dialogue/encounter-ui.js';
import * as THREE from 'three';
import {createWorldAccess} from '../../world/core/world-access.js';
import {createStudent} from '../../player/student-model.js';
import {nearSegment} from '../../world/core/geo-world.js';
import financeAudioEdit from '../../../assets/audio/finance-guy-edit.json';

// Original SRF answers edited into a single-speaker monologue.
export function createFinanceGuy(scene,world,solver,{onComplete,placement,uiRoot=document.body}){
 placement=featurePlacement(world,'finance',placement);
 const layoutRoute=placement.accessRoute;
 const worldAccess=createWorldAccess(world,solver);
 const rig=createStudent(),actor=rig.player;actor.name='Finance Guy';scene.add(actor);actor.scale.setScalar(1.07);
 actor.traverse(o=>{if(!o.isMesh)return;const c=o.material.color?.getHexString();if(['cf633d','a9432d'].includes(c)){o.visible=false;return;}if(['f4e7cc','284b60','f0eee5','52666d'].includes(c)){o.material=o.material.clone();o.material.color.set(c==='f4e7cc'?'#d8cdb7':c==='284b60'?'#223346':'#49392c');}});
 function box(parent,x,y,z,w,h,d,c){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:c,roughness:.55}));mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 // Quarter-zip, pale shirt collar, tortoiseshell sunglasses, earbuds and a watch.
 box(actor,0,1.31,-.16,.018,.28,.024,'#817967');for(const side of [-1,1]){const collar=box(actor,side*.11,1.39,-.08,.12,.16,.14,'#e5dbc8');collar.rotation.z=side*.3;const shirt=box(actor,side*.045,1.425,-.16,.065,.075,.035,'#eedcda');shirt.rotation.z=side*.35;
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.084,.013,8,20),new THREE.MeshStandardMaterial({color:'#b89a69',roughness:.35}));rim.position.set(side*.09,1.625,-.174);rim.scale.y=.8;actor.add(rim);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.073,20),new THREE.MeshStandardMaterial({color:'#152630',roughness:.2,metalness:.25,side:THREE.DoubleSide}));lens.position.set(side*.09,1.625,-.178);lens.scale.y=.8;actor.add(lens);
  box(actor,side*.163,1.613,-.023,.018,.02,.25,'#b89a69');const bud=new THREE.Mesh(new THREE.SphereGeometry(.026,10,8),new THREE.MeshStandardMaterial({color:'#f4f6f3'}));bud.position.set(side*.16,1.585,-.005);actor.add(bud);box(actor,side*.168,1.552,-.008,.018,.06,.021,'#f4f6f3');
  box(rig.knees[side<0?0:1],0,-.33,-.055,.178,.08,.225,'#8c2d37');
 }
 box(actor,0,1.63,-.18,.042,.014,.02,'#b89a69');const watch=box(rig.elbows[0],0,-.14,-.065,.125,.05,.018,'#c0b9a6');watch.rotation.x=.1;
 const mouth=box(actor,0,1.535,-.177,.064,.015,.012,'#77463c');
 // Keep the placement root on the ground while the visual hips rest on the seat.
 const seated=placement.seated===true,seatOffset=seated?(placement.seatHeight??.5)/actor.scale.y-(.9-.1125):0;
 if(seated){const body=new THREE.Group();body.name='Seated finance guy';body.position.y=seatOffset;for(const child of [...actor.children])body.add(child);actor.add(body);}
 function restPose(){
  rig.limbs.forEach(l=>l.rotation.set(0,0,0));rig.elbows.forEach(l=>l.rotation.set(0,0,0));
  for(let i=0;i<2;i++){rig.limbs[i*2+1].rotation.x=seated?Math.PI/2:0;rig.knees[i].rotation.x=seated?-Math.PI/2:0;}
  if(seated){rig.limbs[0].rotation.x=.45;rig.limbs[2].rotation.x=.45;rig.elbows.forEach(l=>l.rotation.x=.7);}
 }
 restPose();
 const anchors=placement.searchAnchors;let site=new THREE.Vector3(...placement.fixedSite),access=new THREE.Vector3(...placement.fixedAccess),baseHeading=placement.heading??Math.atan2(access.x-site.x,access.z-site.z)+Math.PI;
 candidate:for(const {point:a,next:b} of (site?[]:anchors)){if(!a||!b)continue;const forward=new THREE.Vector3(b[0]-a[0],0,b[1]-a[1]).normalize(),right=new THREE.Vector3(-forward.z,0,forward.x);
  for(const offset of [7,-7,9,-9,12,-12]){const p=new THREE.Vector3(a[0],world.height(...a),a[1]).addScaledVector(right,offset);p.y=world.height(p.x,p.z);
   if(layoutRoute.slice(1).some((b,i)=>nearSegment(p.x,p.z,layoutRoute[i],b).distance<5))continue;
   let valid=true;for(const dx of [-.8,0,.8])for(const dz of [-.8,0,.8]){const q=new THREE.Vector3(p.x+dx,world.height(p.x+dx,p.z+dz),p.z+dz);if(world.isWater(q.x,q.z)||world.blocked(q.x,q.z)||solver.penetration(q)>.01||Math.abs(q.y-p.y)>.3)valid=false;}if(!valid)continue;
   const approach=new THREE.Vector3(a[0],world.height(...a),a[1]);for(let j=0;j<=20;j++){const q=p.clone().lerp(approach,j/20);q.y=world.height(q.x,q.z);if(world.isWater(q.x,q.z)||world.blocked(q.x,q.z)||solver.penetration(q)>.01)valid=false;}if(!valid)continue;
   site=p;access=approach;baseHeading=Math.atan2(approach.x-p.x,approach.z-p.z)+Math.PI;break candidate;
  }
 }
 if(!site)throw Error('No clear accessible finance NPC detour');actor.position.copy(site);actor.rotation.y=baseHeading;
 const audio=createDialogueAudio('/audio/finance-guy.mp3');audio.preload='auto';audio.volume=gameConfig.npcs.finance.volume;
 const overlay=document.createElement('section');overlay.id='finance-guy-cinema';overlay.classList.add('inspection-cinema');overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Finance Guy conversation');overlay.innerHTML='<div class="inspection-top"><span>UNSCHEDULED NETWORKING</span><b>FINANCE GUY</b></div><div class="inspection-subtitle"><span>FINANCE GUY</span><p class="finance-topic"></p><small>Unskippable conversation</small><div class="inspection-progress finance-progress"><i></i></div></div>';uiRoot.append(overlay);styleEncounterLine(overlay.querySelector('.finance-topic'));
 const topic=overlay.querySelector('.finance-topic'),progress=overlay.querySelector('.finance-progress i');let duration=0;const topics=financeAudioEdit.segments.map((clip,i)=>{const topic=[duration,clip.topic];duration+=clip.end-clip.start+(i<financeAudioEdit.segments.length-1?financeAudioEdit.gapSeconds:0);return topic;});duration=Math.round(duration*1000)/1000;
 let active=false,used=false,age=0,count=0,audioPlayed=false,audioFailed=false,generation=0;const frozen=new THREE.Vector3();
 function end(){active=false;audio.pause();overlay.hidden=true;document.body.classList.remove('finance-guy-cutscene');mouth.scale.y=1;actor.rotation.set(0,baseHeading,0);restPose();onComplete(frozen.clone());}
 return {dispose(){this.reset();audio.onended=null;overlay.remove();disposeOwnedObject(actor);},actor,audio,active:()=>active,
  state:()=>({active,used,age,duration,count,audioPlayed,audioFailed,audioTime:audio.currentTime,audioEnded:audio.ended,unskippable:true,seated,position:site.toArray(),access:access.toArray()}),
  maybeStart(position){if(active||used||!worldAccess.canInteract(position,seated?access:site,gameConfig.npcs.finance.interactionDistance))return false;
   active=true;used=true;count++;age=0;audioPlayed=false;audioFailed=false;frozen.copy(position);actor.rotation.y=seated?baseHeading:Math.atan2(site.x-position.x,site.z-position.z);overlay.hidden=false;document.body.classList.add('finance-guy-cutscene');topic.textContent=topics[0][1];progress.style.width='0%';audio.currentTime=0;const session=++generation;audio.play().then(()=>{if(session===generation)audioPlayed=true;}).catch(()=>{if(session===generation)audioFailed=true;});return true;
  },
  update(dt,position,camera){if(!active)return false;age+=Math.max(0,dt);position.copy(frozen);const t=audioPlayed?audio.currentTime:Math.min(age,duration);
   const talk=Math.abs(Math.sin(t*17))*Math.abs(Math.sin(t*5.3));mouth.scale.y=.35+talk*1.7;rig.limbs[0].rotation.x=seated?.45+Math.sin(t*1.7)*.15:-.25-Math.sin(t*1.7)*.3;rig.limbs[0].rotation.z=.16+Math.sin(t*2.1)*.12;rig.elbows[0].rotation.x=seated?.7+Math.abs(Math.sin(t*1.3))*.2:-.35-Math.abs(Math.sin(t*1.3))*.5;rig.limbs[2].rotation.x=seated?.45:-.2-Math.abs(Math.sin(t*1.5))*.3;rig.elbows[1].rotation.x=seated?.7:-.5;actor.rotation.z=Math.sin(t*1.2)*.015;
   actor.updateMatrixWorld(true);const target=actor.localToWorld(new THREE.Vector3(0,1.5+seatOffset,0)),close=THREE.MathUtils.smoothstep(age,0,2),eye=actor.localToWorld(new THREE.Vector3(THREE.MathUtils.lerp(-1,-.5,close),1.64+seatOffset,THREE.MathUtils.lerp(-3.4,-2.65,close)));camera.up.set(0,1,0);camera.position.copy(eye);camera.lookAt(target);
   topic.textContent=topics.filter(([at])=>at<=t).at(-1)[1];progress.style.width=`${Math.min(1,t/duration)*100}%`;
   // Real audio must finish; restarting, movement and map controls cannot end it early.
   if(age>=duration&&(audioFailed||audio.ended||audio.error||age>=duration+2)){end();return true;}return false;
  },
  reset(){generation++;active=false;used=false;age=0;count=0;audioPlayed=false;audioFailed=false;audio.pause();audio.currentTime=0;overlay.hidden=true;document.body.classList.remove('finance-guy-cutscene');actor.rotation.set(0,baseHeading,0);restPose();mouth.scale.y=1;}
 };
}
