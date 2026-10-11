import * as THREE from 'three';
import {createStudent} from '../../player/student-model.js';

// The parked GLB has solid body sections. Carve the passenger volume and door
// from a private geometry copy, retaining the original exterior and graphics.
export function hollowGeometry(source,volumes){
 const geometry=source.index?source.toNonIndexed():source.clone(),attributes=geometry.attributes,groups=geometry.groups.length?geometry.groups:[{start:0,count:attributes.position.count,materialIndex:0}],buckets=new Map();
 const interpolate=(a,b,t)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k].map((v,i)=>v+(b[k][i]-v)*t)]));
 function split(poly,axis,limit,sign){const inside=[],outside=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.position[axis]-limit)*sign,db=(b.position[axis]-limit)*sign;(da>=0?inside:outside).push(a);if((da>=0)!==(db>=0)){const v=interpolate(a,b,da/(da-db));inside.push(v);outside.push(v);}}return {inside,outside};}
 function subtract(poly,box){const result=[];let inside=poly;for(let axis=0;axis<3&&inside.length>=3;axis++)for(const [limit,sign] of [[box.min[axis],1],[box.max[axis],-1]]){if(inside.length<3)break;const parts=split(inside,axis,limit,sign);if(parts.outside.length>=3)result.push(parts.outside);inside=parts.inside;}return result;}
 for(const group of groups){const bucket=buckets.get(group.materialIndex)??Object.fromEntries(Object.keys(attributes).map(k=>[k,[]]));buckets.set(group.materialIndex,bucket);for(let i=group.start;i<group.start+group.count;i+=3){let polygons=[Array.from({length:3},(_,j)=>Object.fromEntries(Object.entries(attributes).map(([key,a])=>[key,Array.from({length:a.itemSize},(_,k)=>a.array[(i+j)*a.itemSize+k])])) )];for(const box of volumes)polygons=polygons.flatMap(poly=>subtract(poly,box));for(const poly of polygons)for(let j=1;j<poly.length-1;j++)for(const vertex of [poly[0],poly[j],poly[j+1]])for(const key of Object.keys(attributes))bucket[key].push(...vertex[key]);}}
 const result=new THREE.BufferGeometry(),joined=Object.fromEntries(Object.keys(attributes).map(k=>[k,[]]));let start=0;for(const [materialIndex,bucket] of buckets){const count=bucket.position.length/3;result.addGroup(start,count,materialIndex);start+=count;for(const key of Object.keys(attributes))for(const value of bucket[key])joined[key].push(value);}for(const [key,values] of Object.entries(joined))result.setAttribute(key,new THREE.Float32BufferAttribute(values,attributes[key].itemSize));result.normalizeNormals();result.computeBoundingBox();geometry.dispose();return result;
}

export function addETHLinkCabin(bus){
 bus.updateMatrixWorld(true);const inverse=bus.matrixWorld.clone().invert(),parts=[];
 bus.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));const materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const copy=m.clone();copy.side=THREE.DoubleSide;if(copy.name.includes('Tinted glazing')){copy.transparent=true;copy.opacity=.25;copy.depthWrite=false;copy.metalness=0;}return copy;});parts.push(new THREE.Mesh(hollowGeometry(geometry,[{min:[-1.17,.74,-8.3],max:[1.17,2.79,8.3]},{min:[1.1,.74,-3.18],max:[1.7,2.78,-2.02]}]),materials));geometry.dispose();});
 bus.clear();for(const p of parts){p.name='ETH Link exterior with hollow cabin';p.castShadow=true;bus.add(p);}
 const interior=new THREE.Group();interior.name='ETH Link passenger cabin';bus.add(interior);
 const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.7,side:THREE.DoubleSide}),floor=mat('#414b50'),seat=mat('#254858'),lining=mat('#e3e8e9'),metal=mat('#a0aeb4'),glass=new THREE.MeshStandardMaterial({color:'#557b89',transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false});
 function box(parent,x,y,z,w,h,d,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m;}
 box(interior,0,.74,0,2.34,.08,17.1,floor);
 const seatBounds=[];
 for(const side of [-1,1])for(const z of [-5.7,-4.45,-.85,.4,3.9,5.2,6.5,7.8]){const x=side*.82;box(interior,x,1.12,z,.61,.17,.66,seat);box(interior,x,1.45,z+.3,.61,.65,.1,seat);box(interior,x,.93,z,.08,.28,.08,metal);seatBounds.push({x,z,halfX:.305,halfZ:.38});}
 for(const side of [-1,1])for(const [z,length] of side===1?[[-5.74,5.08],[3.13,10.3]]:[[0,17.1]])box(interior,side*1.19,1.11,z,.055,.65,length,lining);
 for(const z of [-5.7,-.85,3.9,6.5]){box(interior,.46,1.79,z,.035,1.94,.035,metal);box(interior,-.46,1.79,z,.035,1.94,.035,metal);}
 box(interior,0,2.79,0,2.34,.03,17.1,lining);
 const doors=[];
 for(const side of [-1,1]){const leaf=new THREE.Group();leaf.position.set(1.325,0,-2.6+side*.28);leaf.userData.closedZ=leaf.position.z;leaf.userData.side=side;bus.add(leaf);box(leaf,0,1.76,0,.035,1.94,.56,glass);for(const z of [-.28,.28])box(leaf,0,1.76,z,.05,1.98,.025,metal);box(leaf,0,.86,0,.05,.16,.56,lining);doors.push(leaf);}
 box(bus,1.46,.46,-2.6,.3,.11,1.12,metal);
 const driver=createStudent();driver.player.name='ETH Link driver';driver.player.position.set(-.72,.47,-7.75);driver.player.scale.setScalar(.88);driver.limbs[1].rotation.x=driver.limbs[3].rotation.x=1.4;driver.knees.forEach(k=>k.rotation.x=-1.4);driver.limbs[0].rotation.x=driver.limbs[2].rotation.x=1.05;interior.add(driver.player);
 box(interior,-.72,1.1,-7.75,.62,.15,.65,seat);box(interior,0,1.2,-8.2,2.2,.3,.35,floor);
 const steering=new THREE.Mesh(new THREE.TorusGeometry(.18,.025,8,18),metal);steering.position.set(-.72,1.44,-8.02);steering.rotation.x=.6;interior.add(steering);
 const surfaceRay=new THREE.Raycaster();
 return {interior,surfaceDistance(point,direction){bus.updateMatrixWorld(true);surfaceRay.set(bus.localToWorld(new THREE.Vector3(...point)),new THREE.Vector3(...direction).applyQuaternion(bus.quaternion).normalize());surfaceRay.far=30;return surfaceRay.intersectObject(bus,true)[0]?.distance??null;},floorHeight:.78,eye:new THREE.Vector3(.12,2.32,-3.6),doorLocal:new THREE.Vector3(1.35,.78,-2.6),setDoor(amount){doors.forEach(d=>d.position.z=d.userData.closedZ+d.userData.side*amount*.61);},blocked(p,radius=.2){return p.x-radius< -1.17||p.x+radius>1.17||p.z-radius< -8.3||p.z+radius>8.3||seatBounds.some(s=>Math.abs(p.x-s.x)<s.halfX+radius&&Math.abs(p.z-s.z)<s.halfZ+radius);}};
}
