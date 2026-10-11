import {applyAwpInspect} from './awpInspect.ts';
import {applyAwpReload} from './awpReload.ts';
import {AwpSounds} from './AwpSounds.ts';
import {applyAwpBoltCycle} from './awpBolt.ts';
import {createAwpRack} from './awpRack.ts';
import {NerfDarts} from './nerfDarts.ts';
import './awp.css';
import * as THREE from 'three';
import {AWP_RACKS,AWP_COOLDOWN_MS,AWP_MAGAZINE,AWP_RELOAD_MS,AWP_INSPECT_MS,packMove,type AwpShot} from '@race/shared';
import type {Network} from '../net.ts';
import type {LocalPlayer} from '../localPlayer.ts';
import {createNerfAwp,disposeAwp} from './awpModel.ts';
export class AwpFeature {
 readonly ready:Promise<void>;private sounds:AwpSounds;
 private inspectPosition=new THREE.Vector3();private inspectRotation=new THREE.Quaternion();
 private rack=createAwpRack();private hadOwned=false;
 private model=createNerfAwp();private abort=new AbortController();private room?:Network['room'];private unsubscribe?:()=>void;
 private equipped=false;private next=0;private round=0;private recoil=0;private scoped=false;private baseFov=60;private audio?:AudioContext;
 private ammo=document.createElement('div');
 private reticle=document.createElement('div');private marker=0;private remotes=new Map<string,THREE.Group>();
 private darts:NerfDarts;private boltStartedAt=-Infinity;private resumeScope=false;private remoteBolts=new Map<string,number>();
 constructor(private scene:THREE.Scene,private camera:THREE.PerspectiveCamera,private net:Network,private local:LocalPlayer,private canUse:()=>boolean,private onEquip:()=>void,getAvatar:(id:string)=>THREE.Group|undefined){
  this.sounds=new AwpSounds(()=>this.audio??=new AudioContext());this.ready=this.sounds.ready;
  this.darts=new NerfDarts(scene,getAvatar);
  scene.add(this.rack);
  camera.add(this.model);this.model.visible=false;
  this.reticle.className='awp-reticle';this.reticle.innerHTML='<span class="awp-cross">+</span><div class="awp-scope-blur"></div><div class="awp-scope-lens"><svg viewBox="0 0 640 640" aria-hidden="true"><path d="M0 320h295m50 0h295M320 0v295m0 50v295" stroke="#09111a" stroke-width="1.5"/><path d="M0 320h180m280 0h180M320 460v180" stroke="#09111a" stroke-width="4"/><path d="M305 370h30m-25 45h20m-15 40h10M230 313v14m-40-14v14m220-14v14m40-14v14" stroke="#09111a" stroke-width="1.5"/></svg></div>';document.body.append(this.reticle);
  this.ammo.className='awp-ammo';document.body.append(this.ammo);
  window.addEventListener('contextmenu',e=>{if(this.occupiesHands)e.preventDefault();},{signal:this.abort.signal});
  window.addEventListener('mousedown',e=>{if(e.button===2&&this.occupiesHands&&this.available){e.preventDefault();this.toggleScope();}},{signal:this.abort.signal});
  window.addEventListener('keydown',e=>{if(e.defaultPrevented||e.repeat||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||!this.available)return;if(e.code==='Digit6'){this.toggle();e.preventDefault();e.stopImmediatePropagation();}else if(e.code==='KeyQ'&&this.occupiesHands){this.toggleScope();e.preventDefault();e.stopImmediatePropagation();}else if(e.code==='KeyR'&&this.occupiesHands){this.reload();e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal:this.abort.signal});
 }
 get eligible(){return (this.player?.droneCallUntil??0)<=this.net.now()&&this.net.canPlay&&this.local.enabled&&this.canUse()&&!this.local.body.vehicleId&&!this.local.body.bagId&&this.local.body.knockdownUntil<=this.net.now()&&(this.local.body.moodleSitUntil??0)<=this.net.now()&&!this.net.room?.state.players.get(this.net.room.sessionId)?.emoteId;}
 get owned(){return this.player?.awpOwned===true;}
 get available(){return this.owned&&this.eligible;}
 get nearby(){const p=this.local.body;return !this.owned&&this.eligible&&AWP_RACKS.some(({approach:[x,y,z]})=>Math.hypot(p.x-x,p.y-y,p.z-z)<=1.7);}
 interact(){if(!this.nearby)return false;this.net.room.send("move",packMove(this.local.body));this.send("pickup");return true;}
 get occupiesHands(){return this.owned&&this.equipped&&!this.local.body.bagId&&!this.local.body.vehicleId;}
 private get player(){return this.net.room?.state?.players?.get(this.net.room.sessionId);}
 get inspecting(){return (this.player?.awpInspectUntil??0)>this.net.now();}
 get reloading(){return (this.player?.awpReloadUntil??0)>this.net.now();}
 get canFire(){return !this.inspecting&&this.occupiesHands&&this.available&&(this.player?.awpAmmo??0)>0&&!this.reloading&&this.net.now()>=this.next;}
 get cycling(){return this.net.now()<this.boltStartedAt+AWP_COOLDOWN_MS;}
 get canZoom(){return !this.inspecting&&this.occupiesHands&&this.available&&!this.cycling&&!this.reloading;}
 get canReload(){return !this.inspecting&&!this.cycling&&this.occupiesHands&&this.available&&!this.reloading&&(this.player?.awpAmmo??AWP_MAGAZINE)<AWP_MAGAZINE&&(this.player?.awpReserve??0)>0;}
 reload(){if(this.canReload){this.scope(false);this.send('reload');}}
 toggle(){if(!this.available)return;if(this.equipped)this.holster();else{this.equipped=true;this.onEquip();this.send('equip');}}
 holster(){if(!this.equipped)return;this.equipped=false;this.resumeScope=false;this.scope(false);if(this.net.room)this.send('holster');}
 private send(action:string,aim?:number[]){this.net.room.send('awp',{action,aim,roundStartedAt:this.net.room.state.startedAt});}
 applyCamera(){if(this.scoped&&this.available){this.camera.fov=25;this.camera.updateProjectionMatrix();}}
 toggleScope(){if(this.canZoom)this.scope(!this.scoped);}
 private scope(value:boolean){if(value===this.scoped)return;if(value)this.baseFov=this.camera.fov;this.scoped=value;this.camera.fov=value?25:this.baseFov;this.camera.updateProjectionMatrix();}
 fire(){if(!this.canFire)return;this.boltStartedAt=this.net.now();this.next=this.boltStartedAt+AWP_COOLDOWN_MS;this.resumeScope=this.scoped;this.scope(false);this.net.room.send('move',packMove(this.local.body));this.send('fire',this.camera.getWorldDirection(new THREE.Vector3()).toArray());this.recoil=.2;
  this.sounds.fire();
 }
 private shot(data:AwpShot){if(data.roundStartedAt!==this.net.room.state.startedAt)return;let start=data.start;if(data.from===this.net.room.sessionId&&!this.scoped){this.model.updateWorldMatrix(true,false);start=this.model.localToWorld(new THREE.Vector3(0,.015,-.9)).toArray();}if(data.from!==this.net.room.sessionId)this.remoteBolts.set(data.from,this.net.now());this.darts.launch(data,start);if(data.from===this.net.room.sessionId&&data.hit)this.marker=.25;}
 update(dt:number){
  if(this.room!==this.net.room){this.unsubscribe?.();this.scope(false);this.equipped=false;this.hadOwned=false;this.boltStartedAt=-Infinity;this.resumeScope=false;this.remoteBolts.clear();this.sounds.reset();this.darts.clear();this.room=this.net.room;if(this.room)this.unsubscribe=this.room.onMessage<AwpShot>('awpShot',d=>this.shot(d));}
  const round=this.net.room?.state.startedAt??0;if(round!==this.round){this.round=round;this.darts.clear();this.equipped=false;this.hadOwned=false;this.boltStartedAt=-Infinity;this.resumeScope=false;this.remoteBolts.clear();this.sounds.reset();this.scope(false);this.next=0;}
  if(this.owned&&!this.hadOwned){const hanging=this.rack.getObjectByName('Hanging Nerf AWP')!;this.camera.updateWorldMatrix(true,false);hanging.getWorldPosition(this.inspectPosition);this.camera.worldToLocal(this.inspectPosition);this.inspectRotation.copy(this.camera.getWorldQuaternion(new THREE.Quaternion())).invert().multiply(hanging.getWorldQuaternion(new THREE.Quaternion()));this.equipped=true;this.onEquip();}this.hadOwned=this.owned;this.rack.visible=this.net.canPlay&&!this.owned;
  if(this.equipped&&(this.local.body.bagId||this.local.body.vehicleId))this.holster();
  if(!this.available){this.scope(false);this.resumeScope=false;}
  if(this.resumeScope&&!this.cycling&&this.available){this.resumeScope=false;this.scope(true);}
  const audible=this.occupiesHands&&this.available;
  if(this.cycling)this.sounds.update('bolt',this.boltStartedAt,(this.net.now()-this.boltStartedAt)/1000,audible);
  else if(this.reloading){const until=this.player!.awpReloadUntil!;this.sounds.update('reload',until,(this.net.now()-until+AWP_RELOAD_MS)/1000,audible);}
  else if(!audible)this.sounds.stop();
  this.darts.update(dt);
  this.recoil=Math.max(0,this.recoil-dt);this.marker=Math.max(0,this.marker-dt);
  const progress=this.reloading?1-Math.max(0,(this.player!.awpReloadUntil!-this.net.now())/AWP_RELOAD_MS):0,tilt=this.reloading?Math.sin(Math.PI*progress):0;
  const bolt=this.model.getObjectByName('priming-bolt')!;
  const cycle=applyAwpBoltCycle(this.model,(this.net.now()-this.boltStartedAt)/1000,this.player?.awpAmmo??AWP_MAGAZINE);
  applyAwpReload(this.model,progress,this.player?.awpAmmo??0,this.player?.awpReserve??0,this.reloading);
  if(this.reloading){bolt.position.z=.09+(progress>.75?Math.sin((progress-.75)/.25*Math.PI)*.12:0);}
  this.model.visible=this.occupiesHands&&this.available&&!this.scoped;this.model.position.set(.26+tilt*.02,-.3+tilt*.12+cycle.tilt*.09,-.55+this.recoil*.3);this.model.rotation.set(this.recoil*.25+tilt*.1,-tilt*.2,-tilt*.65-cycle.tilt*.45);
  if(this.inspecting)applyAwpInspect(this.model,(this.net.now()-(this.player!.awpInspectUntil!-AWP_INSPECT_MS))/1000,this.inspectPosition,this.inspectRotation);
  this.ammo.style.display=this.occupiesHands&&this.available?'block':'none';this.ammo.textContent=`${this.player?.awpAmmo??0} / ${this.player?.awpReserve??0}${this.inspecting?' · INSPECTING…':this.reloading?' · REFILLING…':this.cycling?' · PRIMING…':this.canReload?' · R refill':(this.player?.awpAmmo??0)===0?' · OUT OF DARTS':''}`;
  this.reticle.style.display=this.occupiesHands&&this.available?'block':'none';this.reticle.classList.toggle('is-scoped',this.scoped);const cross=this.reticle.firstElementChild as HTMLElement;cross.textContent=this.marker?'×':'+';cross.style.color=this.marker?'#ffb32b':'white';
  for(const [id,p] of this.net.room?.state.players??[]){if(id===this.net.room.sessionId)continue;let model=this.remotes.get(id);if(p.awpEquipped&&!model){model=createNerfAwp();this.remotes.set(id,model);this.scene.add(model);}if(model){model.visible=!!p.awpEquipped&&this.net.canPlay&&!p.vehicleId&&!p.bagId;model.position.set(p.x+Math.cos(p.rotY)*.28,p.y+1.1,p.z-Math.sin(p.rotY)*.28);model.rotation.y=p.rotY+Math.PI;applyAwpBoltCycle(model,(this.net.now()-(this.remoteBolts.get(id)??-Infinity))/1000,p.awpAmmo??AWP_MAGAZINE);applyAwpReload(model,1-Math.max(0,((p.awpReloadUntil??0)-this.net.now())/AWP_RELOAD_MS),p.awpAmmo??0,p.awpReserve??0,(p.awpReloadUntil??0)>this.net.now());}}
  for(const [id,m] of this.remotes)if(!this.net.room?.state.players.has(id)){disposeAwp(m);this.remotes.delete(id);this.remoteBolts.delete(id);}

 }
 dispose(){this.abort.abort();this.unsubscribe?.();this.sounds.dispose();this.darts.dispose();this.scope(false);this.reticle.remove();this.ammo.remove();disposeAwp(this.model);this.rack.traverse(o=>{if(o instanceof THREE.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){const texture=(m as THREE.MeshBasicMaterial).map;texture?.dispose();}}});disposeAwp(this.rack);for(const m of this.remotes.values())disposeAwp(m);void this.audio?.close();}
}
