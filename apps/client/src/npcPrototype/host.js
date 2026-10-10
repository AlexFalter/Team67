import * as THREE from 'three';
import * as C from '@race/shared';
import placements from './placements.json';
import {mainNpcWorld} from './src/world/core/main-world.js';
import {batchNpc,batchStaticNpc,skinNpcRigs} from './batch.js';
import {disposeOwnedObject} from './src/shared/runtime/feature-lifecycle.js';
import {createFinanceGuy} from './src/npcs/finance/finance-guy.js';
import {createTouristPhoto} from './src/interactions/photos/tourist-photo.js';
import {createSixSevenKid} from './src/npcs/polybahn/polybahn-six-seven.js';
import {createPolybahnEater} from './src/npcs/polybahn/polybahn-eater.js';
import {createPolybahnInspector} from './src/npcs/polybahn/polybahn-inspector.js';
import {createInterviewLimo} from './src/npcs/interview/interview-limo.js';
import {createBridgeScooter} from './src/npcs/scooter/bridge-scooter.js';
import {createPrivatePropertyEncounter} from './src/npcs/private-property/private-property.js';
import {createEinsteinTeleporter} from './src/npcs/einstein/einstein-teleporter.js';
import {createTeleportTransition} from './src/npcs/einstein/teleport-transition.js';
import {drawPhoneCameraPreviews} from './src/shared/phone-camera/phone-camera.js';
import './src/shared/dialogue/encounter-ui.css';
import './src/shared/dialogue/rpg-dialogue.css';
import './src/ui/phone/phone-shell.css';
import './encounters.css';
import './host.css';

