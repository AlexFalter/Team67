import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {BAG_HILL,BAG_THROW_RELEASE_MS,INTERP_DELAY_MS,zurichWorld,type BagState} from '@race/shared';
import {decoratePlayer} from '../playerIdentity.ts';
import {avatar,pose,disposeAvatar,bagCarryPose} from '../avatar.ts';
import type {Network} from '../net.ts';
import type {LocalPlayer} from '../localPlayer.ts';
import type {PlayerView} from '../view.ts';
import {disposeOwnedObject} from '../../npcPrototype/src/shared/runtime/feature-lifecycle.js';
import './bags.css';
import {BagFlight} from './bagFlight.ts';
import {bagThrowClip} from './bagThrow.ts';

export class BagFeature {
 readonly ready:Promise<void>;
 readonly hill:THREE.Mesh;
 private group=new THREE.Group();
 private models=new Map<string,THREE.Group>();
 private flights=new Map<string,BagFlight>();
 private meshes=new Map<string,THREE.Group>();
 private throwingId='';
 private heldPosition=new THREE.Vector3();
 private heldRotation=new THREE.Quaternion();
 private heldScale=new THREE.Vector3();
 private handoff?:{id:string;at:number;offset:THREE.Vector3;rotation:THREE.Quaternion;scale:THREE.Vector3};
 private targetRotation=new THREE.Quaternion();
 private targetEuler=new THREE.Euler();
 private dummies=new Map<string,THREE.Group>();
 private asset?:THREE.Group;
 private rig?:THREE.Group;
 private mixer?:THREE.AnimationMixer;
 private actions=new Map<string,THREE.AnimationAction>();
 private heldModel?:THREE.Object3D;
 private disposed=false;
 private abort=new AbortController();
 private phase='idle';
 private age=0;
 private held='';
 private pending=false;
 private sentAt=0;
 private settings=document.createElement('label');
 private checkbox:HTMLInputElement;
 private hint=document.createElement('div');
 private round=0;
 constructor(scene:THREE.Scene,private camera:THREE.PerspectiveCamera,private net:Network,private local:LocalPlayer,private view:PlayerView,root:HTMLElement,private canUse:()=>boolean,private holster:()=>void){
  this.group.name='Ersti bags and debug dummies';scene.add(this.group);
  // Terrain and rendering use the same hill profile; walking does not clip through it.
  const vertices:number[]=[],indices:number[]=[],segments=64,rings=16;
  const vertex=(radius:number,angle:number)=>{const x=BAG_HILL.center[0]+Math.cos(angle)*radius,z=BAG_HILL.center[1]+Math.sin(angle)*radius;vertices.push(x,(zurichWorld.height(x,z)??0)+.008,z);};
  vertex(0,0);for(let ring=1;ring<=rings;ring++)for(let j=0;j<segments;j++)vertex(BAG_HILL.radius*ring/rings,j*Math.PI*2/segments);
  for(let j=0;j<segments;j++)indices.push(0,1+(j+1)%segments,1+j);
  for(let ring=1;ring<rings;ring++)for(let j=0;j<segments;j++){const a=1+(ring-1)*segments+j,b=1+(ring-1)*segments+(j+1)%segments,c=1+ring*segments+j,d=1+ring*segments+(j+1)%segments;indices.push(a,d,c,a,b,d);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  this.hill=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#738348',roughness:1,side:THREE.DoubleSide}));this.hill.visible=BAG_HILL.height>0;this.hill.name='Walkable Ersti bag hill';this.hill.receiveShadow=true;this.group.add(this.hill);
  this.settings.className='bag-debug-setting';this.settings.hidden=true;this.settings.innerHTML='<input type="checkbox"> Spawn practice dummies';this.checkbox=this.settings.querySelector('input')!;
  // The toggle belongs to the pause/settings menu and is only shown to a dev-room host.
  document.querySelector('#pause #leave')!.before(this.settings);this.checkbox.addEventListener('change',()=>this.net.room.send('debugDummies',this.checkbox.checked),{signal:this.abort.signal});
  this.hint.className='bag-notice';this.hint.hidden=true;root.append(this.hint);
  this.net.onBagResult=result=>{this.pending=false;if(result.ok){this.holster();if(result.action==='pickup'){this.view.perspective=0;this.play('Pickup','pickup');}}else{if(result.action==='throw'&&this.local.body.bagId){this.carry();}this.hint.textContent=result.message;this.hint.hidden=false;this.sentAt=this.net.now();}};
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||!this.local.enabled||!this.canUse())return;if(e.code==='KeyQ'&&this.occupiesHands){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)this.throwBag();}},{capture:true,signal:this.abort.signal});
  this.ready=this.load();
 }
 private async load(){const loader=new GLTFLoader(),[asset,fps]=await Promise.all([loader.loadAsync('/models/ersti-bag.glb'),loader.loadAsync('/models/ersti-bag-fps.glb')]);
  if(this.disposed){disposeOwnedObject(asset.scene);disposeOwnedObject(fps.scene);return;}
  this.asset=asset.scene;this.rig=fps.scene;this.camera.add(this.rig);this.rig.visible=false;this.rig.position.z=-.25;
  this.rig.traverse(o=>{if(o instanceof THREE.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){m.depthTest=false;m.depthWrite=false;}o.renderOrder=2100;o.frustumCulled=false;}});
  this.heldModel=this.rig.getObjectByName('ErstiBag');if(this.heldModel){this.heldModel.rotation.y=Math.PI;this.heldModel.scale.setScalar(.68);this.heldModel.position.set(-.12,-.35,0);}
  this.mixer=new THREE.AnimationMixer(this.rig);for(const c of fps.animations){const a=this.mixer.clipAction(c.name==='Throw'?bagThrowClip(c):c);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;this.actions.set(c.name,a);}
 }
 get occupiesHands(){return !!this.local.body.bagId||this.phase==='throw';}
 private play(clip:string,phase:string){this.mixer?.stopAllAction();this.actions.get(clip)?.reset().play();this.mixer?.update(0);this.phase=phase;this.age=0;}
 private carry(){this.play('Pickup','carry');const action=this.actions.get('Pickup');if(action){action.time=action.getClip().duration;this.mixer?.update(0);}}
 get canThrow(){return !!this.local.body.bagId&&!this.pending&&this.phase==='carry'&&this.canUse()&&!this.local.body.vehicleId&&this.local.body.knockdownUntil<=this.net.now();}
 private send(action:string,id?:string){if(!this.net.canPlay||this.pending)return;this.pending=true;this.sentAt=this.net.now();this.net.room.send('bag',{action,id,aim:this.camera.getWorldDirection(new THREE.Vector3()).toArray(),roundStartedAt:this.net.room.state.startedAt});}
 throwBag(){if(this.canThrow){this.throwingId=this.local.body.bagId??'';this.handoff=undefined;this.play('Throw','throw');this.send('throw');}}
 get nearby(){if(!this.canUse()||this.local.body.bagId||this.local.body.vehicleId)return undefined;const p=this.local.body;return [...(this.net.room?.state.bags??[])].filter(([,b])=>!b.flying&&!b.throwAt&&(!b.owner||this.net.room.state.dummies?.has(b.owner))&&Math.abs(b.y-p.y)<1.5&&Math.hypot(b.x-p.x,b.z-p.z)<2.4).sort((a,b)=>Math.hypot(a[1].x-p.x,a[1].z-p.z)-Math.hypot(b[1].x-p.x,b[1].z-p.z))[0]?.[0];}
 interact(){const id=this.nearby;if(!id)return false;this.send('pickup',id);return true;}
 update(dt:number,own:THREE.Group,remotes:Iterable<[string,{mesh:THREE.Group}]>){
  const state=this.net.room?.state,playing=this.net.canPlay;this.group.visible=playing;this.settings.hidden=!state?.devMode||state.hostId!==this.net.room?.sessionId;this.checkbox.checked=state?.debugDummies===true;
  if(state?.startedAt!==this.round){this.round=state?.startedAt??0;this.phase='idle';this.held='';this.pending=false;this.throwingId='';this.handoff=undefined;this.flights.clear();this.mixer?.stopAllAction();}
  if(this.pending&&this.net.now()-this.sentAt>3000)this.pending=false;if(this.net.now()-this.sentAt>4000)this.hint.hidden=true;
  this.age+=dt;this.mixer?.update(dt);
  if(this.phase==='pickup'&&this.age>=.68)this.phase=this.local.body.bagId?'carry':'idle';if(this.phase==='throw'&&this.age>=.91){if(this.local.body.bagId)this.carry();else this.phase='idle';}
  const bagId=this.local.body.bagId??'';if(bagId)this.holster();if(bagId!==this.held){this.held=bagId;if(bagId&&this.phase!=='pickup'){this.holster();this.play('Pickup','pickup');}else if(!bagId&&this.phase!=='throw')this.phase='idle';}
  if(this.rig){this.rig.visible=playing&&this.canUse()&&this.view.perspective===0&&this.occupiesHands&&!this.local.body.vehicleId&&this.local.body.knockdownUntil<=this.net.now();this.rig.position.y=this.phase==='carry'?Math.sin(performance.now()*.003)*.006:0;}
  if(this.heldModel){
   const throwing=state?.bags?.get(this.throwingId);
   if(this.rig?.visible&&this.heldModel.visible){this.camera.updateWorldMatrix(true,true);this.heldModel.getWorldPosition(this.heldPosition);this.heldModel.getWorldQuaternion(this.heldRotation);this.heldModel.getWorldScale(this.heldScale);}
   this.heldModel.visible=this.phase!=='throw'||(throwing?throwing.owner===this.net.room?.sessionId:this.age<BAG_THROW_RELEASE_MS/1000);
  }
  const meshes=this.meshes;meshes.clear();for(const [id,r] of remotes)meshes.set(id,r.mesh);if(this.net.room)meshes.set(this.net.room.sessionId,own);
  for(const [id,p] of state?.dummies??[]){let mesh=this.dummies.get(id);if(!mesh){mesh=avatar('#e5a440');mesh.name=`Practice dummy ${id}`;decoratePlayer(mesh,`Practice dummy ${id.split('-').at(-1)}`,true);this.group.add(mesh);this.dummies.set(id,mesh);}pose(mesh,p,dt);meshes.set(id,mesh);}
  for(const [id,mesh] of this.dummies)if(!state?.dummies?.has(id)){disposeAvatar(mesh);this.dummies.delete(id);}
  for(const [id,mesh] of meshes){const p=state?.players?.get(id)??state?.dummies?.get(id);if(p?.bagId)bagCarryPose(mesh,p);}
  if(!this.asset)return;
  for(const [id,b] of state?.bags??[]){let model=this.models.get(id);if(!model){model=this.asset.clone(true);model.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});this.group.add(model);this.models.set(id,model);}this.place(id,model,b,meshes);}
  for(const [id,model] of this.models)if(!state?.bags?.has(id)){model.removeFromParent();this.models.delete(id);this.flights.delete(id);}
 }
 private place(id:string,model:THREE.Group,b:BagState,meshes:Map<string,THREE.Group>){model.visible=!b.owner||b.owner!==this.net.room?.sessionId||this.view.perspective!==0;model.scale.setScalar(b.owner ? .65 : 1);
  if(b.owner){const mesh=meshes.get(b.owner),wrist=mesh?.getObjectByName('left-wrist');if(wrist){mesh!.updateWorldMatrix(true,true);wrist.getWorldPosition(model.position);model.position.y-=.28;model.quaternion.copy(mesh!.quaternion);return;}}
  let flight=this.flights.get(id);if(!flight){flight=new BagFlight();this.flights.set(id,flight);}
  flight.push(b,this.net.room.state.serverTime);
  const point=flight.sample(this.net.now()-(b.thrower===this.net.room.sessionId?0:INTERP_DELAY_MS));
  model.position.set(point.x,point.y,point.z);model.rotation.set(point.pitch,0,point.roll);
  if(b.flying&&b.thrower===this.net.room.sessionId&&id===this.throwingId&&this.phase==='throw'&&this.handoff?.id!==id){
   this.handoff={id,at:this.net.now(),offset:this.heldPosition.clone().sub(model.position),rotation:this.heldRotation.clone(),scale:this.heldScale.clone()};
  }
  if(this.handoff?.id===id&&b.flying){
   const u=THREE.MathUtils.smoothstep((this.net.now()-this.handoff.at)/1000,0,.14);
   model.position.addScaledVector(this.handoff.offset,1-u);
   this.targetRotation.setFromEuler(this.targetEuler.set(point.pitch,0,point.roll));model.quaternion.slerpQuaternions(this.handoff.rotation,this.targetRotation,u);
   model.scale.set(this.handoff.scale.x+(1-this.handoff.scale.x)*u,this.handoff.scale.y+(1-this.handoff.scale.y)*u,this.handoff.scale.z+(1-this.handoff.scale.z)*u);
  }
 }
 dispose(){this.disposed=true;this.abort.abort();this.net.onBagResult=undefined;this.settings.remove();this.hint.remove();this.mixer?.stopAllAction();for(const mesh of this.dummies.values())disposeAvatar(mesh);this.dummies.clear();this.models.clear();this.flights.clear();this.meshes.clear();if(this.rig)disposeOwnedObject(this.rig);if(this.asset)disposeOwnedObject(this.asset);this.hill.geometry.dispose();(this.hill.material as THREE.Material).dispose();this.group.removeFromParent();}
}
