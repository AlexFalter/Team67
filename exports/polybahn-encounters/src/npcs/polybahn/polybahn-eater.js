import {gameConfig} from '../../config/game-config.js';
import {styleRPGDialogue} from '../../shared/dialogue/rpg-dialogue.js';
import {updateDialogueVolume} from '../../shared/dialogue/dialogue-distance.js';
import {styleEncounterLine} from '../../shared/dialogue/encounter-ui.js';
import * as THREE from 'three';
import {createStudent} from '../../player/student-model.js';
import {seatPassenger, AISLE_LIMIT} from '../../vehicles/rail/polybahn-seated.js';

export function createPolybahnEater(car,{onClose=()=>{}}={}){
 const rig=createStudent(),actor=rig.player;actor.name='Pulled-pork enthusiast';actor.scale.setScalar(.8);seatPassenger(rig,-.88,1.20);actor.rotation.y=-Math.PI/2;car.add(actor);
 actor.traverse(o=>{if(!o.isMesh)return;const c=o.material.color?.getHexString();if(['cf633d','a9432d'].includes(c)){o.visible=false;return;}o.material=o.material.clone();if(c==='f4e7cc')o.material.color.set('#182027');if(c==='302e2a')o.material.color.set('#c4a86f');if(c==='bd8869')o.material.color.set('#ddb395');});

 const mouth=new THREE.Mesh(new THREE.BoxGeometry(.10,.035,.025),new THREE.MeshStandardMaterial({color:'#643c31'}));mouth.position.set(0,1.52,-.167);actor.add(mouth);
 const tray=new THREE.Group();tray.position.set(0,1,-.39);actor.add(tray);const plate=new THREE.Mesh(new THREE.BoxGeometry(.50,.06,.35),new THREE.MeshStandardMaterial({color:'#f1eee4'}));tray.add(plate);const pork=new THREE.Mesh(new THREE.SphereGeometry(.14,12,8),new THREE.MeshStandardMaterial({color:'#703c23',roughness:1}));pork.scale.set(1.3,.5,.85);pork.position.y=.07;tray.add(pork);
 const audio={chewing:new Audio('/audio/polybahn-eater-chewing.mp3'),question:new Audio('/audio/polybahn-eater-question.mp3'),lunch:new Audio('/audio/polybahn-eater-lunch.mp3'),closer:new Audio('/audio/polybahn-eater-closer.mp3'),delicious:new Audio('/audio/polybahn-eater-delicious.mp3')};for(const a of Object.values(audio)){a.preload='auto';a.volume=gameConfig.npcs.eater.voiceVolume;}audio.chewing.loop=true;
 let aboard=false,dialogue=false,selection=0,age=0,played=false,failed=false,speaking=null,generation=0;
 const ui=document.createElement('section');ui.id='eater-dialogue';ui.hidden=true;ui.setAttribute('role','dialog');ui.setAttribute('aria-modal','true');ui.setAttribute('aria-label','Talk to the food enthusiast');ui.innerHTML='<div class="kid-dialogue-name">FOOD ENTHUSIAST · DINNER IN TRANSIT</div><p class="eater-line"></p><small class="eater-translation"></small><div class="kid-options"></div><small>↑ ↓ CHOOSE · ENTER ANSWER · ESC LEAVE</small>';document.body.append(ui);styleRPGDialogue(ui);styleEncounterLine(ui.querySelector('.eater-line'));styleEncounterLine(ui.querySelector('.eater-translation'));
 const choices=gameConfig.npcs.eater.choices,lines=gameConfig.npcs.eater.lines;
 function stop(){generation++;for(const a of Object.values(audio)){a.pause();a.currentTime=0;}speaking=null;}
 function play(key){const token=++generation;speaking=key;audio[key].currentTime=0;audio[key].play().then(()=>{if(token===generation)played=true;}).catch(()=>{if(token===generation){failed=true;speaking=null;render();}});}
 for(const [key,a] of Object.entries(audio))if(key!=='chewing')a.onended=()=>{speaking=null;render();};
 function render(){const options=ui.querySelector('.kid-options');options.replaceChildren(...choices.map((text,i)=>{const b=document.createElement('button');b.textContent=`${i===selection?'▶':' '} ${text}`;b.className=i===selection?'chosen':'';b.disabled=!!speaking;b.onclick=()=>{selection=i;choose();};return b;}));}
 function say(key){stop();ui.querySelector('.eater-line').textContent=lines[key][0];ui.querySelector('.eater-translation').textContent=lines[key][1];play(key);render();}
 function hide(){stop();dialogue=false;ui.hidden=true;document.body.classList.remove('eater-conversation');onClose();if(aboard)play('chewing');}
 function choose(){if(speaking)return;if(selection===3){hide();return;}say(['lunch','closer','delicious'][selection]);}
 return {actor,audio,active:()=>dialogue,
  near(position){const p=car.worldToLocal(position.clone());return Math.hypot(p.x-actor.position.x,p.z-actor.position.z)<gameConfig.npcs.eater.interactionDistance;},
  interact(position){if(!aboard||!this.near(position))return false;dialogue=true;selection=0;ui.hidden=false;document.body.classList.add('eater-conversation');say('question');return true;},
  dialogueView(position){const eye=car.worldToLocal(position.clone()),away=new THREE.Vector3(eye.x-actor.position.x,0,eye.z-actor.position.z);const distance=away.length();if(distance<1.1)eye.addScaledVector(away.normalize(),1.1-distance);eye.x=THREE.MathUtils.clamp(eye.x,-AISLE_LIMIT,AISLE_LIMIT);eye.z=THREE.MathUtils.clamp(eye.z,-1.95,1.95);eye.y=1.65;return {eye:car.localToWorld(eye),target:car.localToWorld(new THREE.Vector3(actor.position.x,actor.position.y+1.52*actor.scale.y,actor.position.z)),up:new THREE.Vector3(0,1,0).applyQuaternion(car.quaternion)};},
  keydown(e){if(!dialogue)return false;e.preventDefault();if(e.code==='Escape')hide();else if(e.code==='ArrowUp'||e.code==='ArrowDown'){selection=(selection+(e.code==='ArrowUp'?-1:1)+choices.length)%choices.length;render();}else if(e.code==='Enter'&&!e.repeat)choose();return true;},
  update(dt,enabled,muted=false,position){if(enabled!==aboard){aboard=enabled;stop();if(enabled){played=failed=false;play('chewing');}else{dialogue=false;ui.hidden=true;document.body.classList.remove('eater-conversation');}}if(!aboard)return;age+=Math.max(0,dt);const local=position?car.worldToLocal(position.clone()):null;updateDialogueVolume(audio.chewing,local&&{x:local.x,y:0,z:local.z},{x:actor.position.x,y:0,z:actor.position.z},{dt,muted,volume:gameConfig.npcs.eater.chewingVolume,near:gameConfig.npcs.eater.audioNearDistance,far:gameConfig.npcs.eater.audioFarDistance});if(muted)audio.chewing.pause();else if(!dialogue&&audio.chewing.paused){play('chewing');}const beat=Math.sin(age*9);mouth.scale.y=muted?1:.55+Math.abs(beat)*1.9;rig.limbs[0].rotation.x=.7;rig.elbows[0].rotation.x=1.25+beat*.17;rig.limbs[2].rotation.x=.7;rig.elbows[1].rotation.x=1.2-beat*.12;},
  reset(){aboard=dialogue=false;selection=0;age=0;played=failed=false;stop();ui.hidden=true;document.body.classList.remove('eater-conversation');},
  state:()=>({aboard,dialogue,selection,played,failed,speaking,chewing:!audio.chewing.paused,location:actor.position.toArray()})
 };
}
