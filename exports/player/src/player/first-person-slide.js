import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export function createFirstPersonSlide(camera){
 const root=new THREE.Group();root.name='First-person sliding legs';root.visible=false;camera.add(root);
 const pants=new THREE.MeshStandardMaterial({color:'#284b60',roughness:.9});
 const shoes=new THREE.MeshStandardMaterial({color:'#f0eee5',roughness:.84});
 const sole=new THREE.MeshStandardMaterial({color:'#52666d',roughness:.9});
 const legs=[-1,1].map(side=>{
  const leg=new THREE.Group();leg.position.x=side*.17;root.add(leg);
  function box(name,w,h,d,y,z,mat){const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,.025),mat);m.name=name;m.position.set(0,y,z);m.layers.set(1);m.renderOrder=2200;m.frustumCulled=false;leg.add(m);return m;}
  const thigh=box('Navy trouser thigh',.22,.21,.54,-.67,-.34,pants);thigh.rotation.x=-.38;
  box('Bent knee',.21,.20,.21,-.54,-.60,pants);
  const shin=box('Extended trouser leg',.19,.17,.48,-.52,-.83,pants);shin.rotation.x=.10;
  box('Cream sneaker',.22,.18,.33,-.54,-1.14,shoes);
  box('Sneaker sole',.23,.045,.35,-.635,-1.14,sole);
  box('Sneaker toe',.22,.10,.14,-.56,-1.28,shoes);
  return leg;
 });
 let weight=0,heading=0,wasActive=false;
 const inverseView=new THREE.Quaternion(),bodyRotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3();
 return {
  update(dt,{visible,active,heading:slideHeading}){
   if(slideHeading!==undefined)heading=slideHeading;
   else if(active&&!wasActive){camera.getWorldDirection(forward);heading=Math.atan2(-forward.x,-forward.z);}
   wasActive=active;
   weight=THREE.MathUtils.damp(weight,visible&&active?1:0,active?16:12,dt);
   root.visible=visible&&weight>.015;
   // Cancel the camera rotation: feet retain the slide heading while the view turns.
   camera.getWorldQuaternion(inverseView).invert();bodyRotation.setFromAxisAngle(up,heading);
   root.quaternion.copy(inverseView).multiply(bodyRotation);
   root.position.set(0,.26*weight-(1-weight)*.8,0).applyQuaternion(inverseView);
   legs.forEach((leg,i)=>{leg.rotation.x=-(1-weight)*.45;leg.rotation.y=(i===0?1:-1)*.08*weight;leg.position.y=0;});
  },
  reset(){weight=heading=0;wasActive=false;root.visible=false;},
  state:()=>({visible:root.visible,weight,heading}),root
 };
}
