import * as THREE from 'three';
import {AWP_RACKS} from '@race/shared';
import {createNerfAwp} from './awpModel.ts';
export function createAwpRack(){
 const racks=new THREE.Group();racks.name='Wall-mounted Nerf AWP pickups';
 for(const placement of AWP_RACKS)racks.add(createPickup(placement));
 return racks;
}
function createPickup(placement:typeof AWP_RACKS[number]){
 const root=new THREE.Group();root.name='Wall-mounted Nerf AWP pickup';root.position.set(...placement.position as [number,number,number]);root.rotation.y=placement.heading;
 const board=new THREE.Mesh(new THREE.BoxGeometry(1.8,.95,.06),new THREE.MeshStandardMaterial({color:'#183b55',roughness:.9}));board.position.set(0,.1,.04);root.add(board);
  const blaster=createNerfAwp();blaster.name='Hanging Nerf AWP';for(const name of ['trigger-hand','bolt-hand','reload-hand','loading-hand'])blaster.getObjectByName(name)!.visible=false;blaster.rotation.y=Math.PI/2;blaster.position.set(.13,-.01,-.09);root.add(blaster);
  for(const x of [-.4,.45]){const hook=new THREE.Mesh(new THREE.BoxGeometry(.045,.15,.15),new THREE.MeshStandardMaterial({color:'#ff8422'}));hook.position.set(x,-.13,-.055);root.add(hook);}
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#183b55';ctx.fillRect(0,0,512,64);ctx.fillStyle='#fff';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillText('NERF AWP · E TO PICK UP',256,44);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const label=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.2),new THREE.MeshBasicMaterial({map:texture}));label.position.set(0,.38,-.001);label.rotation.y=Math.PI;root.add(label);
 return root;
}
