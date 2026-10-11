import * as THREE from 'three';
import {AWP_COOLDOWN_MS,AWP_MAGAZINE} from '@race/shared';
const smooth=(x:number)=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
// Lift and retract; hold open while a foam dart is inserted; close and lock.
export function awpBoltFrame(elapsed:number){
 const t=elapsed/(AWP_COOLDOWN_MS/1000),active=elapsed>=0&&t<1;
 if(!active)return {active:false,lift:0,pull:0,reach:0,tilt:0,feed:0,feedVisible:false,t:1};
 const lift=smooth((t-.1)/.17)*(1-smooth((t-.86)/.14));
 const pull=smooth((t-.28)/.14)*(1-smooth((t-.75)/.11));
 const reach=smooth((t-.03)/.12)*(1-smooth((t-.88)/.12));
 const feed=smooth((t-.45)/.25);
 return {active,lift,pull,reach,tilt:Math.sin(Math.PI*t),feed,feedVisible:t>=.43&&t<.77,t};
}
export function applyAwpBoltCycle(model:THREE.Group,elapsed:number,ammo=AWP_MAGAZINE){
 const frame=awpBoltFrame(elapsed),bolt=model.getObjectByName('priming-bolt')!,hand=model.getObjectByName('bolt-hand')!,trigger=model.getObjectByName('trigger-hand')!;
 bolt.position.z=.09+frame.pull*.19;bolt.rotation.z=frame.lift*.95;
 hand.visible=frame.active&&frame.reach>.01;trigger.visible=!hand.visible;
 hand.position.set(.095+Math.cos(bolt.rotation.z)*.09,.05+Math.sin(bolt.rotation.z)*.09,bolt.position.z);hand.rotation.z=bolt.rotation.z*.5;
 const carrier=model.getObjectByName('left-dart-carrier')!,feeding=model.getObjectByName('chamber-dart')!,loadingHand=model.getObjectByName('loading-hand')!,chamber=model.getObjectByName('open-chamber')!;
 const count=Math.max(0,Math.min(10,ammo)),spares=frame.active&&frame.t<.43?count:Math.max(0,count-1);
 carrier.children.forEach(darts=>{(darts as THREE.InstancedMesh).count=spares;});
 const dartIndex=Math.max(0,count-1),source=new THREE.Vector3(-.135-Math.floor(dartIndex/5)*.055,.045,.115-(dartIndex%5)*.065),above=new THREE.Vector3(.07,.31,.075),inserted=new THREE.Vector3(.07,.105,-.025);
 feeding.visible=frame.feedVisible&&count>0;loadingHand.visible=feeding.visible;chamber.visible=frame.pull>.5;
 if(frame.feed<.65)feeding.position.lerpVectors(source,above,smooth(frame.feed/.65));else feeding.position.lerpVectors(above,inserted,smooth((frame.feed-.65)/.35));
 feeding.rotation.set(Math.PI/2*(1-frame.feed),Math.PI*frame.feed,0);loadingHand.position.copy(feeding.position).add(new THREE.Vector3(-.065,0,.01));loadingHand.rotation.z=-frame.feed*.25;
 return frame;
}
