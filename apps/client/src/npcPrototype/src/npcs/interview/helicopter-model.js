import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createInterviewHelicopter(){
 const root=new THREE.Group();root.name='Jane Street interview helicopter';
 const materials=new Map();
 const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,metalness:.55,roughness:.35}));return materials.get(color);};
 function box(parent,x,y,z,w,h,d,color){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.1,h*.2)),material(color));mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 function strut(a,b,r=.04,color='#d5c6a1',parent=root){const delta=new THREE.Vector3().subVectors(b,a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),material(color));mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());parent.add(mesh);return mesh;}
 box(root,0,.65,.05,2.35,.35,4.8,'#101824');box(root,0,2.65,.05,2.4,.2,4.5,'#101824');
 box(root,0,1.05,1.75,2.25,.5,.4,'#101824');box(root,0,1,-1.95,2.2,.45,1.05,'#101824');
 for(const side of [-1,1]){
  // The boarding side has a real opening; its rear panel belongs to the door.
  box(root,side*1.12,1.12,side===1?-.95:.15,.08,.6,side===1?.9:3.1,'#101824');
  if(side===1){box(root,1.15,1.38,-1.1,.025,.05,1.2,'#d7b566');box(root,1.15,1.38,1.9,.025,.05,.4,'#d7b566');}
  else box(root,side*1.15,1.38,.2,.025,.05,3.8,'#d7b566');
  for(const z of [-1.6,-.5,1.7])box(root,side*1.13,1.98,z,.08,1.25,.08,'#101824');
  for(const z of [-1.4,1.35])strut(new THREE.Vector3(side*.9,.65,z),new THREE.Vector3(side*1.45,.12,z),.06);
  strut(new THREE.Vector3(side*1.45,.12,-2.1),new THREE.Vector3(side*1.45,.12,2.1),.075);
 }
 const glass=new THREE.MeshStandardMaterial({color:'#76afbf',transparent:true,opacity:.2,roughness:.12,side:THREE.DoubleSide,depthWrite:false});
 const windshield=new THREE.Mesh(new THREE.PlaneGeometry(2.12,1.25),glass);windshield.position.set(0,1.99,-2.32);windshield.rotation.x=-.18;root.add(windshield);
 for(const side of [-1,1]){const window=new THREE.Mesh(new THREE.PlaneGeometry(1.4,1.13),glass);window.position.set(side*1.14,2,-.9);window.rotation.y=Math.PI/2;root.add(window);}
 for(const x of [-.58,.58])for(const z of [-1.05,1.12]){box(root,x,.96,z,.65,.15,.65,'#26333f');box(root,x,1.35,z+.3,.65,.72,.12,'#26333f');}
 strut(new THREE.Vector3(0,1.65,1.9),new THREE.Vector3(0,2.1,6.1),.22,'#101824');box(root,0,2.65,5.9,.13,1.5,.85,'#101824');box(root,0,2.12,5.2,2.2,.1,.55,'#d7b566');
 box(root,0,2.9,.2,.9,.4,1.35,'#26333f');strut(new THREE.Vector3(0,3,.2),new THREE.Vector3(0,3.65,.2),.09);
 const mainRotor=new THREE.Group();mainRotor.name='Helicopter main rotor';mainRotor.position.set(0,3.65,.2);root.add(mainRotor);
 for(const angle of [0,Math.PI/2]){const blade=box(mainRotor,0,0,0,10,.04,.18,'#202b34');blade.rotation.y=angle;}
 const tailRotor=new THREE.Group();tailRotor.name='Helicopter tail rotor';tailRotor.position.set(.28,2.55,5.95);root.add(tailRotor);
 box(tailRotor,0,0,0,.04,1.55,.12,'#202b34');box(tailRotor,0,0,0,.04,.12,1.55,'#202b34');
 const door=new THREE.Group();door.name='Helicopter cabin door';door.position.set(1.18,0,1.64);root.add(door);
 box(door,0,1.12,-1.04,.08,.6,2.08,'#101824');
 box(door,.045,1.38,-1.04,.025,.05,2.08,'#d7b566');
 for(const z of [0,-2.08])box(door,0,1.98,z,.08,1.15,.08,'#101824');
 box(door,0,2.53,-1.04,.08,.08,2.08,'#101824');
 box(door,.065,1.48,-1.82,.06,.07,.22,'#d7b566');
 const doorGlass=new THREE.Mesh(new THREE.PlaneGeometry(2,1.05),glass);doorGlass.name='Helicopter door window';doorGlass.position.set(0,1.98,-1.04);doorGlass.rotation.y=Math.PI/2;door.add(doorGlass);
 return {root,door,update:dt=>animateHelicopter(root,dt)};
}
export function animateHelicopter(root,dt){const main=root.getObjectByName('Helicopter main rotor'),tail=root.getObjectByName('Helicopter tail rotor');if(main)main.rotation.y+=dt*42;if(tail)tail.rotation.x+=dt*65;}

export function createParachute(){
 const root=new THREE.Group();root.name='Interview parachute';
 const canopy=new THREE.Mesh(new THREE.SphereGeometry(3.3,24,12,0,Math.PI*2,0,Math.PI*.48),new THREE.MeshStandardMaterial({color:'#d7b566',side:THREE.DoubleSide,roughness:.85}));canopy.scale.y=.4;canopy.position.y=4.3;root.add(canopy);
 const material=new THREE.LineBasicMaterial({color:'#f6efdb'});
 for(let i=0;i<12;i++){const a=i*Math.PI/6,geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a)*3.2,4.4,Math.sin(a)*3.2),new THREE.Vector3(Math.cos(a)*.25,1.2,Math.sin(a)*.25)]);root.add(new THREE.Line(geometry,material));}
 return root;
}
