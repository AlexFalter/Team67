import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import * as THREE from 'three';
// A physical magnetic-stripe reader and the card travelling through its groove.
export function createTicketCardReader(machine){
 const group=new THREE.Group();group.name='TicketCardReader';machine.group.add(group);
 const material=(color,metalness=.15)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.36});
 const shell=material('#26323c'),rim=material('#8496a3',.8),black=material('#070b10'),blue=material('#126bb0');
 function box(x,y,z,w,h,d,mat){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);group.add(mesh);return mesh;}
 box(0,.94,-.36,.73,.20,.13,shell);box(0,1.025,-.43,.70,.025,.055,rim);box(0,.965,-.434,.68,.014,.012,black);
 const led=box(-.30,.905,-.435,.035,.018,.012,material('#57e0aa'));
 const card=new THREE.Group();card.name='SwipeBankCard';group.add(card);
 const plastic=new THREE.Mesh(new THREE.BoxGeometry(.23,.145,.009),blue);card.add(plastic);
 const stripe=new THREE.Mesh(new THREE.BoxGeometry(.215,.026,.003),black);stripe.position.set(0,.038,-.006);card.add(stripe);
 const chip=new THREE.Mesh(new THREE.BoxGeometry(.04,.03,.004),material('#d9bb6c',.65));chip.position.set(.065,-.02,-.007);card.add(chip);
 function setProgress(value){card.position.set(.30-.60*value,.99,-.455);}
 setProgress(0);card.visible=false;
 return {dispose:()=>disposeOwnedObject(group),card,setProgress,show(visible){card.visible=visible;led.material.color.set(visible?'#57e0aa':'#76a3ac');}};
}
