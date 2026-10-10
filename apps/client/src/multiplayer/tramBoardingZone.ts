import * as THREE from 'three';
import * as C from '@race/shared';

export function createTramBoardingZone(kind:number=C.TRAM_KIND) {
 const zone=new THREE.Group();zone.name=kind===C.POLYBAHN_KIND?'Polybahn boarding circle':'Tram boarding circle';
 const radius=C.railBoardingDistance({kind});
 const rim=new THREE.Mesh(new THREE.RingGeometry(radius-.09,radius,64),new THREE.MeshBasicMaterial({color:'#73d9ff',transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide}));
 const fill=new THREE.Mesh(new THREE.CircleGeometry(radius-.09,64),new THREE.MeshBasicMaterial({color:'#73d9ff',transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));
 for(const mesh of [fill,rim]){mesh.geometry.rotateX(-Math.PI/2);mesh.renderOrder=2;zone.add(mesh);}
 return zone;
}
export function updateTramBoardingZone(zone:THREE.Group,v:C.VehicleState,origin:C.GroundPoint,body:C.Body,now:number,canPlay:boolean){
 const point=C.railBoardingPoint(v);
 const polybahn=v.kind===C.POLYBAHN_KIND;
 const ground=C.zurichWorld.height(point.x,point.z)??point.y;
 const frame=C.railFrame(v);
 zone.rotation.set(0,polybahn?frame.rotY:0,0,'YXZ');
 zone.position.set(point.x-origin.x,ground-origin.y+.08,point.z-origin.z);
 if(!polybahn&&(zone.userData.x!==point.x||zone.userData.z!==point.z)){
  for(const child of zone.children){
   const mesh=child as THREE.Mesh,position=mesh.geometry.attributes.position;
   for(let i=0;i<position.count;i++)position.setY(i,(C.zurichWorld.height(point.x+position.getX(i),point.z+position.getZ(i))??ground)-ground);
   position.needsUpdate=true;mesh.geometry.computeBoundingSphere();
  }
  zone.userData.x=point.x;zone.userData.z=point.z;
 }
 zone.visible=canPlay&&!v.traveling&&(!v.departureAt||now<v.departureAt)&&!body.vehicleId;
 const inside=Math.hypot(body.x-point.x,body.z-point.z)<=C.railBoardingDistance(v)&&Math.abs(body.y-point.y)<=C.VEHICLE_BOARD_HEIGHT;
 for(const child of zone.children)(child as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>).material.color.set(inside?'#83f3a6':'#73d9ff');
 return inside;
}
