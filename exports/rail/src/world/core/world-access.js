import * as THREE from 'three';

// Use the same surveyed collision mesh and graded floor as player movement.
export function createWorldAccess(world,solver){
 const sample=new THREE.Vector3();
 function clearFloor(x,z){sample.set(x,world.height(x,z),z);return !world.blocked(x,z)&&!world.isWater(x,z)&&solver.penetration(sample)<.01;}
 function walkablePath(from,to){
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.4));let previous;
  for(let i=0;i<=steps;i++){
   const t=i/steps,x=THREE.MathUtils.lerp(from.x,to.x,t),z=THREE.MathUtils.lerp(from.z,to.z,t);
   if(!clearFloor(x,z))return false;
   if(previous!==undefined&&Math.abs(sample.y-previous)>.65)return false;
   previous=sample.y;
  }
  return true;
 }
 function canInteract(from,to,range){return from.distanceTo(to)<range&&Math.abs(from.y-world.height(from.x,from.z))<1.25&&Math.abs(to.y-world.height(to.x,to.z))<1.25&&walkablePath(from,to);}
 return {clearFloor,walkablePath,canInteract};
}
