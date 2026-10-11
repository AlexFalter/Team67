import * as THREE from 'three';

// Shared original Lime model used by both the NPC encounter and player rides.
export function createLimeModel(){
 const group=new THREE.Group();group.name='Lime scooter';
 const green=new THREE.MeshStandardMaterial({color:'#42d67e',roughness:.5}),dark=new THREE.MeshStandardMaterial({color:'#18242a',roughness:.8}),metal=new THREE.MeshStandardMaterial({color:'#9eafb1',metalness:.55,roughness:.35});
 function box(parent,x,y,z,w,h,d,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 function rod(parent,a,b,r,material){const delta=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),material);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());parent.add(mesh);return mesh;}
 box(group,0,.30,.08,.38,.10,1.75,dark);box(group,0,.36,.08,.32,.02,1.70,green);rod(group,new THREE.Vector3(0,.28,-.75),new THREE.Vector3(0,1.37,-.82),.055,green);box(group,0,1.38,-.82,.68,.06,.075,dark);
 const wheels=[];for(const z of [-.79,.89]){const wheel=new THREE.Group();wheel.position.set(0,.21,z);const tire=new THREE.Mesh(new THREE.TorusGeometry(.15,.06,8,20),dark);tire.rotation.y=Math.PI/2;wheel.add(tire);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.10,10),metal);hub.rotation.z=Math.PI/2;wheel.add(hub);group.add(wheel);wheels.push(wheel);}
 function label(text,w,h){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#42d67e';ctx.fillRect(0,0,512,128);ctx.fillStyle='#16372b';ctx.font='bold 74px Arial';ctx.textAlign='center';ctx.fillText(text,256,88);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));}
 const lime=label('Lime',.42,.11);lime.position.set(.20,.30,0);lime.rotation.y=Math.PI/2;group.add(lime);
 group.userData.wheels=wheels;return group;
}
