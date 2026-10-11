import * as THREE from 'three';
import {DRONE_CALL_MS} from '@race/shared';

interface UavPlayer {x:number;y:number;z:number;droneCallUntil?:number;droneScanUntil?:number}
function createAircraft(){
 const root=new THREE.Group();root.name='uav-aircraft';
 const body=new THREE.MeshStandardMaterial({color:0xaab5be,roughness:.65});
 const dark=new THREE.MeshStandardMaterial({color:0x26333f,roughness:.5});
 const part=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
 // Long nose, broad wings and a raised tail make the silhouette readable from below.
 part(new THREE.CapsuleGeometry(.38,4.5,4,8),body,0,0,0).rotation.x=Math.PI/2;
 part(new THREE.BoxGeometry(8,.13,1.1),body,0,0,.3);
 part(new THREE.BoxGeometry(2.8,.12,.7),body,0,.45,2.2);
 part(new THREE.BoxGeometry(.12,1.2,.9),body,0,.65,2.15);
 part(new THREE.SphereGeometry(.28,8,6),dark,0,-.4,-1.5);
 part(new THREE.BoxGeometry(1.6,.12,.16),dark,0,0,2.9);
 return root;
}
export class UavAircraft {
 private aircraft=new Map<string,{root:THREE.Group;center:THREE.Vector3;endsAt:number}>();
 private round=0;
 constructor(private scene:THREE.Scene){}
 update(players:Iterable<[string,UavPlayer]>,now:number,round:number,playing:boolean){
  if(round!==this.round){this.clear();this.round=round;}
  const active=new Set<string>();
  if(playing)for(const [id,p] of players){
   if(!p.droneScanUntil||!p.droneCallUntil||p.droneScanUntil<=now||p.droneCallUntil<=0)continue;
   const callUntil=p.droneCallUntil,scanUntil=p.droneScanUntil;
   active.add(id);let flight=this.aircraft.get(id);
   if(flight&&flight.endsAt!==scanUntil){this.remove(id);flight=undefined;}
   if(!flight){flight={root:createAircraft(),center:new THREE.Vector3(p.x,p.y+55,p.z),endsAt:scanUntil};this.aircraft.set(id,flight);this.scene.add(flight.root);}
   const age=(now-(callUntil-DRONE_CALL_MS))/1000;
   const remaining=(scanUntil-now)/1000;
   const angle=age*.26;const radius=35+Math.max(0,2.4-age)*35+Math.max(0,3-remaining)*25;
   flight.root.position.set(flight.center.x+Math.cos(angle)*radius,flight.center.y+Math.max(0,3-remaining)*8,flight.center.z+Math.sin(angle)*radius);
   // Local nose points along -Z, tangent to the flight path.
   flight.root.rotation.set(0,Math.PI-angle, -.12);
  }
  for(const id of this.aircraft.keys())if(!active.has(id))this.remove(id);
 }
 private remove(id:string){const flight=this.aircraft.get(id);if(!flight)return;const materials=new Set<THREE.Material>();flight.root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])materials.add(material);}});for(const material of materials)material.dispose();flight.root.removeFromParent();this.aircraft.delete(id);}
 private clear(){for(const id of this.aircraft.keys())this.remove(id);}
 dispose(){this.clear();}
}
