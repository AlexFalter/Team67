import {createCyclingKid} from './src/npcs/cycling-kid/cycling-kid.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createFootballStand} from './src/npcs/football/football-stand.js';
import {createTikiPerformer} from './src/npcs/tiki-performer/tiki-performer.js';
import {animateHelicopter} from './src/npcs/interview/helicopter-model.js';
import {createMichaelJackson} from './src/npcs/michael-jackson/michael-jackson.js';
import {createMichaelChallenge} from './src/npcs/michael-jackson/challenge.js';
import {createPhoneSounds} from './src/ui/phone/phone-sounds.js';
import {createPhone} from './src/ui/phone/phone.js';
import {crossesStationDoorway,completedUnticketedPolybahnRide} from './src/npcs/polybahn/station-doorway.js';
import {createNpcKnockdown} from './src/interactions/knife/npc-knockdown.js';
import {createKarambit} from './src/interactions/knife/karambit.js';
import {capturePolybahnMenuEye} from './src/vehicles/rail/polybahn-dialogue-view.js';
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
import {createScooterPhoto} from './src/interactions/photos/scooter-photo.js';
import {createBridgeScooter} from './src/npcs/scooter/bridge-scooter.js';
import {createPrivatePropertyEncounter} from './src/npcs/private-property/private-property.js';
import {createEinsteinTeleporter} from './src/npcs/einstein/einstein-teleporter.js';
import {createCatBench} from './src/npcs/cat/cat-bench.js';
import {createTeleportTransition} from './src/npcs/einstein/teleport-transition.js';
import {createPolybahnTicketMachine} from './src/interactions/tickets/polybahn-ticket-machine.js';
import {createTicketProps} from './src/interactions/tickets/ticket-props.js';
import {drawPhoneCameraPreviews} from './src/shared/phone-camera/phone-camera.js';
import {styleRPGDialogue} from './src/npcs/shared/rpg-dialogue.js';
import './src/shared/dialogue/encounter-ui.css';
import './src/shared/dialogue/rpg-dialogue.css';
import './src/ui/phone/phone-shell.css';
import './encounters.css';
import './host.css';

