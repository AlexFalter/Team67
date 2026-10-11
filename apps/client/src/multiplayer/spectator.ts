import {Vector3,Euler,type PerspectiveCamera,type Group} from 'three';
import { examPortalPosition } from '@race/shared';
import type {Network} from './net.ts';

/** Spectator camera only: never creates a gameplay body or sends movement. */
export class Spectator {
 private root=document.createElement('section');
 private label=document.createElement('span');
 private hint=document.createElement('small');
 private previous=document.createElement('button');
 private next=document.createElement('button');
 private flight=document.createElement('button');
 private abort=new AbortController();
 private target='';
 private ids:string[]=[];
 private yaw=0;
 private pitch=.35;
 private distance=7;
 private dragging=false;
 private flying=false;
 private shown=false;
 private capturing=false;
 private keys=new Set<string>();
 private focus=new Vector3();
 private position=new Vector3();
 get captureActive(){return this.net.spectating&&this.shown&&this.flying;}
 constructor(private net:Network,private camera:PerspectiveCamera,private canvas:HTMLCanvasElement,backToExam:()=>void=()=>{},resume:()=>void=()=>{}){
  this.root.className='spectator-controls';this.root.hidden=true;this.root.setAttribute('aria-label','Spectator controls');
  this.previous.textContent='←';this.previous.setAttribute('aria-label','Previous player');this.next.textContent='→';this.next.setAttribute('aria-label','Next player');
  this.flight.textContent='Free flight';const exam=document.createElement('button');exam.textContent='Back to exam';
  this.root.append(this.previous,this.label,this.next,this.flight,exam,this.hint);canvas.parentElement!.append(this.root);
  const options={signal:this.abort.signal};this.previous.addEventListener('click',()=>this.cycle(-1),options);this.next.addEventListener('click',()=>this.cycle(1),options);
  this.flight.addEventListener('click',()=>this.toggleFlight(),options);exam.addEventListener('click',()=>{this.release();backToExam();},options);
  document.querySelector('#spectator-exam')?.addEventListener('click',()=>{this.release();backToExam();},options);
  document.querySelector('#spectator-flight')?.addEventListener('click',()=>{this.toggleFlight();resume();},options);
  window.addEventListener('keydown',e=>{
   if(e.defaultPrevented||document.querySelector<HTMLElement>('#pause')?.hidden===false||!this.net.spectating||!this.shown||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLElement&&e.target.isContentEditable)return;
   if(this.flying&&['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight'].includes(e.code)){
    e.preventDefault();e.stopImmediatePropagation();
    this.keys.add(e.code);void this.capture();return;
   }
   if(!this.flying&&['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();this.cycle(e.code==='ArrowLeft'?-1:1);}
  }, {...options,capture:true});
  window.addEventListener('keyup',e=>this.keys.delete(e.code),options);
  canvas.addEventListener('pointerdown',e=>{if(!this.net.spectating||!this.shown||e.button!==0)return;if(this.flying){void this.capture();return;}this.dragging=true;canvas.setPointerCapture(e.pointerId);},options);
  canvas.addEventListener('pointermove',e=>{
   if(!this.net.spectating||!this.shown)return;
   if(this.flying){if(document.pointerLockElement!==canvas)return;this.yaw-=e.movementX*.003;this.pitch=Math.max(-1.5,Math.min(1.5,this.pitch-e.movementY*.003));}
   else if(this.dragging){this.yaw-=e.movementX*.005;this.pitch=Math.max(.1,Math.min(1.2,this.pitch+e.movementY*.005));}
  },options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)canvas.addEventListener(type,()=>{this.dragging=false;},options);
  window.addEventListener('blur',()=>{this.dragging=false;this.keys.clear();},options);
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)this.keys.clear();},options);
  canvas.addEventListener('wheel',e=>{if(!this.net.spectating||!this.shown||this.flying)return;e.preventDefault();this.distance=Math.max(3,Math.min(18,this.distance+e.deltaY*.015));},{...options,passive:false});
 }
 private async capture(){
  if(document.querySelector<HTMLElement>('#pause')?.hidden===false||!this.captureActive||this.capturing||document.pointerLockElement===this.canvas||!document.hasFocus())return;
  this.capturing=true;try{await this.canvas.requestPointerLock();}catch{/* The next movement key or canvas click retries. */}finally{this.capturing=false;}
 }
 private release(){this.keys.clear();this.dragging=false;if(document.pointerLockElement===this.canvas)document.exitPointerLock();}
 private toggleFlight(){
  this.flying=!this.flying;this.keys.clear();this.dragging=false;
  if(this.flying){const facing=new Euler().setFromQuaternion(this.camera.quaternion,'YXZ');this.yaw=facing.y;this.pitch=facing.x;void this.capture();}
  else {this.release();this.pitch=.35;}
 }
 private cycle(direction:number){if(!this.ids.length)return;if(!this.target){this.target=direction>0?this.ids[0]:this.ids[this.ids.length-1];return;}const i=this.ids.indexOf(this.target);this.target=this.ids[(Math.max(0,i)+direction+this.ids.length)%this.ids.length];}
 update(dt:number,remotes:Map<string,{mesh:Group}>,visible=true){
  const shown=this.net.spectating&&visible;
  if(this.shown&&!shown)this.release();
  if(!this.shown&&shown){this.target='';this.yaw=0;this.pitch=.35;this.distance=7;}
  this.shown=shown;this.root.hidden=!shown;
  const settings=document.querySelector<HTMLElement>('#spectator-settings');if(settings)settings.hidden=!shown;
  const flightButton=document.querySelector<HTMLElement>('#spectator-flight');if(flightButton)flightButton.textContent=this.flying?'Follow players':'Free flight';
  if(!shown){this.dragging=false;this.keys.clear();return;}
  if(document.querySelector<HTMLElement>('#pause')?.hidden===false){this.root.hidden=true;this.keys.clear();return;}
  this.flight.textContent=this.flying?'Follow players':'Free flight';
  this.previous.hidden=this.next.hidden=this.flying;
  this.previous.disabled=this.next.disabled=this.ids.length===0;
  if(this.flying){
   this.label.textContent='SPECTATING · FREE FLIGHT';this.hint.textContent='WASD fly · Space up · Shift down · Ctrl faster · Escape menu';
   if(document.pointerLockElement===this.canvas){
    flySpectator(this.camera.position,this.keys,this.yaw,this.pitch,dt);
   }
   this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');this.camera.up.set(0,1,0);this.camera.updateMatrixWorld(true);return;
  }
  this.ids=[...remotes].filter(([,r])=>r.mesh.visible).map(([id])=>id);
  if(this.target&&!this.ids.includes(this.target))this.target='';
  const remote=remotes.get(this.target);
  this.label.textContent=remote?`WATCHING · ${this.net.room.state.members.get(this.target)?.name??'Player'}`:this.ids.length?'SPECTATING · POLYTERRASSE':'SPECTATING · POLYTERRASSE · Waiting for players';
  this.hint.textContent=remote?'← / → switch player · Drag to look · Scroll to zoom':'At Polyterrasse · Select a player to watch';
  if(remote)remote.mesh.getWorldPosition(this.focus);else this.focus.set(examPortalPosition.x,examPortalPosition.y,examPortalPosition.z);
  this.focus.y+=1.4;const horizontal=Math.cos(this.pitch)*this.distance;
  this.position.set(this.focus.x+Math.sin(this.yaw)*horizontal,this.focus.y+Math.sin(this.pitch)*this.distance,this.focus.z+Math.cos(this.yaw)*horizontal);
  this.camera.position.lerp(this.position,1-Math.exp(-Math.max(0,dt)*12));this.camera.up.set(0,1,0);this.camera.lookAt(this.focus);this.camera.updateMatrixWorld(true);
 }
 dispose(){this.release();this.abort.abort();this.root.remove();const settings=document.querySelector<HTMLElement>('#spectator-settings');if(settings)settings.hidden=true;}
}

export function flySpectator(position:Vector3,keys:ReadonlySet<string>,yaw:number,pitch:number,dt:number){
 const forward=new Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
 const right=new Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 const motion=forward.multiplyScalar(Number(keys.has('KeyW'))-Number(keys.has('KeyS'))).addScaledVector(right,Number(keys.has('KeyD'))-Number(keys.has('KeyA')));
 motion.y+=Number(keys.has('Space'))-Number(keys.has('ShiftLeft')||keys.has('ShiftRight'));
 const speed=keys.has('ControlLeft')||keys.has('ControlRight')?30:12;
 position.addScaledVector(motion.clampLength(0,1),Math.max(0,Math.min(dt,.1))*speed);
}
