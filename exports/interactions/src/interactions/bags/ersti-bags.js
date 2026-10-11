import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export async function createErstiBags(scene,camera,world,spawn,{onSplash=()=>{},onHitPerson=()=>false}={}){
 const loader=new GLTFLoader();const [asset,fps]=await Promise.all([loader.loadAsync('/models/ersti-bag.glb'),loader.loadAsync('/models/ersti-bag-fps.glb')]);
 const rig=fps.scene;camera.add(rig);rig.visible=false;rig.position.z=-.25;
 rig.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.depthTest=false;o.material.depthWrite=false;o.renderOrder=2100;o.frustumCulled=false;}});
 const grip=rig.getObjectByName('BagGrip'),heldModel=rig.getObjectByName('ErstiBag');
 heldModel.rotation.y=Math.PI;heldModel.scale.setScalar(.68);heldModel.position.set(-.12,-.35,0);
 const mixer=new THREE.AnimationMixer(rig),actions=Object.fromEntries(fps.animations.map(c=>[c.name,mixer.clipAction(c)]));
 for(const a of Object.values(actions)){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;}
 const hint=document.createElement('div');hint.id='ersti-bag-hint';hint.hidden=true;document.body.appendChild(hint);
 const bags=[];let held=null,phase='idle',age=0,throws=0,hits=0,enabled=false;
 const ray=new THREE.Raycaster(),direction=new THREE.Vector3();
 function clear(x,z){return !world.isWater(x,z)&&!world.blocked(x,z)&&!world.bodyBlocked(x,world.height(x,z)+.15,z,.35,.7);}
 for(let i=0;i<4;i++){
  let point=null;
  for(let r=2.5;r<12&&!point;r+=.7)for(let j=0;j<24;j++){const a=j/24*Math.PI*2,x=spawn.x+Math.cos(a)*r,z=spawn.z+Math.sin(a)*r;if(clear(x,z)&&bags.every(b=>Math.hypot(x-b.home.x,z-b.home.z)>.8)){point=new THREE.Vector3(x,world.height(x,z)+.015,z);break;}}
  if(!point)continue;
  const model=asset.scene.clone(true);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(model);model.position.copy(point);model.rotation.y=i*.7;
  bags.push({id:i,model,home:point.clone(),velocity:new THREE.Vector3(),flying:false,bounces:0});
 }
 function nearby(pos){let best=null,dist=2.4;for(const b of bags){if(!b.model.visible||b.flying||Math.abs(b.model.position.y-pos.y)>1.4)continue;const d=Math.hypot(b.model.position.x-pos.x,b.model.position.z-pos.z);if(d<dist){const eye=pos.clone().add(new THREE.Vector3(0,1,0)),target=b.model.position.clone().add(new THREE.Vector3(0,.3,0)),delta=target.sub(eye);ray.set(eye,delta.clone().normalize());ray.near=0;ray.far=delta.length();if(ray.intersectObject(world.collider,false).some(hit=>Math.abs(hit.face?.normal.y??0)<.7))continue;dist=d;best=b;}}return best;}
 function play(name){mixer.stopAllAction();actions[name].reset().play();mixer.update(0);}
 function pickup(pos){if(!enabled||held||phase!=='idle')return false;const b=nearby(pos);if(!b)return false;held=b;b.model.visible=false;phase='pickup';age=0;heldModel.visible=true;play('Pickup');return true;}
 function throwBag(){if(!enabled||!held||phase!=='carry')return false;phase='throw';age=0;play('Throw');return true;}
 function release(){
  if(!held)return;
  const b=held;camera.updateMatrixWorld(true);grip.getWorldPosition(b.model.position);b.model.position.y-=.23;
  camera.getWorldDirection(direction);b.velocity.copy(direction).multiplyScalar(12);b.velocity.y+=3.8;b.model.visible=true;b.flying=true;b.bounces=0;b.model.rotation.set(.15,0,0);held=null;heldModel.visible=false;throws++;
 }
 function physics(b,dt){
  for(let t=0;t<dt&&b.flying;t+=.01){const step=Math.min(.01,dt-t),old=b.model.position.clone();b.velocity.y-=9.81*step;const next=old.clone().addScaledVector(b.velocity,step);
   // Sweep the moving bag through the actual building mesh to prevent tunnelling.
   const center=old.clone().add(new THREE.Vector3(0,.25,0)),delta=next.clone().sub(old),length=delta.length();let wall=false;
   if(length>0){ray.set(center,delta.normalize());ray.near=0;ray.far=length+.18;wall=ray.intersectObject(world.collider,false).some(hit=>Math.abs(hit.face?.normal.y??0)<.7);}
   if(!wall&&onHitPerson(old.clone().add(new THREE.Vector3(0,.25,0)),next.clone().add(new THREE.Vector3(0,.25,0)),b.velocity.clone())){b.velocity.multiplyScalar(-.2);b.velocity.y=1.5;hits++;next.copy(old);}
   if(wall){b.velocity.x*=-.28;b.velocity.z*=-.28;b.velocity.y=Math.min(b.velocity.y,1);hits++;next.x=old.x;next.z=old.z;}
   const bounds=world.data.playableBounds;next.x=THREE.MathUtils.clamp(next.x,bounds.minX+.3,bounds.maxX-.3);next.z=THREE.MathUtils.clamp(next.z,bounds.minZ+.3,bounds.maxZ-.3);
   const floor=world.height(next.x,next.z)+.015;
   if(next.y<=floor){next.y=floor;if(world.isWater(next.x,next.z)){onSplash(next.clone());b.model.visible=false;b.flying=false;break;}
    if(b.bounces<2&&Math.abs(b.velocity.y)>1.5){b.velocity.y=Math.abs(b.velocity.y)*.22;b.velocity.x*=.55;b.velocity.z*=.55;b.bounces++;}else{b.flying=false;b.velocity.set(0,0,0);b.model.rotation.set(0,b.model.rotation.y,0);}}
   b.model.position.copy(next);if(b.flying){b.model.rotation.x+=step*3.5;b.model.rotation.z+=step*1.3;}
  }
 }
 function update(dt,pos,active,firstPerson){
  enabled=active;
  for(const b of bags)if(b.flying)physics(b,dt);
  rig.visible=active&&firstPerson&&(held!==null||phase==='throw');hint.hidden=!active;
  if(active){age+=dt;mixer.update(dt);if(phase==='pickup'&&age>=.68){phase='carry';age=0;}if(phase==='throw'&&age>=.43&&held)release();if(phase==='throw'&&age>=.91){phase='idle';age=0;}}
  if(phase==='carry'){rig.position.y=Math.sin(performance.now()*.003)*.006;rig.rotation.z=Math.sin(performance.now()*.002)*.009;}else{rig.position.y=0;rig.rotation.z=0;}
  hint.textContent=phase==='throw'?'ERSTI-BAG · THROWING':held?(phase==='carry'?'Q: THROW ERSTI-BAG · ARROWS / MOUSE: AIM':'ERSTI-BAG · '+(phase==='throw'?'THROWING':'PICKING UP')):nearby(pos)?'F: PICK UP VSETH ERSTI-BAG':'';if(!hint.textContent)hint.hidden=true;
 }
 function reset(){mixer.stopAllAction();held=null;phase='idle';age=0;throws=0;hits=0;rig.visible=false;hint.hidden=true;heldModel.visible=true;for(const b of bags){b.model.visible=true;b.model.position.copy(b.home);b.model.rotation.set(0,b.id*.7,0);b.flying=false;b.velocity.set(0,0,0);}}
 return {update,pickup,throwBag,reset,nearby,rig,occupiesHands:()=>held!==null||phase==='throw',state:()=>({phase,held:held?.id??null,throws,hits,clips:fps.animations.map(c=>c.name),bags:bags.map(b=>({id:b.id,visible:b.model.visible,flying:b.flying,position:b.model.position.toArray(),home:b.home.toArray()}))})};
}
