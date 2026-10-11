import {UavAircraft} from "./uavAircraft.ts";
import {DroneSoundCues,type DroneSound} from './droneSoundCues.ts';
import * as THREE from 'three';
import {DRONE_CALL_MS,DRONE_STREAK_HITS,RoomPhase,type DroneScan,type DroneBlip} from '@race/shared';
import type {Network} from '../net.ts';
import type {LocalPlayer} from '../localPlayer.ts';
import {createDroneTablet,drawDroneTablet} from './droneTablet.ts';
import './drone.css';
export class DroneFeature {
 private aircraft:UavAircraft;
 private progress=document.createElement('div');private prompt=document.createElement('button');private tablet=createDroneTablet();private status=document.createElement('div');private abort=new AbortController();private room?:Network['room'];private unsubscribe?:()=>void;private scan?:DroneScan;private elapsed=0;private displayedScore=0;private targetScore=0;private gainTime=0;private scoreRound=0;private soundCues=new DroneSoundCues();
 constructor(camera:THREE.PerspectiveCamera,private net:Network,private local:LocalPlayer,private canUse:()=>boolean,private prepare:()=>void,private playSound:(sound:DroneSound)=>void=()=>{},scene:THREE.Scene){
  this.aircraft=new UavAircraft(scene);
  camera.add(this.tablet.root);this.tablet.root.visible=false;this.status.className='drone-status';document.querySelector('#race-radar')!.append(this.status);
  this.progress.className='drone-streak-progress';this.progress.innerHTML='<div class=drone-streak-reward><svg viewBox="0 0 24 24" aria-hidden=true><path d="M8 8h8v8H8zM4 4l5 5m6 0 5-5M4 20l5-5m6 0 5 5"/><circle cx="4" cy="4" r="3"/><circle cx="20" cy="4" r="3"/><circle cx="4" cy="20" r="3"/><circle cx="20" cy="20" r="3"/></svg><strong>DRONE</strong><kbd>7</kbd></div><div class=drone-progress-track role=progressbar aria-label="Drone streak points" aria-valuemin=0 aria-valuemax=500><div class=drone-progress-fill></div><div class=drone-progress-ticks></div></div><div class=drone-points><span class=drone-score></span><span class=drone-score-target>/ 500 points</span></div><div class=drone-point-gain hidden></div>';document.body.append(this.progress);
  this.prompt.className='drone-ready-prompt';this.prompt.innerHTML='<span>Press <b>7</b> to call in drone</span><span class=drone-prompt-key><svg viewBox="0 0 24 24" aria-hidden=true><path d="M8 8h8v8H8zM4 4l5 5m6 0 5-5M4 20l5-5m6 0 5 5"/><circle cx=4 cy=4 r="3"/><circle cx=20 cy=4 r="3"/><circle cx=4 cy=20 r="3"/><circle cx=20 cy=20 r="3"/></svg><kbd>7</kbd></span>';this.prompt.hidden=true;this.prompt.type='button';this.prompt.addEventListener('click',()=>this.activate(),{signal:this.abort.signal});document.body.append(this.prompt);
  window.addEventListener('keydown',e=>{if(e.defaultPrevented||e.repeat||e.code!=='Digit7'||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement||(e.target as HTMLElement)?.isContentEditable||!this.canActivate)return;e.preventDefault();e.stopImmediatePropagation();this.activate();},{capture:true,signal:this.abort.signal});
 }
 private get player(){return this.net.room?.state?.players?.get(this.net.room.sessionId);}
 get ready(){return !!this.player?.droneReady;}
 get calling(){return (this.player?.droneCallUntil??0)>this.net.now();}
 get active(){return this.net.canPlay&&(this.player?.droneScanUntil??0)>this.net.now()&&!this.calling;}
 get canActivate(){const p=this.local.body;return this.ready&&!this.active&&!this.calling&&this.net.canPlay&&this.local.enabled&&this.canUse()&&!p.vehicleId&&!p.bagId&&p.knockdownUntil<=this.net.now()&&(p.moodleSitUntil??0)<=this.net.now()&&!this.player?.emoteId;}
 activate(){if(!this.canActivate)return;this.prepare();this.net.room.send('awp',{action:'drone',roundStartedAt:this.net.room.state.startedAt});}
 get blips():DroneBlip[]{if(!this.active||!this.scan||this.scan.endsAt<=this.net.now()||this.scan.roundStartedAt!==this.net.room?.state.startedAt)return [];return this.scan.players.filter(p=>this.net.room.state.players.has(p.id)&&!this.net.room.state.members.get(p.id)?.spectator);}
 get scanStart(){return this.scan?.startedAt??0;}
 update(dt:number){
  this.aircraft.update(this.net.room?.state?.players??[],this.net.now(),this.net.room?.state?.startedAt??0,this.net.room?.state.phase===RoomPhase.Running&&(this.net.canPlay||this.net.spectating));
  if(this.room!==this.net.room){this.unsubscribe?.();this.scan=undefined;this.room=this.net.room;if(this.room)this.unsubscribe=this.room.onMessage<DroneScan>('droneScan',scan=>{if(scan.roundStartedAt===this.net.room.state.startedAt)this.scan=scan;});}
  const visible=this.net.canPlay&&this.local.enabled&&this.canUse()&&this.calling&&this.local.body.knockdownUntil<=this.net.now();this.tablet.root.visible=visible;
  this.elapsed+=dt;if(visible&&this.elapsed>=.04){this.elapsed=0;drawDroneTablet(this.tablet,(this.net.now()-(this.player!.droneCallUntil!-DRONE_CALL_MS))/1000);}
  const show=this.net.canPlay&&!!document.querySelector<HTMLElement>('#pause')?.hidden&&!!document.querySelector<HTMLElement>('#city-map')?.hidden;
  for(const sound of this.soundCues.update({round:this.net.room?.state?.startedAt??0,ready:this.ready,callUntil:this.player?.droneCallUntil??0,scanUntil:this.player?.droneScanUntil??0,sweepAt:this.scan?.at??0},this.net.now(),show&&!document.hidden))this.playSound(sound);
  this.progress.hidden=!show||!this.player?.awpOwned;
  const score=(this.ready?DRONE_STREAK_HITS:(this.player?.droneStreak??0))*100,round=this.net.room?.state?.startedAt??0;
  const gain=this.progress.querySelector('.drone-point-gain') as HTMLElement;
  if(round!==this.scoreRound||score<this.targetScore){this.scoreRound=round;this.displayedScore=score;this.gainTime=0;}
  else if(score>this.targetScore){gain.textContent=`+${score-this.targetScore}`;this.gainTime=1.4;gain.classList.remove('is-counting');void gain.offsetWidth;gain.classList.add('is-counting');}
  this.targetScore=score;this.displayedScore=Math.min(score,this.displayedScore+Math.max(0,dt)*240);this.gainTime=Math.max(0,this.gainTime-dt);gain.hidden=this.gainTime<=0;
  this.progress.querySelector('.drone-score')!.textContent=String(Math.round(this.displayedScore));
  const track=this.progress.querySelector('.drone-progress-track')!;track.setAttribute('aria-valuenow',String(score));
  (this.progress.querySelector('.drone-progress-fill') as HTMLElement).style.height=`${this.displayedScore/5}%`;this.progress.classList.toggle('is-ready',this.ready);
  this.prompt.hidden=!show||!this.ready||this.active||this.calling;this.prompt.disabled=!this.canActivate;
  this.status.hidden=!this.net.canPlay||(!this.ready&&!this.calling&&!this.active&&!(this.player?.droneStreak??0));
  this.status.textContent=this.calling?'DRONE · UPLINKING…':this.active?`DRONE · ${Math.ceil(((this.player?.droneScanUntil??0)-this.net.now())/1000)}s`:this.ready?'DRONE READY · 7':`AWP STREAK · ${this.player?.droneStreak??0}/${DRONE_STREAK_HITS}`;this.status.classList.toggle('is-ready',this.ready);
 }
 dispose(){this.aircraft.dispose();this.abort.abort();this.unsubscribe?.();this.status.remove();this.progress.remove();this.prompt.remove();this.tablet.texture.dispose();const materials=new Set<THREE.Material>();this.tablet.root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});materials.forEach(m=>m.dispose());this.tablet.root.removeFromParent();}
}