export class NpcFeature {
 root=new THREE.Group();abort=new AbortController();features=[];poly=new Map();position=new THREE.Vector3();
 remoteLimos=new Map();
 skins=new Map();
 // Optional integration callbacks supplied by MapGame.
 onMedal=undefined;onFootballReward=undefined;
 onSuspend=undefined;onResume=undefined;externalPhoneBusy=undefined;playerView=undefined;
 saved=null;round=0;lastPlayable=false;pending=null;travel=null;lastPose=0;previousPoly=null;noticeUntil=0;
 constructor(scene,camera,net,local,vehicles,canvas,map,capture){
  Object.assign(this,{scene,camera,net,local,vehicles,canvas});this.root.name='NPC encounters';scene.add(this.root);
  this.ui=document.createElement('div');this.ui.className='npc-ui-root';canvas.parentElement.append(this.ui);
  this.hint=document.createElement('div');this.hint.id='npc-hint';this.hint.hidden=true;this.ui.append(this.hint);
  this.boundaryWarning=document.createElement('aside');this.boundaryWarning.className='property-boundary-warning';this.boundaryWarning.hidden=true;this.boundaryWarning.textContent='PRIVATE PROPERTY · TURN BACK';this.ui.append(this.boundaryWarning);
  this.message=document.createElement('section');this.message.id='npc-message';this.message.hidden=true;this.message.setAttribute('role','dialog');this.message.setAttribute('aria-modal','true');this.message.classList.add('rpg-dialogue-compact');this.message.innerHTML='<div class="rpg-dialogue-name">Jane Street</div><p></p><div class="rpg-dialogue-options"><button type="button"></button></div>';styleRPGDialogue(this.message);this.ui.append(this.message);
  this.message.querySelector('button').onclick=()=>{const kind=this.message.dataset.kind;this.message.hidden=true;if(kind==='invitation'){this.limo?.requestRide();}else if(kind==='rejection')this.limo?.readRejection();this.syncLock();};
  this.phoneSounds=createPhoneSounds();
  this.phone=this.own(createPhone({uiRoot:this.ui,canOpen:()=>this.canOpenPhone,onOpen:()=>{this.limo?.pauseLook();this.syncLock();},onClose:()=>this.resumeAfterPhone(),onSound:kind=>this.phoneSounds.play(kind),onSubmit:(id,answer)=>this.net.room.send('moodleAnswer',{id,answer,roundStartedAt:this.net.room.state.startedAt}),onQuizReward:id=>{if(this.net.canPlay)this.net.room.send('moodleBoost',{id,roundStartedAt:this.net.room.state.startedAt});}}));
  this.net.onMoodleResult=data=>this.phone.resolveQuiz(data);
  this.moodleSettings=document.createElement('label');this.moodleSettings.className='phone-moodle-setting';this.moodleSettings.innerHTML='<input type="checkbox" checked> Random Moodle quizzes';this.ui.querySelector('#phone-device .phone-screen').append(this.moodleSettings);this.moodleSettings.querySelector('input').onchange=e=>this.net.room.send('moodleSettings',e.target.checked);
  window.addEventListener('keydown',e=>this.keydown(e),{capture:true,signal:this.abort.signal});
  canvas.addEventListener('click',e=>{if(!this.active&&this.local.enabled&&this.playerView?.perspective===0&&this.karambit?.occupiesHands()){this.attackKarambit();e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal:this.abort.signal});
  net.onLimePhotoRequired=id=>{this.limePhotoPending=id;this.syncLock();};
  net.onLimePhotoResult=ok=>{if(ok){this.limePhotoSubmitting=false;this.limePhotoPending=null;this.phone.receive({sender:'Lime',text:'Thank you for riding with Lime! Your parking photo was accepted. Ride ended.',color:'#39b54a'});}else {this.limePhotoSubmitting=false;this.notice('Parking photo could not be submitted. Try again.');}this.syncLock();if(ok&&this.local.enabled)this.onResume?.();};
  net.onNpcResult=result=>this.result(result);
  net.onTicketResult=result=>{
   const pending=this.ticketRequest;
   if(!pending||result.action!==pending.action||result.roundStartedAt!==pending.round)return;
   this.ticketRequest=null;pending.resolve(result.ok);if(!result.ok)this.notice(result.message);
  };
  const {world,solver}=mainNpcWorld(map,placements);Object.assign(this,{world,solver});
  this.transition=createTeleportTransition(camera,{uiRoot:this.ui,renderCanvas:this.canvas,onComplete:()=>{if(this.adminTeleport){this.adminTeleport=false;this.syncLock();this.onResume?.();}else this.send('finish','einstein');}});this.features.push(this.transition);
  this.ready=this.load(capture);
 }
 keydown(e){
   if(document.querySelector('#pause')?.hidden===false)return;
   if((this.phone.active()||e.code==='KeyP'&&!e.target?.matches?.('input,textarea,select,[contenteditable=true]'))&&this.phone.keydown(e)){e.stopImmediatePropagation();return;}
   if(e.code==='Escape'&&this.active){
    if(e.repeat){e.preventDefault();e.stopImmediatePropagation();return;}
    for(const feature of this.features){
     if(feature===this.phone||feature===this.tourists||feature===this.limePhoto)continue;
     if(feature.keydown?.(e)){e.preventDefault();e.stopImmediatePropagation();this.syncLock();return;}
    }
    // Mandatory scenes keep running; Escape opens the menu without skipping them.
    return;
   }
   if(e.code==='Backspace'&&this.local.enabled&&this.currentPoly()&&!this.active){e.preventDefault();if(this.net.canPlay)this.net.room.send('vehicleExit');return;}
   if(this.canUseKarambit()){
    if(e.code==='Digit3'&&!e.repeat){this.toggleKarambit();e.preventDefault();e.stopImmediatePropagation();return;}
    if(this.playerView?.perspective===0&&this.karambit.occupiesHands()&&e.code==='KeyQ'){if(!e.repeat){this.attackKarambit();}e.preventDefault();e.stopImmediatePropagation();return;}
   }
   if(!this.active)return;
   if(this.limePhotoPending&&!this.limePhoto?.active()){e.preventDefault();e.stopImmediatePropagation();return;}
   if(this.limo?.riding()&&this.limo.keydown(e)){e.preventDefault();e.stopImmediatePropagation();return;}
   if(!this.message.hidden){if(e.code==='Enter')this.message.querySelector('button').click();e.preventDefault();e.stopImmediatePropagation();return;}
   if(this.scooter?.active()&&this.scooter.keydown?.(e)){e.preventDefault();e.stopImmediatePropagation();this.syncLock();return;}
   if(this.pending||this.travel||this.finance?.active()||this.inspector?.active()||this.property?.active()||this.scooter?.active()){e.preventDefault();e.stopImmediatePropagation();return;}
   for(const feature of this.features)if(feature!==this.phone&&feature.keydown?.(e)){e.stopImmediatePropagation();this.syncLock();break;}
 }
 get canOpenPhone(){
  return this.net.canPlay&&document.querySelector('#pause')?.hidden!==false&&!this.pending&&(!this.travel||this.travel.kind==='limousine')&&!this.limePhotoPending&&!this.externalPhoneBusy?.()&&(this.local.body.moodleSitUntil??0)<=this.net.now()&&!this.limo?.modal()&&!this.tourists?.active()&&!this.limePhoto?.active()&&!this.ticketMachine?.active()&&!this.transition?.active();
 }
 get pauseAvailable(){return this.active&&!this.phone.active();}
 resumeAfterPhone(){
  this.syncLock();
  if(this.rideMouseCapture)this.limo?.resumeLook();
  else if(this.local.enabled)this.onResume?.();
 }
 own(feature){this.features.push(feature);return feature;}
 requestTicket(action,tiles){
  if(!this.net.canPlay||this.ticketRequest)return Promise.resolve(false);
  return new Promise(resolve=>{const round=this.net.room.state.startedAt;this.ticketRequest={action,round,resolve,at:this.net.now()};this.net.room.send('ticket',{action,roundStartedAt:round,tiles});});
 }
 async load(capture){
  const {world,solver,camera}=this,uiRoot=this.ui;
  try{
   const ticketPoint=new THREE.Vector3().copy(C.ticketSite(C.zurichWorld));
   this.ticketProps=createTicketProps(this.root,[ticketPoint]);
   this.ticketProps[0].group.rotation.y=C.TICKET_ROTATION_Y;
   const ticketRail={ticketProps:this.ticketProps,ticketPoints:[ticketPoint],nearTicketIndex:position=>C.nearTicket(position,C.zurichWorld)?0:-1,
    state:()=>({ticketCount:this.net.room?.state.npcs?.get(this.net.room.sessionId)?.ticketCount??0}),collectTicket:()=>this.requestTicket('collect')};
   this.ticketMachine=this.own(createPolybahnTicketMachine(ticketRail,{camera,canvas:this.canvas,uiRoot,
    onPayment:tiles=>this.requestTicket('pay',tiles),onClose:()=>this.syncLock(),onPurchase:already=>{if(already)this.notice('You already have a Polybahn ticket.');this.syncLock();}}));
   this.limePhoto=this.own(createScooterPhoto(world,solver,{capture,uiRoot,renderCanvas:this.canvas,onComplete:()=>{this.limePhotoSubmitting=true;this.limePhotoSentAt=this.net.now();this.net.room.send('limePhotoSubmit',{vehicleId:this.limePhotoPending,roundStartedAt:this.net.room.state.startedAt});this.syncLock();}}));
   this.finance=this.own(createFinanceGuy(this.root,world,solver,{onComplete:()=>this.syncLock(),uiRoot,
    placement:{...placements.finance,...C.NPC_LAYOUT.finance,fixedSite:C.NPC_LAYOUT.finance.position,fixedAccess:C.NPC_LAYOUT.finance.access}}));
   this.tourists=this.own(createTouristPhoto(this.root,world,solver,{capture,onComplete:()=>this.syncLock(),uiRoot,renderCanvas:this.canvas,
    location:new THREE.Vector3(placements.tourists.position[0],0,placements.tourists.position[1]),viewpoint:new THREE.Vector3(placements.tourists.viewpoint[0],0,placements.tourists.viewpoint[1])}));
   this.property=this.own(createPrivatePropertyEncounter(this.root,world,new THREE.Vector3(),0,solver,{uiRoot}));
   this.karambit=this.own(await createKarambit(camera,{uiRoot,onStrike:()=>this.strikeKnife()}));
   if(this.abort.signal.aborted){this.cleanupFeatures();return;}
   this.scooter=this.own(createBridgeScooter(this.root,world,{placement:{...placements.scooterEncounter,...C.NPC_LAYOUT.scooter},shortArrival:true,uiRoot,knifeModel:this.karambit.grip,onCollect:()=>{this.net.room.send('collectKarambit');this.karambit.give();if(this.playerView){this.playerView.perspective=0;this.playerView.pitch=0;}this.syncLock();}}));
   this.knifeVictims=this.scooter.riders.map(rig=>({rig,knockdown:createNpcKnockdown(rig,world)}));
   this.own({reset:()=>this.knifeVictims.forEach(p=>p.knockdown.reset())});
   // A short fixed arrival is shared scenery; each client uses the round clock.
   this.limo=this.own(await createInterviewLimo(this.root,world,solver,{uiRoot,renderCanvas:this.canvas,
    playerAppearance:()=>{const player=this.net.room?.state.players.get(this.net.room.sessionId);return {color:player?.color??'#ffffff',character:player?.character??0};},
    placement:{...placements.interview,approachRoad:C.NPC_LAYOUT.interview.approachPoints,fixedLaptop:C.NPC_LAYOUT.interview.laptop,fixedRoad:C.NPC_LAYOUT.interview.points,stopAtRouteEnd:true},
    canCapture:()=>!this.phone.active()&&document.querySelector('#pause')?.hidden!==false,
    onLanding:look=>{if(this.playerView){const facing=new THREE.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');this.playerView.yaw=facing.y;this.playerView.pitch=facing.x;this.playerView.perspective=look.firstPerson?0:1;}},
    landingCamera:(dt,position)=>{if(this.playerView)this.playerView.update({...this.local.body,x:position.x,y:position.y,z:position.z,vx:0,vy:0,vz:0,grounded:true,anim:0},dt);},
    onClose:()=>this.syncLock(),onBoard:()=>{},onArrive:()=>this.send('finish','limousine'),
    onInvitation:()=>this.send('solve','limousine',{answer:'3'}),
    onRejection:()=>{this.janeRejection=true;this.phone.receive({sender:'Jane Street',text:'Unfortunately, we have decided not to go through with your candidacy. Thank you for your interest in Jane Street.',color:'#173d73',actionLabel:'READ REJECTION ↗',onAction:()=>{this.janeRejection=false;this.phone.close();this.limo.readRejection();}});}}));
   this.limo.limo.rotation.reorder('YXZ');
   if(this.abort.signal.aborted){this.cleanupFeatures();return;}
   const catLanding=C.einsteinDestination(C.zurichWorld);
   this.einstein=this.own(await createEinsteinTeleporter(this.root,world,solver,{camera,uiRoot,signal:this.abort.signal,
    placement:{...placements.einstein,fixedActor:C.NPC_LAYOUT.einstein.position,fixedSite:C.NPC_LAYOUT.einstein.site,fixedApproach:C.NPC_LAYOUT.einstein.approach,destinations:catLanding?[{name:'Bench cat',point:[catLanding.x,catLanding.z]}]:[]},
    assetUrl:path=>`${import.meta.env.BASE_URL}models/npcs/${path.split('/').at(-1)}`,onOpen:()=>this.syncLock(),
    onTravel:()=>{if(this.pending)return false;this.send('begin','einstein');return true;}}));
   if(this.abort.signal.aborted){this.cleanupFeatures();return;}
   batchStaticNpc(this.einstein.actor);batchStaticNpc(this.einstein.portal);batchNpc(this.root);
   skinNpcRigs(this.root,this.skins);
   this.football=this.own(createFootballStand(this.root,world,{camera:this.camera,placement:C.NPC_LAYOUT.football,uiRoot,onReward:()=>this.onFootballReward?.(),onClose:()=>{this.syncLock();if(this.local.enabled)this.onResume?.();}}));
   this.cat=this.own(createCatBench(this.root,world,solver,{camera:this.camera,placement:C.NPC_LAYOUT.cat,uiRoot,onClose:()=>{this.syncLock();if(this.local.enabled)this.onResume?.();}}));
   await this.cat.ready;
   if(this.cat.state().assetError)throw Error(this.cat.state().assetError);
   if(this.abort.signal.aborted){this.cleanupFeatures();return;}
   const bikeResponse=await fetch(`${import.meta.env.BASE_URL}models/publibike.glb`,{signal:this.abort.signal});
   if(!bikeResponse.ok)throw Error(`Singing cyclist bike failed to load (${bikeResponse.status})`);
   const {scene:singingBike}=await new GLTFLoader().parseAsync(await bikeResponse.arrayBuffer(),'');
   if(this.abort.signal.aborted){disposeOwnedObject(singingBike);this.cleanupFeatures();return;}
   singingBike.userData.wheels=['RearWheel','FrontWheel'].map(name=>singingBike.getObjectByName(name));
   if(singingBike.userData.wheels.some(w=>!w)){disposeOwnedObject(singingBike);throw Error('Singing cyclist bike is missing wheel pivots');}
   this.cyclist=this.own(createCyclingKid(this.root,world,solver,()=>singingBike,{position:C.NPC_LAYOUT.singingCyclist.position,uiRoot}));
   this.tiki=this.own(await createTikiPerformer(this.root,world,solver,{placement:C.NPC_LAYOUT.tikiPerformer,signal:this.abort.signal}));
   if(this.abort.signal.aborted){this.cleanupFeatures();return;}
   this.michael=this.own(await createMichaelJackson(this.root,world,solver,{placement:C.NPC_LAYOUT.michaelJackson,signal:this.abort.signal}));
   if(this.abort.signal.aborted){this.cleanupFeatures();return;}
   this.michaelChallenge=this.own(createMichaelChallenge({...this.michael,local:this.local},{net:this.net,uiRoot,onChange:()=>this.syncLock(),onClose:()=>this.onResume?.()}));
  }catch(error){this.cleanupFeatures();disposeOwnedObject(this.root);this.ui.remove();throw error;}
 }
 get active(){return !!this.pending||!!this.travel||!!this.limePhotoPending||!this.message.hidden||this.features.some(f=>f.active?.()&&f!==this.limo)||!!this.limo?.modal()||!!this.limo?.riding();}
 // Compatibility accessors only; the encounter continues to own camera/input.
 get ridingVehicle(){return !!this.limo?.riding()&&this.message.hidden&&!this.pending;}
 get ridePose(){const car=this.limo?.limo;return this.ridingVehicle&&car?{id:'npc-limousine',x:car.position.x,y:car.position.y,z:car.position.z,rotY:car.rotation.y+Math.PI}:null;}
 get nearbyInteraction(){return !!this.interactionPrompt;}
 get phoneOpen(){return this.phone.active();}
 get hideAvatar(){return this.active&&!this.currentPoly();}
 currentPoly(){return this.poly.get(this.local.body.vehicleId);}
 nearbyPolyPassenger(pair=this.currentPoly()){
  if(!pair)return null;
  pair.car.updateWorldMatrix(true,true);
  const direction=this.camera.getWorldDirection(new THREE.Vector3()),eye=this.camera.position;
  const score=person=>{const target=person.actor.localToWorld(new THREE.Vector3(0,1.45,0)),offset=target.sub(eye);return direction.dot(offset.clone().normalize())*4-offset.length()*.35;};
  return [pair.kid,pair.eater].filter(person=>person.near(this.position)).sort((a,b)=>score(b)-score(a))[0]??null;
 }
 showMessage(kind,text,button){this.message.dataset.kind=kind;this.message.querySelector('p').textContent=text;this.message.querySelector('button').textContent=button;this.message.hidden=false;this.message.querySelector('button').focus();this.syncLock();}
 send(action,kind,extra={}){
  if(!this.net.canPlay||this.pending)return;
  if(action==='solve'&&!this.local.body.vehicleId)this.net.room.send('move',C.packMove(this.local.body));
  this.pending={action,kind,at:this.net.now(),source:this.position.clone()};this.net.room.send('npc',{action,kind,roundStartedAt:this.net.room.state.startedAt,...extra});this.syncLock();
 }
 result(result){
  if(this.abort.signal.aborted||!this.pending||result.roundStartedAt!==this.net.room?.state.startedAt||result.kind!==this.pending.kind||result.action!==this.pending.action)return;
  const pending=this.pending;this.pending=null;
  if(!result.ok){if(pending.action==='finish'&&this.travel){this.retryAt=this.net.now()+300;return;}this.travel=null;this.notice(result.message);if(result.kind==='einstein')this.einstein?.reject();if(result.kind==='limousine'&&['begin','solve'].includes(pending.action))this.limo?.reset();if(result.kind==='property')this.property?.reset();this.syncLock();return;}
  if(result.action==='solve')this.phone.receive({sender:'Jane Street',text:'You’re invited to interview at ETH. Request your complimentary helicopter below.',color:'#173d73',actionLabel:'SEND MY HELICOPTER ↗',onAction:()=>{this.phone.close();this.limo?.requestRide();this.syncLock();}});
  else if(result.action==='begin'){
   this.travel={kind:result.kind,target:new THREE.Vector3(result.target.x,result.target.y,result.target.z),source:pending.source.clone(),confirmed:false};
   if(result.kind==='einstein'){
    this.einstein.markTravel([result.target.x,result.target.z]);const sourceView={position:this.camera.position.clone(),rotation:this.camera.quaternion.clone()};
    this.camera.position.copy(this.travel.target).add(new THREE.Vector3(0,1.6,0));this.camera.up.set(0,1,0);this.camera.rotation.set(0,(result.facing??this.local.body.rotY)+Math.PI,0);
    this.transition.start(this.travel.source,this.travel.target,sourceView);
   }else if(result.kind==='limousine'){this.limo.setLanding(this.travel.target);this.limo.interact(this.position);}
   else this.property.maybeStart(this.travel.source,true,this.travel.target,this.camera);
  }else if(result.action==='finish'){
   if(result.target)Object.assign(this.local.body,result.target,{vx:0,vy:0,vz:0,anim:0,grounded:true});this.travel=null;
   if(Number.isFinite(result.facing)){this.local.body.rotY=result.facing;this.playerView.yaw=result.facing-Math.PI;this.playerView.pitch=0;this.local.clear();}
  }
  this.syncLock();
 }
 notice(text){this.hint.textContent=text;this.noticeUntil=this.net.now()+4000;this.hint.hidden=false;}
 mapMarkers(){
  const markers=[],add=(label,p)=>{if(p)markers.push({label,x:p.x??p[0],z:p.z??p[2]??p[1]});};
  if(this.finance&&!this.finance.state().used)add('Finance Guy',this.finance.actor.position);
  if(this.michael)add('Michael Jackson',this.michael.center);
  if(this.tiki)add('Tiki Tiki performer',this.tiki.center);
  if(this.cyclist)add('Singing cyclist',this.cyclist.group.position);
  if(this.football)add('Tim Gio',this.football.actor.getWorldPosition(new THREE.Vector3()));
  if(this.cat)add('Bench cat',this.cat.site);
  if(this.einstein)add('Albert Einstein',this.einstein.actor.position);
  if(this.limo&&!this.limo.state().solved)add('Jane Street laptop',this.limo.laptop.position);
  if(this.limo?.state().phase==='waiting'){const p=this.limo.state().pickup;add('Helicopter pilot',{x:p[0],z:p[2]});}
  if(this.scooter&&!this.scooter.state().playing)add('Scooter riders',this.scooter.group.position);
  if(this.tourists?.group.visible)add('Tourist photos',this.tourists.state().meetingPoint);
  const state=this.net.room?.state.npcs?.get(this.net.room.sessionId);
  if(!state?.ticketCount)add('Polybahn ticket machine',C.ticketSite(C.zurichWorld));
  return markers;
 }
 playMapTeleport(from,target){
  const sourceView={position:this.camera.position.clone(),rotation:this.camera.quaternion.clone()};
  const to=new THREE.Vector3(target.x,target.y,target.z);
  Object.assign(this.local.body,target,{vx:0,vy:0,vz:0,grounded:true});
  this.camera.position.copy(to).add(new THREE.Vector3(0,1.6,0));this.camera.up.set(0,1,0);this.camera.rotation.set(0,this.local.body.rotY+Math.PI,0);
  this.adminTeleport=true;this.transition.start(new THREE.Vector3(from.x,from.y,from.z),to,sourceView);this.syncLock();
 }
 get rideMouseCapture(){return !this.phone.active()&&(this.pending?.kind==='limousine'&&['begin','finish'].includes(this.pending.action)||['boarding','takeoff','driving','arriving','stopped','rejection-read','parachuting','landing'].includes(this.limo?.state().phase));}
 syncLock(){
  const active=this.active;
  if(active&&!this.saved){this.saved={fov:this.camera.fov,up:this.camera.up.clone(),enabled:this.local.enabled};this.local.clear();this.local.body.vx=this.local.body.vy=this.local.body.vz=0;if(!this.rideMouseCapture){this.onSuspend?.();if(document.pointerLockElement===this.canvas)document.exitPointerLock();}}
  // Opening another UI while a ride is already locked must release capture too.
  if(active&&!this.rideMouseCapture&&document.pointerLockElement===this.canvas){this.onSuspend?.();if(document.pointerLockElement===this.canvas)document.exitPointerLock();}
  const paused=document.querySelector?.('#pause')?.hidden===false;
  for(const panel of this.ui?.children??[])panel.inert=paused||(panel.id!=='game-phone'&&this.phone?.active());
  if(!active){this.polyCameraEye=null;}
  if(!active&&this.saved){this.camera.fov=this.saved.fov;this.camera.up.copy(this.saved.up);this.camera.updateProjectionMatrix();if(this.saved.enabled&&this.net.canPlay){this.local.enabled=true;this.local.clear();this.canvas.focus();}this.saved=null;}
  this.net.npcPaused=this.active&&!this.local.body.vehicleId;if(active){this.local.enabled=false;this.local.clear();}
 }
 get nearbyTicket(){return !this.local.body.vehicleId&&C.nearTicket(this.local.body,C.zurichWorld);}
 get interactionPrompt(){
  this.position.set(this.local.body.x,this.local.body.y,this.local.body.z);
  const pair=this.currentPoly();
  if(pair){const person=this.nearbyPolyPassenger(pair);return person?{icon:'person',label:person===pair.kid?'Talk to 6–7 kid':'Talk to food enthusiast'}:null;}
  if(this.local.body.vehicleId)return null;
  const laptop=this.limo?.laptop.position,pickup=this.limo?.state().pickup;
  if(this.cat?.near(this.position))return {icon:'person',label:'Pet the cat'};
  if(this.football?.near(this.position))return {icon:'person',label:'Talk to Tim Gio'};
  if(this.michaelChallenge?.near(this.position))return {icon:'person',label:'Talk to Michael Jackson'};
  if(this.limo?.state().phase==='waiting'&&this.position.distanceTo(new THREE.Vector3(...pickup))<9)return {icon:'cart',label:'Board your helicopter'};
  if(this.nearbyTicket)return {icon:'polybahn',label:'Buy Polybahn ticket'};
  const einstein=this.einstein?.near(this.position);
  if(einstein)return {icon:'person',label:einstein.replace(/^E:\s*/,'').toLowerCase().replace(/^./,c=>c.toUpperCase()).replace('albert einstein','Albert Einstein')};
  if(laptop&&this.limo?.state().phase==='idle'&&this.position.distanceTo(laptop)<3)return {icon:'computer',label:'Use Jane Street computer'};
  if(this.scooter?.canTalk(this.position))return {icon:'person',label:'Talk to the scooter riders'};
  return null;
 }
 canUseKarambit(){return !!this.karambit?.owns()&&!this.active&&this.local.enabled&&this.net.canPlay&&!this.local.body.vehicleId&&!this.local.body.bagId&&this.local.body.knockdownUntil<=this.net.now();}
 toggleKarambit(){if(!this.canUseKarambit())return;this.karambit.toggle();if(this.karambit.occupiesHands()&&this.playerView)this.playerView.perspective=0;}
 attackKarambit(){if(this.canUseKarambit()&&this.playerView?.perspective===0&&this.local.body.attackReadyAt<=this.net.now())this.karambit.attack();}
 strikeKnife(){
  this.local.punch(true);
  if(this.scooter?.state().phase!=='parked')return false;
  const origin=this.camera.getWorldPosition(new THREE.Vector3()),direction=this.camera.getWorldDirection(new THREE.Vector3()),end=origin.clone().addScaledVector(direction,1.7);
  const candidates=(this.knifeVictims??[]).filter(p=>p.rig.player.visible&&!p.knockdown.active()).map(p=>({p,center:p.rig.player.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.9,0))})).sort((a,b)=>a.center.distanceTo(origin)-b.center.distanceTo(origin));
  for(const {p,center} of candidates){const offset=center.clone().sub(origin);if(offset.length()>2.2||offset.clone().normalize().dot(direction)<.6)continue;const ray=new THREE.Raycaster(origin,offset.clone().normalize(),.05,Math.max(.05,offset.length()-.15));if(ray.intersectObjects(this.world.buildings,false).length)continue;if(p.knockdown.strike(origin,end,direction.clone().multiplyScalar(14)))return true;}
  return false;
 }
 interact(){
  if(!this.net.canPlay||this.active||this.local.body.knockdownUntil>this.net.now())return false;
  this.position.set(this.local.body.x,this.local.body.y,this.local.body.z);
  const pair=this.currentPoly();if(pair){const person=this.nearbyPolyPassenger(pair);if(!person)return false;this.polyCameraEye=capturePolybahnMenuEye(pair.car,this.camera,this.position);const handled=person.interact(this.position);this.syncLock();return handled;}
  if(this.local.body.vehicleId)return false;
  if(this.limo?.state().phase==='waiting'&&this.position.distanceTo(new THREE.Vector3(...this.limo.state().pickup))<9){this.send('begin','limousine');return true;}
  const handled=this.cat?.interact(this.position)||this.football?.interact(this.position)||this.michaelChallenge?.interact(this.position)||this.ticketMachine?.interact(this.position)||this.einstein?.interact(this.position)||this.limo?.interact(this.position)||this.scooter?.interact(this.position);
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
   if(!this.inspector){this.inspector=this.own(createPolybahnInspector(car,{scene:this.root,world:this.world,solver:this.solver,stationPosition:new THREE.Vector3(placements.polybahnInspector.position[0],0,placements.polybahnInspector.position[1]),stationHeading:placements.polybahnInspector.heading,uiRoot:this.ui,onComplete:()=>this.syncLock()}));batchNpc(this.inspector.actor);skinNpcRigs(this.inspector.actor,this.skins);}
  }
 }
 update(dt,available){
  if(this.abort.signal.aborted)return;
  const playable=this.net.canPlay,state=this.net.room?.state;
  const paused=document.querySelector('#pause')?.hidden===false;
  this.cat?.tick(dt,playable&&!paused&&!this.phone.active());
  this.local.movementMultiplier=this.cat?.speedMultiplier()??1;
  if((this.lastPlayable&&!playable)||state&&state.startedAt!==this.round){this.reset();this.round=state?.startedAt??0;}this.lastPlayable=playable;
  const phoneVisible=playable&&!this.externalPhoneBusy?.();this.ui.querySelector('#game-phone').hidden=!phoneVisible;if(!phoneVisible&&this.phone.active())this.phone.close();
  this.phone.update(dt,phoneVisible,{enabled:state?.moodleEnabled!==false});this.phone.syncQuiz({enabled:playable&&state?.moodleEnabled!==false,id:state?.moodleEventId,question:state?.moodleQuestionIndex,deadline:state?.moodleDeadline??0,now:this.net.now()});this.ui.querySelector('#phone-toggle').hidden=!playable;this.moodleSettings.hidden=state?.hostId!==this.net.room?.sessionId;this.moodleSettings.querySelector('input').checked=state?.moodleEnabled!==false;
  this.root.visible=playable;this.attachPoly();this.position.set(this.local.body.x,this.local.body.y,this.local.body.z);
  const pair=this.currentPoly();for(const [id,p] of this.poly){p.kid.update(dt,playable&&this.local.body.vehicleId===id,!!this.inspector?.active(),this.position);p.eater.update(dt,playable&&this.local.body.vehicleId===id,this.inspector?.active()||p.kid.active(),this.position);}
  if(!playable){this.hint.hidden=true;this.boundaryWarning.hidden=true;return;}
  const own=state.npcs?.get(this.net.room.sessionId);
  if(this.ticketRequest&&this.net.now()-this.ticketRequest.at>5000){this.ticketRequest.resolve(false);this.ticketRequest=null;this.notice('Ticket machine timed out. Try again.');}
  this.ticketMachine?.update(dt);this.ticketMachine?.updateInventory(available&&!this.active&&!this.local.body.vehicleId);
  if(own?.teleportUsed&&this.einstein?.state().chargesRemaining)this.einstein.markTravel([own.targetX,own.targetZ]);
  if(this.travel){const own=state.npcs?.get(this.net.room.sessionId);if(own?.kind===this.travel.kind)this.travel.confirmed=true;else if(this.travel.confirmed&&!this.pending){this.reset();this.notice('The encounter ended. You can continue playing.');}}
  if(this.local.body.knockdownUntil>this.net.now()&&this.active&&!this.travel&&!this.limePhotoPending)this.reset();
  if(this.pending&&this.net.now()-this.pending.at>7000){const kind=this.pending.kind;this.net.room.send('npc',{action:'cancel',kind,roundStartedAt:state.startedAt});this.pending=null;this.travel=null;this.reset();this.notice('Encounter timed out. Try again.');}
  if(this.retryAt&&this.net.now()>=this.retryAt){this.retryAt=0;if(this.travel)this.send('finish',this.travel.kind);}
  if(completedUnticketedPolybahnRide(this.previousPoly,this.net.now())&&!this.local.body.vehicleId&&available&&!this.active&&!this.inspected&&this.inspector&&crossesStationDoorway(this.lastStationPosition,this.position,placements.polybahnInspector.doorway)){
   this.inspected=true;this.inspector.start(this.position);
   this.previousPoly=null;
  }
  if(this.previousPoly&&!this.local.body.vehicleId&&this.net.now()>=this.previousPoly.arrival-100){
   const upper=C.polybahnPlatforms[1];
   if(this.previousPoly.ticketed||Math.hypot(this.position.x-upper.x,this.position.z-upper.z)>40)this.previousPoly=null;
  }
  this.lastStationPosition=this.position.clone();
  if(pair){const vehicle=state.vehicles.get(this.local.body.vehicleId);if(vehicle?.traveling){this.inspected=false;this.previousPoly={id:this.local.body.vehicleId,arrival:vehicle.arrivalAt,ticketed:own?.polybahnTicketed===true};}}
  const boundaryBounds=this.world.data.encounterBounds;
  const borderDistance=Math.min(this.position.x-boundaryBounds.minX,boundaryBounds.maxX-this.position.x,this.position.z-boundaryBounds.minZ,boundaryBounds.maxZ-this.position.z);
  const boundaryVehicle=state.vehicles.get(this.local.body.vehicleId);
  this.boundaryWarning.hidden=!available||this.active||borderDistance>30||!!boundaryVehicle&&C.isPassengerVehicle(boundaryVehicle);
  if(available&&!this.active){
   const vehicle=boundaryVehicle;
   if((!vehicle||!C.isPassengerVehicle(vehicle))&&C.approachingPropertyBoundary(C.zurichWorld,this.local.body))this.send('begin','property');
   if(!this.active&&!this.local.body.vehicleId){this.finance?.maybeStart(this.position);if(!this.finance?.active())this.tourists?.update(this.position,this.camera);}
  }
  this.syncLock();
  if(this.limePhotoSubmitting&&this.net.now()-this.limePhotoSentAt>5000){this.limePhotoSubmitting=false;this.notice('Lime photo submission timed out. Please try again.');}
  if(this.limePhotoPending&&!this.local.body.vehicleId&&!this.limePhotoSubmitting&&!this.limePhoto?.active()){
   const scooter=this.vehicles.items.get(this.limePhotoPending);if(scooter)this.limePhoto?.start(this.position,this.camera,scooter.mesh);
  }
  this.limePhoto?.update(this.position);
  this.finance?.update(dt,this.position,this.camera);
  if(this.tourists?.active())this.tourists.update(this.position,this.camera);
  this.einstein?.update(dt);this.scooter?.update(dt,this.position,true,{elapsed:state.scooterArrivalAt?(this.net.now()-state.scooterArrivalAt)/1000:-1});this.scooter?.updateConversation(dt,this.position,this.camera);
  this.limo?.update(dt,this.position,this.camera);this.inspector?.update(dt,this.camera);
  if(this.property?.update(dt,this.position,this.camera))this.send('finish','property');
  this.football?.update(dt,{listener:this.position,enabled:playable,muted:this.active&&!this.football.active(),paused:document.querySelector('#pause')?.hidden===false});
  if(!paused&&!this.phone.active())this.cat?.update(dt);
  this.cyclist?.update(dt,this.position,playable&&!paused&&!this.active);
  this.tiki?.update(dt,this.position,{active:playable,muted:this.active});
  this.michael?.update(dt,this.position,{active:playable,muted:this.active});this.michaelChallenge?.update();
  this.transition.update(dt);
  if(this.travel?.kind==='limousine'){
   Object.assign(this.local.body,{x:this.position.x,y:this.position.y,z:this.position.z,vx:0,vy:0,vz:0});
  }
  if(this.limo?.limo.visible&&this.net.now()-this.lastPose>=100){this.lastPose=this.net.now();const car=this.limo.limo;this.net.room.send('npcPose',{roundStartedAt:state.startedAt,car:[car.position.x,car.position.y,car.position.z,car.rotation.y,car.rotation.x],parachuting:this.limo.parachute.visible,player:this.travel?.kind==='limousine'?[this.position.x,this.position.y,this.position.z,car.rotation.y+Math.PI]:undefined});}
  for(const [id,npc] of state.npcs??[]){if(id===this.net.room.sessionId)continue;let car=this.remoteLimos.get(id);if(npc.limoVisible&&this.limo){if(!car){car=this.limo.limo.clone(true);this.root.add(car);this.remoteLimos.set(id,car);}car.visible=true;car.position.set(npc.limoX,npc.limoY,npc.limoZ);car.rotation.set(npc.limoPitch,npc.limoYaw,0,'YXZ');animateHelicopter(car,dt);let canopy=car.getObjectByName('Remote interview parachute');if(!canopy){canopy=this.limo.parachute.clone(true);canopy.name='Remote interview parachute';car.add(canopy);}canopy.visible=npc.parachuting===true;const p=state.players.get(id);if(canopy.visible&&p){car.updateMatrixWorld(true);canopy.position.copy(car.worldToLocal(new THREE.Vector3(p.x,p.y,p.z)));canopy.quaternion.copy(car.quaternion).invert();canopy.scale.setScalar(1);}}else if(car)car.visible=false;}
  for(const [id,car] of this.remoteLimos)if(!state.npcs?.has(id)){car.removeFromParent();this.remoteLimos.delete(id);}
  const dialogue=pair?.kid.active()?pair.kid:pair?.eater.active()?pair.eater:null;
  if(pair&&dialogue){const view=dialogue.dialogueView(this.position,this.polyCameraEye);this.camera.position.copy(view.eye);this.camera.up.copy(view.up);this.camera.lookAt(view.target);}
  this.syncLock();
  this.karambit?.update(dt,playable&&this.local.enabled&&!this.active&&!this.local.body.vehicleId&&this.playerView?.perspective===0,Math.hypot(this.local.body.vx,this.local.body.vz)>.5,this.local.body.anim===C.SLIDE_ANIM,{speed:Math.hypot(this.local.body.vx,this.local.body.vz),grounded:this.local.body.grounded,verticalSpeed:this.local.body.vy,yaw:this.playerView?.yaw??0,pitch:this.playerView?.pitch??0});
  if(playable)this.knifeVictims?.forEach(p=>p.knockdown.update(dt));
  for(const [actor,update] of this.skins){if(!actor.parent)this.skins.delete(actor);else update();}
  // E hints are owned by the shared action toolbar. Keep only temporary notices here.
  if(this.net.now()>=this.noticeUntil)this.hint.hidden=true;
 }
 reset(){
  this.adminTeleport=false;
  if(this.ticketRequest){this.ticketRequest.resolve(false);this.ticketRequest=null;}
  for(const car of this.remoteLimos.values())car.visible=false;
  this.janeRejection=false;this.limePhotoPending=null;this.limePhotoSubmitting=false;this.pending=null;this.travel=null;this.retryAt=0;this.previousPoly=null;this.lastStationPosition=null;this.inspected=false;this.boundaryWarning.hidden=true;this.message.hidden=true;
  for(const feature of this.features)feature.reset?.();this.local.movementMultiplier=1;this.syncLock();
 }
 cleanupFeatures(){for(const car of this.remoteLimos.values())car.removeFromParent();this.remoteLimos.clear();for(const feature of this.features.splice(0))feature.dispose?.();this.poly.clear();this.skins.clear();}
 afterRender(){if(!this.abort.signal.aborted)drawPhoneCameraPreviews(this.canvas);}
 dispose(){if(this.abort.signal.aborted)return;const kind=this.travel?.kind??this.pending?.kind;if(kind&&this.net.status==='Connected')this.net.room.send('npc',{action:'cancel',kind,roundStartedAt:this.net.room.state.startedAt});this.reset();this.abort.abort();this.phoneSounds.dispose();this.net.onMoodleResult=undefined;this.net.onLimePhotoRequired=undefined;this.net.onLimePhotoResult=undefined;this.net.onNpcResult=undefined;this.net.onTicketResult=undefined;this.cleanupFeatures();disposeOwnedObject(this.root);this.ui.remove();}
}
