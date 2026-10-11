import {createDialogueAudio} from '../../shared/dialogue/dialogue-audio.js';
import {polybahnDialogueView} from '../../vehicles/rail/polybahn-dialogue-view.js';
import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {gameConfig} from '../../config/game-config.js';
import {styleRPGDialogue} from '../../shared/dialogue/rpg-dialogue.js';
import {updateDialogueVolume} from '../../shared/dialogue/dialogue-distance.js';
import {styleEncounterLine} from '../../shared/dialogue/encounter-ui.js';
import * as THREE from 'three';
import {createStudent} from '../../player/student-model.js';
import {seatPassenger} from '../../vehicles/rail/polybahn-seated.js';

export function createSixSevenKid(car,{onClose=()=>{},onResponse=()=>{},uiRoot=document.body,id='kid-dialogue'}={}){
 const rig=createStudent(),actor=rig.player;actor.name='6–7 kid';actor.scale.setScalar(.74);seatPassenger(rig,.88,-2.05);actor.rotation.y=Math.PI/2;car.add(actor);
 actor.traverse(o=>{if(!o.isMesh)return;const c=o.material.color?.getHexString();if(['cf633d','a9432d'].includes(c)){o.visible=false;return;}if(['f4e7cc','284b60','302e2a','bd8869'].includes(c)){o.material=o.material.clone();o.material.color.set(c==='f4e7cc'?'#a4a49b':c==='284b60'?'#293039':c==='302e2a'?'#ceb477':'#e2b79b');}});
 const blond=new THREE.MeshStandardMaterial({color:'#ceb477',roughness:.9});const hairGeometry=new THREE.SphereGeometry(.077,10,6);for(let i=0;i<9;i++){const tuft=new THREE.Mesh(hairGeometry,blond);const angle=i*2.4;tuft.position.set(Math.cos(angle)*.115,1.73+(i%3)*.025,Math.sin(angle)*.10-.025);tuft.scale.set(1,.65,1);actor.add(tuft);}
 const hoodie=new THREE.Mesh(new THREE.TorusGeometry(.145,.045,8,16),new THREE.MeshStandardMaterial({color:'#a4a49b'}));hoodie.rotation.x=Math.PI/2;hoodie.position.set(0,1.4,.015);actor.add(hoodie);
 for(const x of [-.07,.07]){const drawstring=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.19,6),new THREE.MeshStandardMaterial({color:'#d7d7cd'}));drawstring.position.set(x,1.24,-.155);actor.add(drawstring);}
 const skin=new THREE.MeshStandardMaterial({color:'#e2b79b',roughness:.8});for(const elbow of rig.elbows){const hand=elbow.children.find(o=>o.geometry?.type==='SphereGeometry'&&Math.abs(o.geometry.parameters.radius-.071)<.001);if(hand)hand.scale.set(1,.7,.3);for(let i=0;i<4;i++){const finger=new THREE.Mesh(new THREE.CapsuleGeometry(.012,.048,3,6),skin);finger.position.set((i-1.5)*.026,-.285,-.01);elbow.add(finger);}}
 const mouth=new THREE.Mesh(new THREE.BoxGeometry(.065,.025,.014),new THREE.MeshStandardMaterial({color:'#814e44'}));mouth.position.set(0,1.535,-.176);actor.add(mouth);
 const clock=new THREE.Group();clock.name='Suspiciously priced cabin clock';clock.position.set(.65,1.85,-2.23);car.add(clock);const face=new THREE.Mesh(new THREE.CircleGeometry(.15,24),new THREE.MeshBasicMaterial({color:'#f4ebd1'}));clock.add(face);const rim=new THREE.Mesh(new THREE.TorusGeometry(.15,.012,6,24),new THREE.MeshStandardMaterial({color:'#a8884e'}));clock.add(rim);for(const [length,angle] of [[.075,Math.PI],[.115,7*Math.PI/30]]){const hand=new THREE.Mesh(new THREE.BoxGeometry(.012,length,.012),new THREE.MeshBasicMaterial({color:'#1a2930'}));hand.position.set(Math.sin(angle)*length/2,Math.cos(angle)*length/2,.02);hand.rotation.z=-angle;clock.add(hand);}
 const audio=createDialogueAudio('/audio/six-seven-kid.mp3?v=2');audio.preload='auto';audio.loop=false;audio.volume=gameConfig.npcs.kid.volume;
 let aboard=false,age=0,played=false,failed=false,session=0,performed=false,completed=false,enraged=false,dialogue=false,selection=0;
 const ui=document.createElement('section');ui.id=id;ui.classList.add('kid-dialogue');ui.hidden=true;ui.setAttribute('role','dialog');ui.setAttribute('aria-modal','true');ui.setAttribute('aria-label','Talk to the 67 kid');ui.innerHTML='<div class="kid-dialogue-name">STRANGE KID · LVL 67</div><p class="kid-question">Quick question. How much does that clock cost?</p><div class="kid-options"></div><small>↑ ↓ CHOOSE · ENTER ANSWER · ESC LEAVE</small>';uiRoot.append(ui);styleRPGDialogue(ui);styleEncounterLine(ui.querySelector('.kid-question'));
 const choices=gameConfig.npcs.kid.choices,options=ui.querySelector('.kid-options'),question=ui.querySelector('.kid-question');question.textContent=gameConfig.npcs.kid.question;
 function render(){options.replaceChildren(...choices.map((text,i)=>{const button=document.createElement('button');button.textContent=`${i===selection?'▶':' '} ${text}`;button.className=i===selection?'chosen':'';button.setAttribute('aria-pressed',String(i===selection));button.onclick=()=>{selection=i;choose();};return button;}));}
 function hide(){dialogue=false;ui.hidden=true;document.body.classList.remove('kid-conversation');onClose();}
 audio.addEventListener('ended',()=>{if(performed)completed=true;});
 function chant(){if(!aboard||!enraged||performed)return;performed=true;age=0;audio.currentTime=0;const token=++session;audio.play().then(()=>{if(token===session)played=true;}).catch(()=>{if(token===session)failed=true;});}
 function choose(){if(selection===gameConfig.npcs.kid.triggerChoice){enraged=true;hide();chant();onResponse('YOU SAID THE NUMBER. THERE IS NO UN-SAYING THE NUMBER.');}else{question.textContent=gameConfig.npcs.kid.replies[selection];render();}}

 return {dispose(){this.reset();audio.onended=null;ui.remove();disposeOwnedObject(actor);disposeOwnedObject(clock);},actor,audio,
  active:()=>dialogue,
  dialogueView(position,anchor){return polybahnDialogueView(car,actor,position,1.59,anchor);},
  near(position){if(!aboard||!position)return false;car.updateWorldMatrix(true,false);const local=car.worldToLocal(position.clone());return Math.hypot(local.x-actor.position.x,local.z-actor.position.z)<2.8;} ,
  interact(position){if(!aboard||!this.near(position))return false;if(enraged)return true;dialogue=true;document.body.classList.add('kid-conversation');selection=0;question.textContent=gameConfig.npcs.kid.question;ui.hidden=false;render();return true;},
  keydown(e){if(!dialogue)return false;e.preventDefault();if(e.code==='Escape')hide();else if(e.code==='ArrowUp'||e.code==='ArrowDown'){selection=(selection+(e.code==='ArrowUp'?-1:1)+choices.length)%choices.length;render();}else if(e.code==='Enter'&&!e.repeat)choose();return true;},
  update(dt,enabled,inspection=false,position){
   if(enabled!==aboard){aboard=enabled;if(enabled){if(enraged)chant();}else{session++;if(performed)completed=true;audio.pause();audio.currentTime=0;if(dialogue)hide();}}
   if(!aboard)return;const local=position?car.worldToLocal(position.clone()):null;updateDialogueVolume(audio,local&&{x:local.x,y:0,z:local.z},{x:actor.position.x,y:0,z:actor.position.z},{dt,volume:inspection?gameConfig.npcs.kid.inspectionVolume:gameConfig.npcs.kid.volume,near:gameConfig.npcs.kid.audioNearDistance,far:gameConfig.npcs.kid.audioFarDistance});if(failed&&age>=2.4)completed=true;if(!enraged||completed){seatPassenger(rig,.88,-2.05);actor.rotation.z=0;rig.limbs.filter((_,i)=>i%2===0).forEach(l=>l.rotation.set(0,0,0));rig.elbows.forEach(l=>l.rotation.set(0,0,0));mouth.scale.y=1;return;}age+=Math.max(0,dt);const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:2.4,t=played?audio.currentTime:age%duration,beat=Math.sin(t/duration*Math.PI*2);
   // One open-palmed weighing gesture, synchronized to the original recording.
   for(let i=0;i<2;i++){rig.limbs[i*2].rotation.x=.45;rig.limbs[i*2].rotation.z=i?-.18:.18;rig.elbows[i].rotation.x=1.15+(i?-1:1)*beat*.48;rig.elbows[i].rotation.z=i?-.15:.15;}
   seatPassenger(rig,.88,-2.05);actor.rotation.z=0;mouth.scale.y=.4+Math.abs(Math.sin(t*14))*1.8;
  },
  reset(){document.body.classList.remove('kid-conversation');enraged=false;performed=false;completed=false;dialogue=false;ui.hidden=true;selection=0;session++;aboard=false;age=0;played=false;failed=false;audio.pause();audio.currentTime=0;audio.volume=gameConfig.npcs.kid.volume;seatPassenger(rig,.88,-2.05);actor.rotation.z=0;rig.limbs.filter((_,i)=>i%2===0).forEach(l=>l.rotation.set(0,0,0));rig.elbows.forEach(l=>l.rotation.set(0,0,0));mouth.scale.y=1;},
  state:()=>({enraged,performed,completed,dialogue,selection,aboard,age,played,failed,loop:audio.loop,paused:audio.paused,audioTime:audio.currentTime,volume:audio.volume,handAngles:rig.elbows.map(e=>e.rotation.x)})
 };
}
