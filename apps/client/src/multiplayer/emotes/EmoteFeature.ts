import * as THREE from 'three';
import { canUseEmote } from '@race/shared';
import { EmoteAudio, type EmoteSound } from './EmoteAudio.ts';
import { createEmoteWheel, type Wheel } from '../../npcPrototype/src/player/emotes/emote-wheel.js';
import '../../npcPrototype/src/player/emotes/emote-wheel.css';
import { dancePose } from '../avatar.ts';
import type { Network } from '../net.ts';
import type { LocalPlayer } from '../localPlayer.ts';
import type { PlayerView } from '../view.ts';

export class EmoteFeature {
 readonly wheel:Wheel;
 private abort=new AbortController();
 private selected:string|null=null;
 private savedPerspective:number|null=null;
 private audio=new EmoteAudio();
 private round=0;
 private ownStarted=0;
 constructor(private net:Network,private local:LocalPlayer,private view:PlayerView,root:HTMLElement,private canUse:()=>boolean,private resume:()=>void){
  this.round=this.net.room?.state.startedAt??0;
  this.wheel=createEmoteWheel(null,{root,canUse:()=>this.available,canChoose:id=>canUseEmote(id,this.unlocked),
   animator:{start:id=>{this.selected=id;return true;},stop:()=>{this.selected=null;},update:()=>{},state:()=>({id:this.selected,active:!!this.selected})},
   onOpen:()=>{this.local.enabled=false;this.local.clear();document.exitPointerLock();},onClose:()=>this.resume(),
   onStart:e=>{if(this.savedPerspective===null)this.savedPerspective=this.view.perspective;this.view.perspective=1;this.ownStarted=this.net.now();this.send(e.id);root.querySelector<HTMLCanvasElement>('canvas')?.focus();},
   onStop:()=>{this.send('');if(this.savedPerspective!==null)this.view.perspective=this.savedPerspective;this.savedPerspective=null;}});
  window.addEventListener('keydown',e=>{
   if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
   if(e.code==='KeyB'&&!this.canUse())return;
   if(this.wheel.keydown(e))e.stopImmediatePropagation();
  },{capture:true,signal:this.abort.signal});
  root.querySelector('canvas')?.addEventListener('pointerdown',()=>this.wheel.stop(),{signal:this.abort.signal});
  window.addEventListener('blur',()=>this.wheel.reset(),{signal:this.abort.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.wheel.reset();},{signal:this.abort.signal});
 }
 private send(id:string){if(this.net.canPlay)this.net.room.send('emote',{id,roundStartedAt:this.net.room.state.startedAt});}
 get unlocked(){return this.net.emotesUnlocked;}
 get available(){return this.net.canPlay&&this.canUse()&&!this.local.body.bagId&&!this.local.body.vehicleId&&this.local.body.grounded&&this.local.body.knockdownUntil<=this.net.now();}
 open(){if(this.available&&!this.opened)this.wheel.keydown(new KeyboardEvent('keydown',{code:'KeyB'}));}
 get opened(){return this.wheel.opened();}
 update(dt:number,mesh:THREE.Group,remotes:Iterable<[string,{mesh:THREE.Group}]>){
  const state=this.net.room?.state;if(!state||state.startedAt!==this.round){this.wheel.reset();this.round=state?.startedAt??0;}
  this.wheel.update(dt);
  const own=state?.players?.get(this.net.room.sessionId);
  if(this.selected&&(this.local.pushing||Math.hypot(this.local.body.vx,this.local.body.vz)>.3||(!this.local.enabled&&!this.opened&&this.net.now()-this.ownStarted>600)||(!own?.emoteId&&this.net.now()-this.ownStarted>600)))this.wheel.stop();
  if(this.selected)dancePose(mesh,this.selected,(this.net.now()-this.ownStarted)/1000);
  const sounds:EmoteSound[]=[];
  if(this.net.canPlay&&this.selected)sounds.push({player:this.net.room.sessionId,id:this.selected,startedAt:own?.emoteId===this.selected?(own.emoteStartedAt??this.ownStarted):this.ownStarted,...this.local.body});
  for(const [id,r] of remotes){const p=state?.players?.get(id);if(p?.emoteId){dancePose(r.mesh,p.emoteId,(this.net.now()-(p.emoteStartedAt??this.net.now()))/1000);if(this.net.canPlay||this.net.spectating)sounds.push({player:id,id:p.emoteId,startedAt:p.emoteStartedAt??this.net.now(),x:r.mesh.position.x,y:r.mesh.position.y,z:r.mesh.position.z});}}
  this.audio.update(sounds,this.net.spectating?this.view.camera.position:this.local.body,this.net.now());
 }
 dispose(){this.wheel.dispose();this.abort.abort();this.audio.dispose();}
}
