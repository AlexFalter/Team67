import {gameConfig} from '../../config/game-config.js';
import * as THREE from 'three';
export function createMoodlePenalty(student){
 let remaining=0,pending=false,course='';
 const ui=document.createElement('aside');ui.id='moodle-penalty';ui.hidden=true;ui.style.cssText='position:fixed;bottom:20%;left:50%;transform:translateX(-50%);z-index:30;padding:16px 24px;background:#182530eb;color:white;border-radius:12px;text-align:center';document.body.append(ui);
 function restore(){student.player.rotation.x=0;student.limbs.forEach(l=>l.rotation.set(0,0,0));student.knees.forEach(l=>l.rotation.set(0,0,0));student.elbows.forEach(l=>l.rotation.set(0,0,0));ui.hidden=true;}
 return {
  fail(subject){pending=true;course=subject;},active:()=>remaining>0,pending:()=>pending,
  update(dt,position,camera,canStart){if(pending&&canStart){pending=false;remaining=gameConfig.moodle.sitOutSeconds;}if(!remaining)return false;
   const t=Math.min(1,(gameConfig.moodle.sitOutSeconds-remaining)*3),rig=student;rig.player.visible=true;rig.player.position.copy(position);rig.player.position.y-=.64*t;rig.player.rotation.x=.10*t;
   for(let i=0;i<2;i++){rig.limbs[i*2+1].rotation.x=1.4*t;rig.knees[i].rotation.x=-.2*t;rig.limbs[i*2].rotation.x=.55*t;rig.elbows[i].rotation.x=-.65*t;}
   ui.hidden=false;ui.textContent=`${course} failed · Existential crisis: ${Math.ceil(remaining)}s`;
   const angle=rig.player.rotation.y;camera.up.set(0,1,0);camera.position.set(position.x-Math.sin(angle+.65)*3.6,position.y+1.7,position.z-Math.cos(angle+.65)*3.6);camera.lookAt(new THREE.Vector3(position.x,position.y+.55,position.z));
   remaining=Math.max(0,remaining-Math.max(0,dt));if(!remaining)restore();return true;
  },reset(){remaining=0;pending=false;restore();},state:()=>({remaining,pending,course})
 };
}
