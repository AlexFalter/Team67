import * as THREE from 'three';
import * as C from '@race/shared';

// Adapt the existing world without replacing movement, geometry, or the renderer.
export function mainNpcWorld(map, placements) {
 const buildings=[], ground=[];
 map.updateMatrixWorld(true);
 map.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh){let terrain=false;for(let p=o;p;p=p.parent)if(/^Ground(?:_|$)/i.test(p.name))terrain=true;(terrain?ground:buildings).push(o);}});
 const height=(x,z)=>C.zurichWorld.height(x,z);
 const blocked=(x,z)=>{const y=height(x,z);return y===undefined||C.zurichWorld.blocked(x,y,z,.25,C.CAPSULE_HEIGHT);};
 const world={data:{playableBounds:C.zurichWorld.bounds,encounterBounds:C.zurichWorld.bounds},
  placements:{features:placements},height,ground:height,blocked,isWater:(x,z)=>height(x,z)===undefined,
  buildings,groundMesh:ground[0]??map,bodyBlocked:C.zurichWorld.blocked,bridgeAt:()=>false};
 const ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0);
 world.vehicleWallBlocked=(position,quaternion,halfWidth,halfLength,h)=>{
  // Native walls supplement the coarse grid, including narrow wall slivers.
  const box=new THREE.Box3(),rotation=new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
  box.set(new THREE.Vector3(-halfWidth,.3,-halfLength),new THREE.Vector3(halfWidth,h,halfLength));
  box.applyMatrix4(rotation).translate(position);
  for(const mesh of buildings){const tree=mesh.geometry.boundsTree;if(!tree)continue;
   if(tree.shapecast({intersectsBounds:b=>box.intersectsBox(b),intersectsTriangle:t=>Math.abs(t.getNormal(up).y)<.65&&box.intersectsTriangle(t)}))return true;
  }return false;
 };
 // Surveyed wall hits also prevent NPCs from being placed inside facade slivers.
 const solver={penetration(p){if(blocked(p.x,p.z))return 1;ray.set(p.clone().add(new THREE.Vector3(0,.9,0)),new THREE.Vector3(1,0,0));ray.far=.3;ray.near=0;return ray.intersectObjects(buildings,false).length?1:0;}};
 return {world,solver};
}
