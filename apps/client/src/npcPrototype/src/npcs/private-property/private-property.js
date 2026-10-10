import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {gameConfig} from '../../config/game-config.js';
import {styleEncounterLine} from '../../shared/dialogue/encounter-ui.js';
import * as THREE from 'three';
import {createStudent} from '../../player/student-model.js';

// Shared by the live encounter and boundary checks; corners use the nearest edge.
export function privatePropertyBoundary(position,bounds,margin=12){
 const edges=[{edge:'west',distance:position.x-bounds.minX,inward:[1,0]},{edge:'east',distance:bounds.maxX-position.x,inward:[-1,0]},{edge:'north',distance:position.z-bounds.minZ,inward:[0,1]},{edge:'south',distance:bounds.maxZ-position.z,inward:[0,-1]}];
 const nearest=edges.reduce((a,b)=>a.distance<=b.distance?a:b);
 return nearest.distance<=margin?nearest:null;
}

export function createPrivatePropertyEncounter(scene,world,start,heading,solver,{bounds=world.data?.encounterBounds??world.data?.playableBounds,uiRoot=document.body}={}){
 if(!bounds||![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)||bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)throw new Error("Private property requires valid map bounds");
 const car=new THREE.Group();car.name='Private property pickup';scene.add(car);car.visible=false;
 const mats=new Map(),mat=c=>{if(!mats.has(c))mats.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.65}));return mats.get(c);};
 function box(x,y,z,w,h,d,color,parent=car){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 box(0,.67,0,2.18,.5,5.6,'#dce3e5');box(0,1.08,-1.85,2.18,.4,1.85,'#f2f3ef');box(0,2.18,-.5,2.2,.13,2,'#f4f4f0');
 box(0,1.54,-1.53,1.9,.87,.05,'#182f39');box(0,1.57,.51,1.9,.8,.055,'#182f39');
 for(const side of [-1,1]){
  box(side*1.06,1.06,-.5,.08,.42,1.95,'#eff1ef');box(side*1.06,1.43,1.6,.09,.65,2.05,'#e8ecea');
  for(const z of [-1.5,.5])box(side*1.06,1.76,z,.075,.78,.085,'#ededeb');
  for(const z of [-1.8,1.9]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.49,.49,.26,18),mat('#19232a'));wheel.rotation.z=Math.PI/2;wheel.position.set(side*1.05,.5,z);car.add(wheel);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,.28,12),mat('#aab3b5'));hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);car.add(hub);}
  box(side*1.22,1.44,-1.35,.25,.16,.24,'#283640');
 }
 box(0,1.08,2.66,2.1,.72,.08,'#ebedeb');box(0,.81,-2.85,2.2,.2,.12,'#8c989d');box(0,1.12,-2.81,1.1,.24,.06,'#25333a');
 for(const x of [-.84,.84]){box(x,1.13,-2.82,.39,.22,.07,'#fff3c9');box(x,1.15,2.72,.17,.37,.07,'#b4352e');}
 box(0,.82,1.6,1.95,.08,1.96,'#586a72');box(-.53,.99,-.45,.64,.78,.64,'#22363e');box(.53,.99,-.45,.64,.78,.64,'#22363e');
 // Open driver window, a bald head, white moustache and blue plaid shirt.
 const driver=createStudent();car.add(driver.player);driver.player.position.set(-.53,.36,-.53);driver.player.scale.setScalar(.9);
 const plaid=document.createElement('canvas');plaid.width=plaid.height=128;const cx=plaid.getContext('2d');cx.fillStyle='#548aac';cx.fillRect(0,0,128,128);for(let i=0;i<128;i+=32){cx.fillStyle='#254c69';cx.fillRect(i,0,9,128);cx.fillRect(0,i,128,9);cx.fillStyle='#8ab9cf';cx.fillRect(i+14,0,3,128);cx.fillRect(0,i+14,128,3);}const plaidTexture=new THREE.CanvasTexture(plaid);plaidTexture.colorSpace=THREE.SRGBColorSpace;
 driver.player.traverse(o=>{if(!o.isMesh)return;const color=o.material.color?.getHexString();if(color==='f4e7cc'){o.material=o.material.clone();o.material.color.set('#fff');o.material.map=plaidTexture;}if(color==='302e2a'||color==='cf633d'||color==='a9432d')o.visible=false;});
 const moustache=new THREE.Mesh(new THREE.SphereGeometry(.085,10,6),mat('#dcd8cb'));moustache.scale.set(1,.28,.33);moustache.position.set(0,1.535,-.161);driver.player.add(moustache);
 driver.limbs[1].rotation.x=-1.25;driver.limbs[3].rotation.x=-1.25;driver.limbs[0].rotation.z=-1.1;driver.limbs[2].rotation.x=-.85;
 const forward=new THREE.Vector3(-Math.sin(heading),0,-Math.cos(heading)),right=new THREE.Vector3(Math.cos(heading),0,-Math.sin(heading));
 const audio=new Audio('/audio/private-property.mp3');audio.preload='auto';audio.volume=gameConfig.npcs.privateProperty.volume;
 const overlay=document.createElement('div');overlay.className='private-property-cinema';overlay.hidden=true;overlay.innerHTML='<div class="private-property-label">PRIVATE PROPERTY</div><div class="private-property-caption"></div><div class="private-property-lock">UNSKIPPABLE ENCOUNTER</div>';uiRoot.append(overlay);const caption=styleEncounterLine(overlay.querySelector('.private-property-caption'));
 const style=document.createElement('style');style.textContent='body.private-property-cutscene header,body.private-property-cutscene .mission,body.private-property-cutscene .radar,body.private-property-cutscene .location,body.private-property-cutscene footer,body.private-property-cutscene .credits,body.private-property-cutscene #bike-status,body.private-property-cutscene #polybahn-ticket,body.private-property-cutscene .toast,body.private-property-cutscene #game-phone,body.private-property-cutscene #open-settings{visibility:hidden}.private-property-cinema{position:fixed;inset:0;z-index:110;pointer-events:auto;border-top:6vh solid #080b10;border-bottom:6vh solid #080b10;box-sizing:border-box}.private-property-cinema[hidden]{display:none}.private-property-label{position:absolute;top:16px;left:32px;color:#ffce6e;font:700 16px sans-serif;letter-spacing:3px}.private-property-caption{position:absolute;bottom:40px;left:10%;right:10%;text-align:center;color:white;font:700 clamp(18px,3vw,34px) sans-serif;text-shadow:0 3px 8px #000}.private-property-lock{position:absolute;bottom:12px;width:100%;text-align:center;color:#b8c6cc;font:11px sans-serif;letter-spacing:2px}';document.head.append(style);
 const clearanceRay=new THREE.Raycaster();
 function clearScene(p){for(let x=-4;x<=4;x+=2)for(let z=-4;z<=4;z+=2){const px=p.x+x,pz=p.z+z;clearanceRay.set(new THREE.Vector3(px,world.height(px,pz)+1000,pz),new THREE.Vector3(0,-1,0));if(clearanceRay.intersectObjects(world.buildings,false).length)return false;if(world.blocked(px,pz)||world.isWater(px,pz)||(solver&&solver.penetration(new THREE.Vector3(px,world.height(px,pz),pz))>.01))return false;}return true;}
 function clearArrival(p){if(!clearScene(p))return false;for(let d=3;d<=18;d+=3){const q=p.clone().addScaledVector(forward,-d);if(q.x<bounds.minX+5||q.x>bounds.maxX-5||q.z<bounds.minZ+5||q.z>bounds.maxZ-5||!clearScene(q))return false;}return true;}

 let encounterHeading=heading,edge=null,count=0,active=false,used=false,age=0,audioStarted=false,audioPlayed=false;const frozen=new THREE.Vector3(),stop=new THREE.Vector3(),approach=new THREE.Vector3();
 return {dispose(){this.reset();overlay.remove();style.remove();disposeOwnedObject(car);},
  active:()=>active,
  state:()=>({active,used,count,edge,age,audioStarted,audioPlayed,unskippable:true,bounds,carVisible:car.visible,carPosition:car.position.toArray(),approach:approach.toArray(),stop:stop.toArray()}),
  reset(){active=false;used=false;count=0;edge=null;age=0;audio.pause();audio.currentTime=0;audioStarted=false;audioPlayed=false;car.visible=false;overlay.hidden=true;document.body.classList.remove('private-property-cutscene');},
  maybeStart(position){if(active)return false;const boundary=privatePropertyBoundary(position,bounds);if(!boundary)return false;
   edge=boundary.edge;right.set(boundary.inward[0],0,boundary.inward[1]);forward.set(right.z,0,-right.x);encounterHeading=Math.atan2(-forward.x,-forward.z);
   active=true;used=true;count++;age=0;audio.pause();audio.currentTime=0;audioStarted=false;audioPlayed=false;frozen.copy(position);stop.copy(position).addScaledVector(right,4.2).addScaledVector(forward,.5);
   for(const p of [stop]){p.x=THREE.MathUtils.clamp(p.x,bounds.minX+3,bounds.maxX-3);p.z=THREE.MathUtils.clamp(p.z,bounds.minZ+3,bounds.maxZ-3);}
   if(!clearArrival(stop)){const origin=stop.clone();let found=false;for(let radius=4;radius<=80&&!found;radius+=4)for(let i=0;i<24&&!found;i++){const a=i*Math.PI/12,candidate=origin.clone().add(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));if(candidate.x<bounds.minX+5||candidate.x>bounds.maxX-5||candidate.z<bounds.minZ+5||candidate.z>bounds.maxZ-5)continue;if(clearArrival(candidate)){stop.copy(candidate);found=true;}}}
   stop.y=world.ground(stop.x,stop.z);approach.copy(stop).addScaledVector(forward,-18);approach.x=THREE.MathUtils.clamp(approach.x,bounds.minX+3,bounds.maxX-3);approach.z=THREE.MathUtils.clamp(approach.z,bounds.minZ+3,bounds.maxZ-3);for(let i=0;i<=18;i++){const candidate=stop.clone().addScaledVector(forward,-i);if(!clearScene(candidate))break;approach.copy(candidate);}approach.y=world.ground(approach.x,approach.z);car.position.copy(approach);car.rotation.set(0,encounterHeading,0);car.visible=true;overlay.hidden=false;document.body.classList.add('private-property-cutscene');caption.textContent='';return true;
  },
  update(dt,position,camera){if(!active)return false;age+=Math.min(dt,.25);position.copy(frozen);const arrival=THREE.MathUtils.smoothstep(age,0,2.2);car.position.lerpVectors(approach,stop,arrival);car.position.y=world.ground(car.position.x,car.position.z);
   const target=car.localToWorld(new THREE.Vector3(-.65,1.85,-.55));
   if(age<2.2){camera.position.copy(stop).addScaledVector(right,-3.5).addScaledVector(forward,3);camera.position.y=stop.y+2.8;camera.lookAt(car.position.x,car.position.y+1.3,car.position.z);}
   else{camera.position.copy(stop).addScaledVector(right,-3.5).addScaledVector(forward,1.2);camera.position.y=stop.y+1.85;camera.lookAt(target);driver.limbs[0].rotation.z=-1.1+Math.sin(age*5)*.12;driver.player.rotation.y=.7;}
   if(age>=gameConfig.npcs.privateProperty.audioStartSeconds&&!audioStarted){audioStarted=true;audio.currentTime=0;audio.play().then(()=>audioPlayed=true).catch(()=>{});}
   caption.textContent=age<2.3?'':age<4?'Hit the road, dude.':age<5.2?'This ain’t no state property.':'This is private property.';
   if(age>=gameConfig.npcs.privateProperty.durationSeconds){active=false;audio.pause();car.visible=false;overlay.hidden=true;document.body.classList.remove('private-property-cutscene');return true;}return false;
  }
 };
}
