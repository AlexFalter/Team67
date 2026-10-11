import {inventorySlot,setInventoryItem,showInventory} from '../inventory/item-inventory.js';
import * as THREE from 'three';
import {makeFirstPersonHand} from '../../player/first-person-hand.js';
import {createKnifeMotion} from './knife-motion.js';

// Original game model: curved blade, finger ring and a marbled Doppler finish.
export async function createKarambit(camera,{onStrike=()=>false}={}){
 const root=new THREE.Group();root.name='Karambit Doppler first-person viewmodel';camera.add(root);root.visible=false;root.scale.setScalar(.82);
 const wrist=new THREE.Group();root.add(wrist);
 const grip=new THREE.Group();grip.name='Index finger spin pivot';grip.scale.setScalar(.65);grip.position.set(.035,-.045,.02);wrist.add(grip);
 const env=new THREE.CubeTexture(Array.from({length:6},(_,i)=>{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,64,64);g.addColorStop(0,i===3?'#303447':'#f5f7ff');g.addColorStop(.45,'#91b5ea');g.addColorStop(.5,'#fff');g.addColorStop(1,'#263a64');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return c;}));env.needsUpdate=true;env.colorSpace=THREE.SRGBColorSpace;
 const bladeMat=new THREE.MeshPhysicalMaterial({color:'#be4bdf',metalness:.85,roughness:.18,clearcoat:1,clearcoatRoughness:.12,envMap:env,envMapIntensity:1.6});
 bladeMat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 dopplerPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\ndopplerPosition=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 dopplerPosition;').replace('#include <color_fragment>',`#include <color_fragment>
 float marble=sin(dopplerPosition.x*47.0+sin(dopplerPosition.y*31.0)*2.8+sin(dopplerPosition.x*93.0+dopplerPosition.y*55.0)*.6);
 vec3 finish=mix(vec3(.025,.014,.12),vec3(.75,.035,.38),smoothstep(-.8,.8,marble));
 finish=mix(finish,vec3(.21,.035,.62),.25+.2*sin(dopplerPosition.y*26.0));diffuseColor.rgb=finish;`);};
 const metal=new THREE.MeshStandardMaterial({color:'#b6bdd0',metalness:.9,roughness:.24,envMap:env});
 const black=new THREE.MeshStandardMaterial({color:'#15191f',roughness:.68,metalness:.15});
 const seam=new THREE.MeshStandardMaterial({color:'#596354',roughness:.95});
 function shapeMesh(shape,material,depth=.016){const m=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.003,bevelSize:.004,bevelSegments:2,steps:1,curveSegments:32}),material);m.position.z=-depth/2;return m;}
 const handle=new THREE.Shape();handle.moveTo(-.032,-.025);handle.bezierCurveTo(-.09,-.08,-.065,-.16,-.045,-.22);handle.lineTo(.019,-.22);handle.bezierCurveTo(-.008,-.16,.022,-.095,.024,-.034);handle.closePath();grip.add(shapeMesh(handle,black,.026));
 const blade=new THREE.Shape();blade.moveTo(-.045,-.21);blade.bezierCurveTo(-.13,-.235,-.155,-.38,-.01,-.46);blade.bezierCurveTo(.055,-.495,.13,-.45,.15,-.40);blade.bezierCurveTo(.058,-.442,-.035,-.365,-.012,-.28);blade.lineTo(.019,-.21);blade.closePath();grip.add(shapeMesh(blade,bladeMat,.012));
 const edge=new THREE.CatmullRomCurve3([new THREE.Vector3(-.012,-.28,.01),new THREE.Vector3(.00,-.35,.01),new THREE.Vector3(.063,-.411,.01),new THREE.Vector3(.15,-.40,.01)]);grip.add(new THREE.Mesh(new THREE.TubeGeometry(edge,32,.0015,5,false),metal));
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.047,.011,12,40),metal);grip.add(ring);
 for(let i=0;i<6;i++){const rib=new THREE.Mesh(new THREE.BoxGeometry(.048,.008,.033),seam);rib.position.set(-.025,-.06-i*.023,.001);rib.rotation.z=.12;grip.add(rib);}
 for(const y of [-.06,-.19]){const pin=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.038,10),metal);pin.rotation.x=Math.PI/2;pin.position.set(-.025,y,0);grip.add(pin);}
 const hand=await makeFirstPersonHand();hand.name='Blender student hand';wrist.add(hand);
 const motion=createKnifeMotion();let motionState={};
 root.traverse(o=>{if(o.isMesh){o.layers.set(1);o.material.depthTest=true;o.material.depthWrite=true;o.renderOrder=2200;o.frustumCulled=false;}});
 const hint=document.createElement('aside');hint.id='karambit-hint';hint.hidden=true;document.body.append(hint);
 const inventory=document.createElement('aside');inventory.id='knife-inventory';inventory.hidden=true;inventory.innerHTML='<small>KARAMBIT DOPPLER</small><button type="button">3 · EQUIP / HOLSTER</button>';inventorySlot('spare').append(inventory);inventory.querySelector('button').onclick=()=>toggle();
 let owned=false,equipped=false,age=0,bobAge=0,phase='idle',spins=0,swings=0,hits=0,strikePending=false;
 function inspect(){if(!owned||!equipped||phase!=='idle')return false;phase='inspect';age=0;spins++;return true;}
 function attack(){if(!owned||!equipped||phase!=='idle')return false;phase='attack';age=0;swings++;strikePending=true;return true;}
 function give(){if(owned)return false;owned=equipped=true;setInventoryItem('spare',true);inspect();return true;}
 function toggle(){if(!owned)return false;equipped=!equipped;phase='idle';age=0;return true;}
 function update(dt,visible,moving=false,sliding=false,movement={}){inventory.hidden=!owned||!visible;if(owned&&visible)showInventory(true);root.visible=owned&&equipped&&visible;hint.hidden=!owned||!visible;hint.textContent=equipped?'KARAMBIT · CLICK / Q: HIT · F: SPIN · C: SLIDE · 3: HOLSTER':'3: EQUIP KARAMBIT';if(!root.visible){if(phase==='attack'){phase='idle';strikePending=false;age=0;}return;}
  motionState=motion.update(dt,{speed:moving?6:0,...movement,sliding});
  age+=dt;bobAge+=dt;root.position.set(.27,-.075,-.85);root.rotation.set(-.12,-.55,.3);grip.rotation.set(0,0,-.22);
  if(phase==='inspect'){
   const wind=THREE.MathUtils.smoothstep(age,0,.23),returning=1-THREE.MathUtils.smoothstep(age,1.7,2.15),raise=wind*returning;
   root.position.x-=raise*.15;root.position.y+=raise*.13;root.position.z-=raise*.06;
   const spin=THREE.MathUtils.smoothstep(age,.23,.88);grip.rotation.z=-.22+spin*Math.PI*4;
   root.rotation.y+=Math.sin(Math.PI*THREE.MathUtils.smoothstep(age,.9,1.65))*.65*returning;

   if(age>=2.15){phase='idle';age=0;}
  }
  if(phase==='attack'){
   const forward=THREE.MathUtils.smoothstep(age,0,.17),back=1-THREE.MathUtils.smoothstep(age,.22,.55),swing=forward*back;
   root.position.z-=swing*.32;root.position.x-=swing*.2;root.position.y+=swing*.08;root.rotation.y+=swing*.85;root.rotation.z-=swing*.75;
   if(strikePending&&age>=.17){strikePending=false;if(onStrike())hits++;}
   if(age>=.55){phase='idle';age=0;}
  }
  const m=motionState;root.position.x+=m.x;root.position.y+=m.y+Math.sin(bobAge*2)*.002;root.position.z+=m.z;root.rotation.x+=m.pitch;root.rotation.y+=m.yaw;root.rotation.z+=m.roll;
 }
 return {root,grip,give,inspect,attack,toggle,update,holster(){equipped=false;phase='idle';strikePending=false;},owns:()=>owned,occupiesHands:()=>owned&&equipped,reset(){inventory.hidden=true;setInventoryItem('spare',false);owned=equipped=false;phase='idle';age=spins=swings=hits=0;strikePending=false;motion.reset();motionState={};root.visible=false;hint.hidden=true;},state:()=>({owned,equipped,phase,age,spins,swings,hits,visible:root.visible,spinRadians:grip.rotation.z,motion:motionState})};
}
