import '../../shared/dialogue/encounter-panels.css';
import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {gameConfig} from '../../config/game-config.js';
import {styleEncounterLine} from '../../shared/dialogue/encounter-ui.js';
import * as THREE from 'three';
import {createStudent} from '../../player/student-model.js';
import {createRiderAnimation} from '../../player/rider-animation.js';

export function createPolybahnInspector(car,{onComplete,scene,world,solver,stationPosition,stationHeading=0,uiRoot=document.body}){
 const rig=createStudent(),actor=rig.player,animation=createRiderAnimation(rig);actor.name='Polybahn ticket checker';actor.scale.setScalar(.84);actor.visible=false;car.add(actor);
 actor.traverse(o=>{if(!o.isMesh)return;const color=o.material.color.getHexString();if(color==='302e2a'){o.visible=false;return;}if(['f4e7cc','cf633d','a9432d'].includes(color)){o.material=o.material.clone();o.material.color.set('#1a354a');}else if(color==='284b60'){o.material=o.material.clone();o.material.color.set('#202b35');}});
 const navy=new THREE.MeshStandardMaterial({color:'#142e40',roughness:.6}),gold=new THREE.MeshStandardMaterial({color:'#e4bd64',metalness:.35}),paper=new THREE.MeshStandardMaterial({color:'#fff2c9'});
 const cap=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.11,16),navy);cap.position.y=1.78;actor.add(cap);const brim=new THREE.Mesh(new THREE.BoxGeometry(.36,.025,.26),navy);brim.position.set(0,1.73,-.095);actor.add(brim);
 const badge=new THREE.Mesh(new THREE.CircleGeometry(.05,8),gold);badge.position.set(-.11,1.26,-.155);badge.rotation.y=Math.PI;actor.add(badge);
 const mouth=new THREE.Mesh(new THREE.BoxGeometry(.055,.018,.013),navy);mouth.position.set(0,1.535,-.175);actor.add(mouth);
 const clipboard=new THREE.Mesh(new THREE.BoxGeometry(.23,.33,.045),navy);clipboard.position.set(0,-.20,-.06);clipboard.rotation.x=.22;rig.elbows[1].add(clipboard);
 const receipt=new THREE.Mesh(new THREE.PlaneGeometry(.18,.26),new THREE.MeshBasicMaterial({color:'#fff2c9',side:THREE.DoubleSide}));receipt.position.set(0,-.20,-.09);receipt.rotation.set(.22,Math.PI,0);rig.elbows[1].add(receipt);
 const fineCanvas=document.createElement('canvas');fineCanvas.width=256;fineCanvas.height=256;const ctx=fineCanvas.getContext('2d');ctx.fillStyle='#fff2c9';ctx.fillRect(0,0,256,256);ctx.fillStyle='#183847';ctx.font='bold 31px Arial';ctx.textAlign='center';ctx.fillText('FARE NOTICE',128,58);ctx.font='bold 45px Arial';ctx.fillText(`CHF ${gameConfig.npcs.inspector.fineCHF}`,128,138);ctx.font='20px Arial';ctx.fillText('RECTANGLES MATTER',128,208);const fineTexture=new THREE.CanvasTexture(fineCanvas);fineTexture.colorSpace=THREE.SRGBColorSpace;receipt.material.map=fineTexture;
 const overlay=document.createElement('section');overlay.id='polybahn-inspection';overlay.classList.add('inspection-cinema');overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Polybahn ticket inspection');overlay.innerHTML=`<div class="inspection-top"><span>POLYBAHN · FARE INSPECTION</span><b id="inspection-fine">TICKET CHECK</b></div><div class="inspection-subtitle pixel-panel"><span>INSPECTOR BÜNZLI</span><p id="inspection-dialogue" role="status" aria-live="polite"></p><small>Mandatory inspection · <span id="inspection-countdown"></span></small><div class="inspection-progress"><i id="inspection-progress"></i></div></div>`;uiRoot.appendChild(overlay);styleEncounterLine(overlay.querySelector('#inspection-dialogue'));
 const lines=gameConfig.npcs.inspector.lines.map(line=>line.replaceAll('{fineCHF}',String(gameConfig.npcs.inspector.fineCHF)));
 let outdoors=false;const outdoorEye=new THREE.Vector3();const meeting=new THREE.Group();meeting.name="Station exit ticket check";scene.add(meeting);
 const station=stationPosition?.clone();if(station){station.y=world.height(station.x,station.z);meeting.position.copy(station);meeting.add(actor);actor.position.set(0,0,0);actor.rotation.y=stationHeading;actor.visible=true;}
 const lineDurations=lines.map(line=>Math.max(4,line.split(/\s+/).length/2.2+1.2)),duration=lineDurations.reduce((a,b)=>a+b,0);let active=false,age=0,lineAge=0,lastLine=-1,fineTotal=0,checks=0,speechPending=false,speechToken=0;
 function say(index){if(index===lastLine)return;lastLine=index;lineAge=0;overlay.querySelector('#inspection-dialogue').textContent=lines[index];
  // Let each spoken sentence finish before advancing its subtitle.
  if(window.speechSynthesis&&window.SpeechSynthesisUtterance){const token=++speechToken;speechPending=true;const speech=new SpeechSynthesisUtterance(lines[index]);speech.lang='en-GB';speech.rate=gameConfig.npcs.inspector.speechRate;speech.pitch=gameConfig.npcs.inspector.speechPitch;speech.onend=speech.onerror=()=>{if(token===speechToken)speechPending=false;};window.speechSynthesis.speak(speech);}
 }
 function reset(){active=false;age=0;lineAge=0;speechPending=false;speechToken++;lastLine=-1;fineTotal=0;checks=0;actor.visible=!!station;actor.position.set(0,0,0);actor.rotation.set(0,stationHeading,0);animation.reset();overlay.hidden=true;document.body.classList.remove('ticket-inspection');window.speechSynthesis?.cancel();}
 return {dispose(){reset();overlay.remove();disposeOwnedObject(actor);disposeOwnedObject(meeting);},actor,active:()=>active,
  start(position){if(active)return;
   outdoors=!!position;
   if(outdoors){
    outdoorEye.copy(position).add(new THREE.Vector3(0,1.65,0));
    if(station)meeting.position.copy(station);
    else {const spot=position.clone().add(new THREE.Vector3(1.8,0,0));spot.y=world.height(spot.x,spot.z);meeting.position.copy(spot);}
    meeting.rotation.set(0,0,0);meeting.add(actor);actor.position.set(0,0,0);actor.rotation.set(0,Math.atan2(position.x-meeting.position.x,position.z-meeting.position.z)+Math.PI,0);
   }else car.add(actor);active=true;age=0;lineAge=0;speechPending=false;window.speechSynthesis?.cancel();lastLine=-1;actor.visible=true;overlay.hidden=false;document.body.classList.add('ticket-inspection');receipt.visible=false;animation.reset();say(0);},
  reset,
  update(dt,camera){if(!active)return;age+=Math.max(0,dt);lineAge+=Math.max(0,dt);if(speechPending&&lineAge>=lineDurations[lastLine]&&!window.speechSynthesis?.speaking&&!window.speechSynthesis?.pending)speechPending=false;if(lineAge>lineDurations[lastLine]+5){speechPending=false;window.speechSynthesis?.cancel();}const ready=lineAge>=lineDurations[lastLine]&&!speechPending;if(ready&&lastLine<lines.length-1)say(lastLine+1);
   const walk=THREE.MathUtils.smoothstep(age,0,1.8),position=outdoors?new THREE.Vector3(0,0,0):new THREE.Vector3(0,.48,THREE.MathUtils.lerp(-1.8,-.65,walk));animation.update(Math.min(dt,.1),{position,heading:outdoors?actor.rotation.y:Math.PI,mode:'walk',speed:age<1.8?1.2:0,pedaling:false});
   if(age>=1.8){rig.limbs[0].rotation.x=.50+.22*Math.sin(age*2.4);rig.elbows[0].rotation.x=.55;rig.limbs[2].rotation.x=.65;rig.elbows[1].rotation.x=.35;actor.rotation.z=Math.sin(age*1.8)*.025;}
   mouth.scale.y=.4+Math.abs(Math.sin(age*17))*.9;receipt.visible=lastLine>=2;
   const anchor=outdoors?meeting:car;anchor.updateMatrixWorld(true);const close=THREE.MathUtils.smoothstep(age,1.8,6),eye=anchor.localToWorld(new THREE.Vector3(THREE.MathUtils.lerp(-.2,.2,close),1.96,THREE.MathUtils.lerp(1.7,.9,close))),target=anchor.localToWorld(new THREE.Vector3(0,1.95,-.65));if(outdoors){eye.copy(outdoorEye);target.copy(anchor.localToWorld(new THREE.Vector3(0,1.4,0)));}camera.position.copy(eye);camera.up.set(0,1,0).applyQuaternion(anchor.quaternion);camera.lookAt(target);
   overlay.querySelector('#inspection-fine').textContent=lastLine>=2?`CHF ${gameConfig.npcs.inspector.fineCHF} · +${gameConfig.npcs.inspector.timePenaltySeconds} SECONDS`:'TICKET CHECK';overlay.querySelector('#inspection-countdown').textContent=`${lines.length-1-lastLine} lines remaining`;overlay.querySelector('#inspection-progress').style.width=`${(lastLine+Math.min(1,lineAge/lineDurations[lastLine]))/lines.length*100}%`;
   if(lineAge>=lineDurations[lastLine]&&!speechPending&&lastLine===lines.length-1){active=false;checks++;fineTotal+=gameConfig.npcs.inspector.fineCHF;actor.visible=!!station;actor.position.set(0,0,0);actor.rotation.set(0,stationHeading,0);animation.reset();overlay.hidden=true;document.body.classList.remove('ticket-inspection');window.speechSynthesis?.cancel();onComplete({fine:gameConfig.npcs.inspector.fineCHF,timePenalty:gameConfig.npcs.inspector.timePenaltySeconds});}
  },
  state(){return {active,outdoors,location:actor.getWorldPosition(new THREE.Vector3()).toArray(),age,duration,lineIndex:lastLine,lineAge,speechPending,line:active?lines[Math.max(0,lastLine)]:null,fineTotal,checks};}
 };
}