export class NpcFeature {
 root=new THREE.Group();abort=new AbortController();features=[];poly=new Map();position=new THREE.Vector3();
 remoteLimos=new Map();
 skins=new Map();
 // Set by MapGame: plays the mini-games-2 medal sting (Revenge / Frankfurt Delivery on the scooter gift).
 onMedal=()=>{};
 saved=null;round=0;lastPlayable=false;pending=null;travel=null;lastPose=0;previousPoly=null;noticeUntil=0;
 constructor(scene,camera,net,local,vehicles,canvas,map,capture){
  Object.assign(this,{scene,camera,net,local,vehicles,canvas});this.root.name='NPC encounters';scene.add(this.root);
  this.ui=document.createElement('div');this.ui.className='npc-ui-root';canvas.parentElement.append(this.ui);
  this.hint=document.createElement('div');this.hint.id='npc-hint';this.hint.hidden=true;this.ui.append(this.hint);
  this.menu=document.createElement('section');this.menu.id='npc-choice';this.menu.hidden=true;this.menu.setAttribute('role','dialog');this.menu.setAttribute('aria-label','Polybahn passengers');
  this.menu.innerHTML='<b>POLYBAHN PASSENGERS</b><button data-person="kid">Talk to the strange kid</button><button data-person="eater">Talk to the food enthusiast</button><button data-person="close">Leave · Esc</button>';this.ui.append(this.menu);
  this.message=document.createElement('section');this.message.id='npc-message';this.message.hidden=true;this.message.setAttribute('role','dialog');this.message.setAttribute('aria-modal','true');this.message.innerHTML='<b>Jane Street</b><p></p><button></button>';this.ui.append(this.message);
  this.message.querySelector('button').onclick=()=>{const kind=this.message.dataset.kind;this.message.hidden=true;if(kind==='invitation'){this.send('solve','limousine',{answer:'3'});}else if(kind==='rejection')this.limo?.readRejection();this.syncLock();};
  this.menu.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;const person=button.dataset.person;this.menu.hidden=true;const pair=this.currentPoly();if(person!=='close'&&pair)pair[person].interact(this.position);this.syncLock();},{signal:this.abort.signal});
  window.addEventListener('keydown',e=>{
   if(e.code==='Backspace'&&this.currentPoly()&&!this.active){e.preventDefault();if(this.net.canPlay)this.net.room.send('vehicleExit');return;}
   if(!this.active)return;
   if(!this.message.hidden){if(e.code==='Enter')this.message.querySelector('button').click();e.preventDefault();e.stopImmediatePropagation();return;}
   if(this.pending||this.travel||this.finance?.active()||this.inspector?.active()||this.property?.active()||this.scooter?.active()){e.preventDefault();e.stopImmediatePropagation();return;}
   if(!this.menu.hidden){if(e.code==='Escape')this.menu.hidden=true;else if(e.code==='Digit1')this.menu.querySelector('[data-person=kid]').click();else if(e.code==='Digit2')this.menu.querySelector('[data-person=eater]').click();this.syncLock();return;}
   for(const feature of this.features)if(feature.keydown?.(e)){e.stopImmediatePropagation();this.syncLock();break;}
  },{capture:true,signal:this.abort.signal});
  net.onNpcResult=result=>this.result(result);
  const {world,solver}=mainNpcWorld(map,placements);Object.assign(this,{world,solver});
  this.transition=createTeleportTransition(camera,{uiRoot:this.ui,onComplete:()=>this.send('finish','einstein')});this.features.push(this.transition);
  this.ready=this.load(capture);
 }
 own(feature){this.features.push(feature);return feature;}
 async load(capture){
  const {world,solver,camera}=this,uiRoot=this.ui;
  try{
   this.finance=this.own(createFinanceGuy(this.root,world,solver,{onComplete:()=>this.syncLock(),uiRoot,
    placement:{...placements.finance,fixedSite:C.NPC_LAYOUT.finance.position,fixedAccess:C.NPC_LAYOUT.finance.access}}));
   this.tourists=this.own(createTouristPhoto(this.root,world,solver,{capture,onComplete:()=>this.syncLock(),uiRoot,renderCanvas:this.canvas,
    location:new THREE.Vector3(placements.tourists.position[0],0,placements.tourists.position[1]),viewpoint:new THREE.Vector3(placements.tourists.viewpoint[0],0,placements.tourists.viewpoint[1])}));
   this.property=this.own(createPrivatePropertyEncounter(this.root,world,new THREE.Vector3(),0,solver,{uiRoot}));
   this.scooter=this.own(createBridgeScooter(this.root,world,{placement:placements.scooterEncounter,uiRoot,onCollect:()=>{this.onMedal('frankfurtDelivery');this.syncLock();}}));
   // A fixed parked trio is shared scenery; approaching different players cannot divert it.
   this.scooter.park();
   this.limo=this.own(await createInterviewLimo(this.root,world,solver,{uiRoot,
    placement:{...placements.interview,fixedLaptop:C.NPC_LAYOUT.interview.laptop,fixedRoad:C.NPC_LAYOUT.interview.points,fixedEnd:(C.NPC_LAYOUT.interview.samples.length-1)*.5},
    onClose:()=>this.syncLock(),onBoard:()=>{},onArrive:()=>this.send('finish','limousine'),
    onInvitation:()=>this.showMessage('invitation','Congratulations! Your loop prints 0, 1, 2. Meet our recruiter. Your Uber Black fare is CHF 0.','SEND MY LIMO'),
    onRejection:()=>this.showMessage('rejection','Unfortunately, we have decided not to go through with your candidacy. Thank you for your interest in Jane Street.','READ REJECTION')}));
   this.limo.limo.rotation.reorder('YXZ');
   if(this.abort.signal.aborted){this.cleanupFeatures();return;}
   this.einstein=this.own(await createEinsteinTeleporter(this.root,world,solver,{camera,uiRoot,signal:this.abort.signal,
    placement:{...placements.einstein,fixedSite:C.NPC_LAYOUT.einstein.site,fixedApproach:C.NPC_LAYOUT.einstein.approach},
    assetUrl:path=>`${import.meta.env.BASE_URL}models/npcs/${path.split('/').at(-1)}`,onOpen:()=>this.syncLock(),
    onTravel:()=>{if(this.pending)return false;this.send('begin','einstein');return true;}}));
   if(this.abort.signal.aborted){this.cleanupFeatures();return;}
   batchStaticNpc(this.einstein.actor);batchStaticNpc(this.einstein.portal);batchNpc(this.root);
   skinNpcRigs(this.root,this.skins);
  }catch(error){this.cleanupFeatures();disposeOwnedObject(this.root);this.ui.remove();throw error;}
 }
 get active(){return !!this.pending||!!this.travel||!this.menu.hidden||!this.message.hidden||this.features.some(f=>f.active?.()&&f!==this.limo)||!!this.limo?.modal()||!!this.limo?.riding();}
 get hideAvatar(){return this.active&&!this.currentPoly();}
 currentPoly(){return this.poly.get(this.local.body.vehicleId);}
 showMessage(kind,text,button){this.message.dataset.kind=kind;this.message.querySelector('p').textContent=text;this.message.querySelector('button').textContent=button;this.message.hidden=false;this.message.querySelector('button').focus();this.syncLock();}
 send(action,kind,extra={}){
  if(!this.net.canPlay||this.pending)return;
  this.pending={action,kind,at:this.net.now()};this.net.room.send('npc',{action,kind,roundStartedAt:this.net.room.state.startedAt,...extra});this.syncLock();
 }
 result(result){
  if(this.abort.signal.aborted||!this.pending||result.roundStartedAt!==this.net.room?.state.startedAt||result.kind!==this.pending.kind||result.action!==this.pending.action)return;
  const pending=this.pending;this.pending=null;
  if(!result.ok){if(pending.action==='finish'&&this.travel){this.retryAt=this.net.now()+300;return;}this.travel=null;this.notice(result.message);if(result.kind==='einstein')this.einstein?.reject();if(result.kind==='limousine'&&pending.action==='begin')this.limo?.reset();if(result.kind==='property')this.property?.reset();this.syncLock();return;}
  if(result.action==='solve')this.limo?.requestRide();
  else if(result.action==='begin'){
   this.travel={kind:result.kind,target:new THREE.Vector3(result.target.x,result.target.y,result.target.z),source:this.position.clone(),confirmed:false};
   if(result.kind==='einstein'){
    this.einstein.markTravel([result.target.x,result.target.z]);const sourceView={position:this.camera.position.clone(),rotation:this.camera.quaternion.clone()};
    this.camera.position.copy(this.travel.target).add(new THREE.Vector3(0,1.6,0));this.camera.up.set(0,1,0);this.camera.rotation.set(0,this.local.body.rotY+Math.PI,0);
    this.transition.start(this.travel.source,this.travel.target,sourceView);
   }else if(result.kind==='limousine')this.limo.interact(this.position);
   else this.property.maybeStart(this.position);
  }else if(result.action==='finish'){
   if(result.target)Object.assign(this.local.body,result.target,{vx:0,vy:0,vz:0,anim:0,grounded:true});this.travel=null;
  }
  this.syncLock();
 }
 notice(text){this.hint.textContent=text;this.noticeUntil=this.net.now()+4000;this.hint.hidden=false;}
 syncLock(){
  const active=this.active;
  if(active&&!this.saved){this.saved={fov:this.camera.fov,up:this.camera.up.clone()};this.local.clear();this.local.body.vx=this.local.body.vy=this.local.body.vz=0;if(document.pointerLockElement===this.canvas)document.exitPointerLock();}
  if(!active&&this.saved){this.camera.fov=this.saved.fov;this.camera.up.copy(this.saved.up);this.camera.updateProjectionMatrix();this.saved=null;}
  this.net.npcPaused=active&&!this.local.body.vehicleId;if(active){this.local.enabled=false;this.local.clear();}
 }
 interact(){
  if(!this.net.canPlay||this.active||this.local.body.knockdownUntil>this.net.now())return false;
  this.position.set(this.local.body.x,this.local.body.y,this.local.body.z);
  const pair=this.currentPoly();if(pair){this.menu.hidden=false;this.menu.querySelector('button').focus();this.syncLock();return true;}
  if(this.local.body.vehicleId)return false;
  if(this.limo?.state().phase==='waiting'&&this.position.distanceTo(new THREE.Vector3(...this.limo.state().pickup))<9){this.send('begin','limousine');return true;}
  const handled=this.einstein?.interact(this.position)||this.limo?.interact(this.position)||this.scooter?.interact(this.position);
  this.syncLock();return !!handled;
 }
 attachPoly(){
  for(const [id,visual] of this.vehicles.items){
   if(visual.latest.kind!==6||!visual.railCars?.[0])continue;const car=visual.railCars[0],previous=this.poly.get(id);
   if(previous?.car===car)continue;
   if(previous){previous.kid.dispose();previous.eater.dispose();this.features=this.features.filter(f=>f!==previous.kid&&f!==previous.eater);}
   const kid=this.own(createSixSevenKid(car,{id:`kid-dialogue-${id}`,uiRoot:this.ui,onClose:()=>this.syncLock()})),eater=this.own(createPolybahnEater(car,{id:`eater-dialogue-${id}`,uiRoot:this.ui,onClose:()=>this.syncLock()}));
   // Keep the public passenger seats free; NPCs sit at the ends of each bench.
   kid.actor.position.z=-2.05;eater.actor.position.z=2.05;batchNpc(kid.actor);batchNpc(eater.actor);skinNpcRigs(kid.actor,this.skins);skinNpcRigs(eater.actor,this.skins);
   this.poly.set(id,{car,kid,eater});
   if(!this.inspector){this.inspector=this.own(createPolybahnInspector(car,{scene:this.root,world:this.world,solver:this.solver,uiRoot:this.ui,onComplete:()=>this.syncLock()}));batchNpc(this.inspector.actor);skinNpcRigs(this.inspector.actor,this.skins);}
  }
 }
 update(dt,available){
  if(this.abort.signal.aborted)return;
  const playable=this.net.canPlay,state=this.net.room?.state;
  if((this.lastPlayable&&!playable)||state&&state.startedAt!==this.round){this.reset();this.round=state?.startedAt??0;}this.lastPlayable=playable;
  this.root.visible=playable;this.attachPoly();this.position.set(this.local.body.x,this.local.body.y,this.local.body.z);
  const pair=this.currentPoly();for(const [id,p] of this.poly){p.kid.update(dt,playable&&this.local.body.vehicleId===id,!!this.inspector?.active(),this.position);p.eater.update(dt,playable&&this.local.body.vehicleId===id,this.inspector?.active()||p.kid.active(),this.position);}
  if(!playable){this.hint.hidden=true;return;}
  const own=state.npcs?.get(this.net.room.sessionId);
  if(own?.teleportUsed&&this.einstein?.state().chargesRemaining)this.einstein.markTravel([own.targetX,own.targetZ]);
  if(this.travel){const own=state.npcs?.get(this.net.room.sessionId);if(own?.kind===this.travel.kind)this.travel.confirmed=true;else if(this.travel.confirmed&&!this.pending){this.reset();this.notice('The encounter ended. You can continue playing.');}}
  if(this.local.body.knockdownUntil>this.net.now()&&this.active&&!this.travel)this.reset();
  if(this.pending&&this.net.now()-this.pending.at>7000){const kind=this.pending.kind;this.net.room.send('npc',{action:'cancel',kind,roundStartedAt:state.startedAt});this.pending=null;this.travel=null;this.reset();this.notice('Encounter timed out. Try again.');}
  if(this.retryAt&&this.net.now()>=this.retryAt){this.retryAt=0;if(this.travel)this.send('finish',this.travel.kind);}
  if(this.previousPoly&&!this.local.body.vehicleId&&available&&!this.active&&!this.inspected){const vehicle=state.vehicles.get(this.previousPoly.id);if(vehicle&&!vehicle.traveling&&this.net.now()>=this.previousPoly.arrival-100){this.inspected=true;this.inspector?.start(this.position);}this.previousPoly=null;}
  if(pair){const vehicle=state.vehicles.get(this.local.body.vehicleId);if(vehicle?.traveling)this.previousPoly={id:this.local.body.vehicleId,arrival:vehicle.arrivalAt};}
  if(available&&!this.active&&!this.local.body.vehicleId){this.finance?.maybeStart(this.position);if(!this.finance?.active())this.tourists?.update(this.position,this.camera);if(!this.active){const b=this.world.data.encounterBounds;if(Math.min(this.position.x-b.minX,b.maxX-this.position.x,this.position.z-b.minZ,b.maxZ-this.position.z)<12)this.send('begin','property');}}
  this.syncLock();
  this.finance?.update(dt,this.position,this.camera);
  if(this.tourists?.active())this.tourists.update(this.position,this.camera);
  this.einstein?.update(dt);this.scooter?.updateConversation(dt,this.position,this.camera);
  this.limo?.update(dt,this.position,this.camera);this.inspector?.update(dt,this.camera);
  if(this.property?.update(dt,this.position,this.camera))this.send('finish','property');
  this.transition.update(dt);
  if(this.travel?.kind==='limousine'){
   Object.assign(this.local.body,{x:this.position.x,y:this.position.y,z:this.position.z,vx:0,vy:0,vz:0});
  }
  if(this.limo?.limo.visible&&this.net.now()-this.lastPose>=100){this.lastPose=this.net.now();const car=this.limo.limo;this.net.room.send('npcPose',{roundStartedAt:state.startedAt,car:[car.position.x,car.position.y,car.position.z,car.rotation.y,car.rotation.x],player:this.travel?.kind==='limousine'?[this.position.x,this.position.y,this.position.z,car.rotation.y+Math.PI]:undefined});}
  for(const [id,npc] of state.npcs??[]){if(id===this.net.room.sessionId)continue;let car=this.remoteLimos.get(id);if(npc.limoVisible&&this.limo){if(!car){car=this.limo.limo.clone(true);this.root.add(car);this.remoteLimos.set(id,car);}car.visible=true;car.position.set(npc.limoX,npc.limoY,npc.limoZ);car.rotation.set(npc.limoPitch,npc.limoYaw,0,'YXZ');}else if(car)car.visible=false;}
  for(const [id,car] of this.remoteLimos)if(!state.npcs?.has(id)){car.removeFromParent();this.remoteLimos.delete(id);}
  const dialogue=pair?.kid.active()?pair.kid:pair?.eater.active()?pair.eater:null;
  if(dialogue){const view=dialogue.dialogueView(this.position);this.camera.position.copy(view.eye);this.camera.up.copy(view.up);this.camera.lookAt(view.target);}
  this.syncLock();
  for(const [actor,update] of this.skins){if(!actor.parent)this.skins.delete(actor);else update();}
  if(this.net.now()>=this.noticeUntil){const near=this.einstein?.near(this.position),laptop=this.limo?.laptop.position,pickup=this.limo?.state().pickup;
   const text=pair?'E · Talk to Polybahn passengers · Backspace to leave':near||laptop&&this.position.distanceTo(laptop)<3?'E · Jane Street laptop':this.limo?.state().phase==='waiting'&&this.position.distanceTo(new THREE.Vector3(...pickup))<9?'E · Board your limousine':this.scooter?.canTalk(this.position)?'E · Talk to the scooter riders':'';
   this.hint.textContent=near||text;this.hint.hidden=!available||this.active||!text||!!this.local.body.vehicleId&&!pair;
  }
 }
 reset(){
  for(const car of this.remoteLimos.values())car.visible=false;
  this.pending=null;this.travel=null;this.retryAt=0;this.previousPoly=null;this.inspected=false;this.menu.hidden=this.message.hidden=true;
  for(const feature of this.features)feature.reset?.();this.scooter?.park();this.syncLock();
 }
 cleanupFeatures(){for(const car of this.remoteLimos.values())car.removeFromParent();this.remoteLimos.clear();for(const feature of this.features.splice(0))feature.dispose?.();this.poly.clear();this.skins.clear();}
 afterRender(){if(!this.abort.signal.aborted)drawPhoneCameraPreviews(this.canvas);}
 dispose(){if(this.abort.signal.aborted)return;const kind=this.travel?.kind??this.pending?.kind;if(kind&&this.net.status==='Connected')this.net.room.send('npc',{action:'cancel',kind,roundStartedAt:this.net.room.state.startedAt});this.reset();this.abort.abort();this.net.onNpcResult=undefined;this.cleanupFeatures();disposeOwnedObject(this.root);this.ui.remove();}
}
