import * as THREE from 'three';
import {hollowGeometry} from '../shuttle/eth-link-cabin.js';

export function addTramCabin(car){
 car.updateMatrixWorld(true);const inverse=car.matrixWorld.clone().invert(),parts=[];
 const volumes=[{min:[-1.06,.62,-3.10],max:[1.06,2.83,3.10]}];
 for(const side of [-1,1])for(const z of [-2.42,-1.32,.96,2.18])volumes.push({min:[side<0?-1.18:1.04,1.86,z-.41],max:[side<0?-1.04:1.18,2.54,z+.41]});
 for(const side of [-1,1])volumes.push({min:[side<0?-1.21:1.04,1.58,-.55],max:[side<0?-1.04:1.21,2.49,.39]});
 for(const z of [-1,1])volumes.push({min:[-.95,1.62,z<0?-3.25:3.09],max:[.95,2.59,z<0?-3.09:3.25]});
 car.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));const materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const copy=m.clone();copy.side=THREE.DoubleSide;if(/glazing/i.test(copy.name)){copy.transparent=true;copy.opacity=.22;copy.depthWrite=false;copy.metalness=0;}return copy;});const mesh=new THREE.Mesh(hollowGeometry(geometry,volumes),materials);mesh.castShadow=true;parts.push(mesh);geometry.dispose();});car.clear();car.add(...parts);
 const cabin=new THREE.Group();cabin.name='Tram passenger cabin';car.add(cabin);
 const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.7,side:THREE.DoubleSide}),floor=mat('#424c57'),lining=mat('#e0e4e7'),seat=mat('#2256a1'),metal=mat('#bac1c7');
 function box(x,y,z,w,h,d,m){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);cabin.add(mesh);return mesh;}
 box(0,.64,0,2.12,.08,6.2,floor);box(0,2.82,0,2.12,.035,6.2,lining);
 for(const side of [-1,1]){box(side*1.055,1.13,0,.035,.90,6.1,lining);for(const z of [-2.5,-1.3,1.4,2.5]){box(side*.76,.98,z,.52,.17,.60,seat);box(side*.76,1.29,z+.25,.52,.60,.09,seat);box(side*.76,.79,z,.065,.3,.065,metal);}for(const z of [-.7,.7])box(side*.44,1.77,z,.035,2.16,.035,metal);box(side*.44,2.72,0,.035,.035,5.6,metal);}
 return {cabin,eye:new THREE.Vector3(0,2.23,.65),target:new THREE.Vector3(0,2.23,-2.4)};
}
