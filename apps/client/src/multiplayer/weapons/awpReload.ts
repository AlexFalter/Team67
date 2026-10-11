import * as THREE from 'three';
import {AWP_MAGAZINE} from '@race/shared';
const smooth=(t:number)=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
// The support hand reaches below the view, brings the spare darts up, and fills the carrier.
export function applyAwpReload(model:THREE.Group,progress:number,ammo:number,reserve:number,active:boolean){
 const bundle=model.getObjectByName('pocket-darts')!,hand=model.getObjectByName('reload-hand')!,carrier=model.getObjectByName('left-dart-carrier')!;
 bundle.visible=active&&progress>.18&&progress<.72;hand.visible=active;
 const amount=Math.min(AWP_MAGAZINE-ammo,reserve),travel=smooth((progress-.22)/.44);
 bundle.position.set(-.09*(1-travel),-.65*(1-travel),.2*(1-travel));
 for(const child of bundle.children)(child as THREE.InstancedMesh).count=amount;
 hand.position.set(-.22+bundle.position.x,.015+bundle.position.y,.06+bundle.position.z);
 if(active){for(const child of carrier.children)(child as THREE.InstancedMesh).count=Math.max(0,ammo-1)+(progress>=.72?amount:0);model.getObjectByName('trigger-hand')!.visible=true;}
}
