import {placementRoads} from '../placements/feature-placement.js';
import {carvePassages} from './station-passages.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
THREE.Mesh.prototype.raycast=acceleratedRaycast;
export function pointInPolygon(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){let a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function nearSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return {distance:Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz),t};}
export async function createWorld(scene,{placements}={}){
 placements??=await fetch('/gameplay/feature-placements.json').then(r=>{if(!r.ok)throw Error('Map placement profile failed to load');return r.json();});
 const [gltf,data,area,mapSource,physics]=await Promise.all([new GLTFLoader().loadAsync('/maps/zurich/hb-eth.glb'),fetch(placements.roads?.source??'/gameplay/locations.json').then(r=>r.json()),fetch('/maps/zurich/area.json').then(r=>r.json()),fetch('/maps/zurich/integration.json').then(r=>r.json()),fetch('/maps/zurich/collision.json').then(r=>r.json())]);
 data.streets=placementRoads(placements.roads,data.streets);
 const root=gltf.scene,building=root.getObjectByName('Buildings'),groundMesh=root.getObjectByName('Terrain');
 if(!building?.isMesh||!groundMesh?.isMesh)throw Error('Upstream map requires Buildings and Terrain meshes');
 scene.add(root);root.updateMatrixWorld(true);
 const fingerprint=array=>{const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);return hash>>>0;};
 const nativeMeshes=[building,groundMesh].map(m=>({name:m.name,count:m.geometry.attributes.position.count,positions:fingerprint(m.geometry.attributes.position.array),indices:fingerprint(m.geometry.index.array)}));
 const [minE,minN,maxE,maxN]=area.boundsLV95,[e,n]=area.originLV95;
 const playable={minX:minE-e+2,maxX:maxE-e-2,minZ:n-maxN+2,maxZ:n-minN-2};data.origin=area.originLV95;data.playableBounds=playable;
 building.geometry.boundsTree=new MeshBVH(building.geometry,{indirect:true});groundMesh.geometry.boundsTree=new MeshBVH(groundMesh.geometry,{indirect:true});
 const collider=new THREE.Mesh(building.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),terrainQuery=new THREE.Mesh(groundMesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);ray.firstHitOnly=true;
 function rawGround(x,z){const px=THREE.MathUtils.clamp(x,playable.minX,playable.maxX),pz=THREE.MathUtils.clamp(z,playable.minZ,playable.maxZ);ray.set(new THREE.Vector3(px,500,pz),down);return ray.intersectObject(terrainQuery,false)[0]?.point.y??0;}
 const binary=atob(physics.ground),samples=new Uint16Array(binary.length/2);for(let i=0;i<samples.length;i++)samples[i]=binary.charCodeAt(i*2)|(binary.charCodeAt(i*2+1)<<8);
 function nativeGround(x,z){const gx=(x-physics.minX)/physics.step,gz=(z-physics.minZ)/physics.step;if(gx<0||gz<0||gx>physics.width-1||gz>physics.depth-1)return rawGround(x,z);const i=Math.min(physics.width-2,Math.floor(gx)),j=Math.min(physics.depth-2,Math.floor(gz)),u=gx-i,v=gz-j,a=samples[j*physics.width+i],b=samples[j*physics.width+i+1],c=samples[(j+1)*physics.width+i],d=samples[(j+1)*physics.width+i+1];if([a,b,c,d].includes(65535))return rawGround(x,z);return ((a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v)/100;}
 const roofBinary=atob(physics.roof),roof=new Uint16Array(roofBinary.length/2);for(let i=0;i<roof.length;i++)roof[i]=roofBinary.charCodeAt(i*2)|(roofBinary.charCodeAt(i*2+1)<<8);
 const stationPassages=[];
 function passageAt(x,z){let weight=0,floor=0,clearance=0;for(const s of stationPassages){const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,length=Math.hypot(dx,dz),along=((x-s.a.x)*dx+(z-s.a.z)*dz)/length,across=Math.abs((-(x-s.a.x)*dz+(z-s.a.z)*dx)/length);if(along<-.2||along>length+.2||across>s.width+.001)continue;const w=Math.max(.0001,1-THREE.MathUtils.smoothstep(across,s.width*.25,s.width));floor+=THREE.MathUtils.lerp(s.a.y,s.b.y,THREE.MathUtils.clamp(along/length,0,1))*w;weight+=w;clearance=Math.max(clearance,s.clearance??3.3);}return weight?{floor:floor/weight,clearance}:null;}
 function ground(x,z){return passageAt(x,z)?.floor??nativeGround(x,z);}
 function bodyBlocked(x,y,z,radius=.42,bodyHeight=1.8){const passage=passageAt(x,z);if(passage&&y>=passage.floor-.4&&y+bodyHeight<=passage.floor+passage.clearance&&[[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]].every(([dx,dz])=>passageAt(x+dx,z+dz)))return false;const minX=Math.max(0,Math.round((x-radius-physics.minX)/physics.step)),maxX=Math.min(physics.width-1,Math.round((x+radius-physics.minX)/physics.step)),minZ=Math.max(0,Math.round((z-radius-physics.minZ)/physics.step)),maxZ=Math.min(physics.depth-1,Math.round((z+radius-physics.minZ)/physics.step));for(let j=minZ;j<=maxZ;j++)for(let i=minX;i<=maxX;i++){const k=j*physics.width+i,g=samples[k],r=roof[k];if(r!==65535&&g!==65535&&r>g+150&&y<r/100-.12&&y+bodyHeight>g/100)return true;}return false;}
 collider.userData.nativePhysics={bodyBlocked};
 const waterPolygons=data.water.filter(Array.isArray).map(ring=>({ring,minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),minZ:Math.min(...ring.map(p=>p[1])),maxZ:Math.max(...ring.map(p=>p[1]))}));
 function river(x,z){return waterPolygons.some(w=>x>=w.minX&&x<=w.maxX&&z>=w.minZ&&z<=w.maxZ&&pointInPolygon(x,z,w.ring));}
 // Real deck surfaces are read directly from the original Buildings mesh.
 const bridgeSegments=data.streets.filter(s=>s.name?.includes('brücke')).flatMap(s=>s.points.slice(1).map((b,i)=>({a:s.points[i],b,width:s.width/2+6})));
 function deckAt(x,z){
  const base=ground(x,z),nearBridge=bridgeSegments.some(s=>nearSegment(x,z,s.a,s.b).distance<s.width);
  // The coarse ground grid blends riverbed into the bank beside deck edges.
  // Query the nearby actual deck within one capsule width to close that seam.
  for(const [dx,dz] of nearBridge?[[0,0],[-.6,0],[.6,0],[0,-.6],[0,.6]]:[[0,0]]){
   ray.set(new THREE.Vector3(x+dx,150,z+dz),down);const hit=ray.intersectObject(collider,false)[0];
   if(hit&&hit.point.y>=base-.02&&hit.point.y<=base+7&&Math.abs(hit.face.normal.y)>.65)return {height:hit.point.y,native:true};
  }
  return null;
 }
 const bridgeAt=(x,z)=>river(x,z)?(deckAt(x,z)??(ground(x,z)>6.8?{height:ground(x,z),native:true}:null)):null;
 const floorRay=new THREE.Raycaster();
 const height=(x,z)=>{const passage=passageAt(x,z);if(passage)return passage.floor;const base=deckAt(x,z)?.height??ground(x,z);floorRay.set(new THREE.Vector3(x,base+.7,z),down);floorRay.far=.8;const hit=floorRay.intersectObject(collider,false).find(h=>h.point.y>=base-.01&&Math.abs(h.face.normal.y)>.65);return Math.max(base,hit?.point.y??base);};
 const onNativeRoute=(x,z)=>physics.route.slice(1).some((b,i)=>nearSegment(x,z,[physics.route[i].x,physics.route[i].z],[b.x,b.z]).distance<3);
 const isWater=(x,z)=>river(x,z)&&!bridgeAt(x,z)&&!onNativeRoute(x,z);
 const blocked=(x,z)=>x<playable.minX||x>playable.maxX||z<playable.minZ||z>playable.maxZ||isWater(x,z);
 function addStationPassages(segments){stationPassages.push(...segments);const original=building.geometry,{geometry,removed}=carvePassages(original,segments);geometry.boundsTree=new MeshBVH(geometry,{indirect:true});building.geometry=geometry;collider.geometry=geometry;original.dispose();const terrain=groundMesh.geometry,carvedTerrain=carvePassages(terrain,segments).geometry;carvedTerrain.boundsTree=new MeshBVH(carvedTerrain,{indirect:true});groundMesh.geometry=carvedTerrain;terrainQuery.geometry=carvedTerrain;terrain.dispose();const floors=new THREE.Group();floors.name='Polybahn station passage floors';const material=new THREE.MeshStandardMaterial({color:'#8d9390',roughness:.95,side:THREE.DoubleSide});for(const s of segments){const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,len=Math.hypot(dx,dz),ox=-dz/len*s.width,oz=dx/len*s.width,vertices=[],steps=Math.ceil(len),lanes=Math.ceil(s.width*2);const vertex=(u,v)=>{const x=s.a.x+dx*u+ox*v,z=s.a.z+dz*u+oz*v;return [x,ground(x,z)+.015,z];};for(let i=0;i<steps;i++)for(let j=0;j<lanes;j++){const a=vertex(i/steps,j/lanes*2-1),b=vertex(i/steps,(j+1)/lanes*2-1),c=vertex((i+1)/steps,j/lanes*2-1),d=vertex((i+1)/steps,(j+1)/lanes*2-1);vertices.push(...a,...c,...b,...b,...c,...d);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();floors.add(new THREE.Mesh(g,material));}scene.add(floors);return removed;}
 return {placements,nativeMeshes,stationPassages,bodyBlocked,root,mapSource,data,groundMesh,buildings:[building],collider,deckMesh:collider,ground,rawGround,physics,height,blocked,isWater,bridgeAt,addStationPassages};
}
export function capsuleSolver(collider){
 if(collider.userData.nativePhysics){const {bodyBlocked}=collider.userData.nativePhysics;return {radius:.42,penetration:position=>bodyBlocked(position.x,position.y,position.z)? .42:0,solve(position){const before=position.clone();if(!bodyBlocked(position.x,position.y,position.z))return new THREE.Vector3();for(let distance=.05;distance<=2.5;distance+=.05)for(let i=0;i<16;i++){const a=i*Math.PI/8,x=before.x+Math.cos(a)*distance,z=before.z+Math.sin(a)*distance;if(!bodyBlocked(x,position.y,z)){position.x=x;position.z=z;return position.clone().sub(before);}}return new THREE.Vector3();}};}
const radius=.42,axis=new THREE.Line3(),bounds=new THREE.Box3(),p=new THREE.Vector3(),q=new THREE.Vector3(),normal=new THREE.Vector3();
 function solve(position){const original=position.clone();axis.start.set(position.x,position.y+radius,position.z);axis.end.set(position.x,position.y+1.8-radius,position.z);for(let pass=0;pass<4;pass++){bounds.makeEmpty().expandByPoint(axis.start).expandByPoint(axis.end).expandByScalar(radius);let contact=false;collider.geometry.boundsTree.shapecast({intersectsBounds:box=>box.intersectsBox(bounds),intersectsTriangle:tri=>{const distance=tri.closestPointToSegment(axis,p,q);if(distance<radius-1e-5){normal.subVectors(q,p);if(normal.lengthSq()<1e-12)tri.getNormal(normal);else normal.normalize();const depth=radius-distance+.0001;axis.start.addScaledVector(normal,depth);axis.end.addScaledVector(normal,depth);contact=true;}return false;}});if(!contact)break;}position.set(axis.start.x,axis.start.y-radius,axis.start.z);return position.clone().sub(original);}
 function penetration(position){axis.start.set(position.x,position.y+radius,position.z);axis.end.set(position.x,position.y+1.8-radius,position.z);bounds.makeEmpty().expandByPoint(axis.start).expandByPoint(axis.end).expandByScalar(radius);let depth=0;collider.geometry.boundsTree.shapecast({intersectsBounds:box=>box.intersectsBox(bounds),intersectsTriangle:tri=>{depth=Math.max(depth,radius-tri.closestPointToSegment(axis,p,q));return false;}});return depth;}
 return {solve,penetration,radius};
}
