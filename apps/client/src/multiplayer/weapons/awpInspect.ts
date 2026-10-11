import * as THREE from 'three';
import {AWP_INSPECT_MS} from '@race/shared';
const ease=(t:number)=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const lifted=new THREE.Vector3(.04,-.16,-.68),ready=new THREE.Vector3(.26,-.3,-.55);
const display=new THREE.Quaternion().setFromEuler(new THREE.Euler(.14,-.65,-.42));
const rest=new THREE.Quaternion();
export function applyAwpInspect(model:THREE.Group,elapsed:number,start:THREE.Vector3,rotation:THREE.Quaternion){
 const t=elapsed/(AWP_INSPECT_MS/1000);if(t<0||t>=1)return false;
 if(t<.25){const k=ease(t/.25);model.position.lerpVectors(start,lifted,k);model.position.y+=Math.sin(Math.PI*k)*.08;model.quaternion.slerpQuaternions(rotation,display,k);}
 else if(t<.78){const k=(t-.25)/.53;model.position.copy(lifted);model.position.y+=Math.sin(Math.PI*k)*.025;model.rotation.set(.14+Math.sin(k*Math.PI*2)*.12,-.65+Math.sin(k*Math.PI*2)*.5,-.42-Math.sin(k*Math.PI)*.2);}
 else{const k=ease((t-.78)/.22);model.position.lerpVectors(lifted,ready,k);model.quaternion.slerpQuaternions(display,rest,k);}
 const hand=model.getObjectByName('reload-hand')!;hand.visible=true;hand.position.set(-.06,-.065,-.33);hand.rotation.set(0,0,0);
 model.getObjectByName('bolt-hand')!.visible=false;model.getObjectByName('trigger-hand')!.visible=true;
 return true;
}
