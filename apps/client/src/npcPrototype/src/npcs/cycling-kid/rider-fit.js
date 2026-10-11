import * as THREE from 'three';

// Keep this NPC's contact pose separate from the player's riding animation.
export function createFittedRider(rig,bike){
 const {player,limbs,elbows,knees}=rig;
 // Contact anchors match the authored Blender model (merged frame geometry).
 const gripPoints=[new THREE.Vector3(-.405,1.69,-.59),new THREE.Vector3(.405,1.69,-.59)];
 const pedalPoints=[new THREE.Vector3(-.2,.8,.15),new THREE.Vector3(.2,.5,.15)];
 const target=p=>bike.localToWorld(p.clone());
 for(let i=0;i<2;i++){
  const leg=limbs[i*2+1],knee=knees[i];knee.position.y=-.432;
  for(const mesh of leg.children)if(mesh.isMesh){mesh.position.y*=1.2;mesh.scale.y*=1.2;}
  for(const mesh of knee.children)if(mesh.isMesh){mesh.position.y*=1.2;mesh.scale.y*=1.2;}
  const arm=limbs[i*2],elbow=elbows[i];elbow.position.y=-.3;
  for(const mesh of arm.children)if(mesh.isMesh){mesh.position.y*=1.5;mesh.scale.y*=1.5;}
  for(const mesh of elbow.children)if(mesh.isMesh){mesh.position.y*=1.5;mesh.scale.y*=1.5;}
 }

 const down=new THREE.Vector3(0,-1,0),hip=new THREE.Vector3(0,.9,0);
 function solve(upper,lower,end,target,pole){
  player.updateWorldMatrix(true,true);
  const goal=player.worldToLocal(target.clone()),start=upper.position.clone(),delta=goal.sub(start);
  const a=lower.position.length(),b=end.length(),distance=delta.length(),d=THREE.MathUtils.clamp(distance,Math.abs(a-b)+1e-5,a+b-1e-5),direction=delta.normalize();
  const bend=pole.clone().addScaledVector(direction,-pole.dot(direction)).normalize();
  const along=(a*a+d*d-b*b)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
  const joint=direction.clone().multiplyScalar(along).addScaledVector(bend,height);
  upper.quaternion.setFromUnitVectors(down,joint.normalize());
  upper.updateWorldMatrix(true,true);
  const localGoal=upper.worldToLocal(target.clone()).sub(lower.position);
  lower.quaternion.setFromUnitVectors(end.clone().normalize(),localGoal.normalize());
 }
 return {
  update(dt,speed){

   player.rotation.set(-.85,0,0);player.position.set(0,0,0);
   // The pelvis sits on the saddle, rather than hovering above a generic offset.
   player.position.copy(new THREE.Vector3(0,1.51*.86+.08,.45*.86).sub(hip.clone().applyEuler(player.rotation)));
   bike.updateWorldMatrix(true,true);player.updateWorldMatrix(true,true);
   for(let i=0;i<2;i++){
    const side=i===0?-1:1;
    solve(limbs[i*2],elbows[i],new THREE.Vector3(0,-.3375,-.01),target(gripPoints[i]),new THREE.Vector3(side*.5,-1,0));
    solve(limbs[i*2+1],knees[i],new THREE.Vector3(0,-.558,-.045),target(pedalPoints[i]).add(new THREE.Vector3(0,.055,0)),new THREE.Vector3(0,0,-1));
   }
  },
  reset(){},
  contacts(){player.updateWorldMatrix(true,true);return gripPoints.map((g,i)=>({handError:elbows[i].localToWorld(new THREE.Vector3(0,-.3375,-.01)).distanceTo(target(g)),footError:knees[i].localToWorld(new THREE.Vector3(0,-.558,-.045)).distanceTo(target(pedalPoints[i]).add(new THREE.Vector3(0,.055,0)))}));}
 };
}
