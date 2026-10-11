import * as THREE from 'three';

export const EJECTION_DURATION=1.2;
const WINDUP=.35,GRAVITY=9.81;
/** Move through the side door before applying an outward ballistic throw. */
export function helicopterEjectionPose(age,seat,start,orientation){
 const exit=new THREE.Vector3(1.65,.8,.8).applyQuaternion(orientation).add(start);
 const launchAge=Math.max(0,Math.min(age,EJECTION_DURATION)-WINDUP);
 const outward=new THREE.Vector3(6.5,0,0).applyQuaternion(orientation);
 const position=age<WINDUP?seat.clone().lerp(exit,THREE.MathUtils.smoothstep(age,0,WINDUP)):
  exit.addScaledVector(outward,launchAge).add(new THREE.Vector3(0,1.2*launchAge-.5*GRAVITY*launchAge*launchAge,0));
 return {position,fallSpeed:Math.max(0,GRAVITY*launchAge-1.2),roll:-Math.sin(Math.min(1,launchAge/.85)*Math.PI)*.45};
}
