import * as THREE from 'three';

// Camera-local arms share the student's hoodie palette. World movement still
// uses the existing capsule; changing perspective never changes physics.
export async function createFirstPerson(camera) {
 const root=new THREE.Group();root.visible=false;camera.add(root);
 const skin=new THREE.MeshStandardMaterial({color:'#bd8869',roughness:.82,flatShading:true});
 const cream=new THREE.MeshStandardMaterial({color:'#f4e7cc',roughness:.9,flatShading:true});
 const cuff=new THREE.MeshStandardMaterial({color:'#d9cfbb',roughness:.9,flatShading:true});
 const arms=[-1,1].map(side=>{
  const pivot=new THREE.Group();pivot.name=side<0?'Blocky left hand':'Blocky right hand';pivot.position.set(side*.25,-.22,-.48);root.add(pivot);
  const box=(name,w,h,d,x,y,z,material)=>{
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.name=name;mesh.position.set(x,y,z);mesh.layers.set(1);mesh.renderOrder=2200;mesh.frustumCulled=false;pivot.add(mesh);return mesh;
  };
  // Simple fists match the student's blocky body; the knife owns its detailed hand.
  box('Blocky fist',.12,.13,.17,0,-.045,-.09,skin);
  box('Blocky thumb',.035,.075,.09,-side*.065,-.035,-.1,skin);
  box('Cream cuff',.135,.145,.055,0,-.05,.017,cuff);
  const sleeve=box('Cream sleeve',.145,.16,.50,side*.018,-.11,.275,cream);sleeve.rotation.x=.20;
  return pivot;
 });
 let phase=0,weight=0;
 return {
  update(dt,{visible,speed,grounded}) {
   root.visible=visible;
   weight=THREE.MathUtils.damp(weight,visible&&grounded?Math.min(Math.abs(speed)/6,1.5):0,12,dt);
   if(visible)phase+=dt*(Math.abs(speed)>8?12:8);
   arms.forEach((arm,i)=>{const swing=Math.sin(phase+i*Math.PI)*weight;arm.rotation.set(swing*.12,0,-(i===0?-1:1)*.12);arm.position.y=-.22+swing*.025;arm.position.z=-.48+swing*.035;});
  },
  state:()=>({visible:root.visible,style:"blocky",phase,weight,arms:arms.map(a=>({y:a.position.y,z:a.position.z,swing:a.rotation.x}))})
 };
}
