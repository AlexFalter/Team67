import * as THREE from 'three';
import {packMove} from '@race/shared';
import type {Network} from './net.ts';
import type {LocalPlayer} from './localPlayer.ts';
import {createFootballModel} from '../npcPrototype/src/npcs/football/football-model.js';
import {disposeOwnedObject} from '../npcPrototype/src/shared/runtime/feature-lifecycle.js';
export class FootballFeature {
 private models=new Map<string,THREE.Group>();
 private equipped=false;
 private previous='';
 private round=0;
 private abort=new AbortController();
 private kickAge=0;
 private boot=new THREE.Mesh(new THREE.BoxGeometry(.16,.14,.4),new THREE.MeshStandardMaterial({color:'#25282a'}));
 constructor(private scene:THREE.Scene,private camera:THREE.PerspectiveCamera,private net:Network,private local:LocalPlayer,private canUse:()=>boolean,private onEquip:()=>void){
  this.boot.visible=false;camera.add(this.boot);
  window.addEventListener('keydown',e=>{if(e.defaultPrevented||e.repeat||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||!this.available)return;if(e.code==='Digit4'){this.toggle();e.preventDefault();e.stopImmediatePropagation();}else if(e.code==='KeyF'&&this.occupiesHands){e.preventDefault();e.stopImmediatePropagation();}else if(e.code==='KeyQ'&&this.occupiesHands){this.kick();e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal:this.abort.signal});
 }
 private get owned(){return [...this.net.room?.state.footballs??[]].find(([,b])=>b.owner===this.net.room.sessionId);}
 get owns(){return !!this.owned;}
 get available(){return this.net.canPlay&&this.local.enabled&&this.canUse()&&!this.local.body.vehicleId&&!this.local.body.bagId&&this.local.body.knockdownUntil<=this.net.now()&&(this.local.body.moodleSitUntil??0)<=this.net.now();}
 get occupiesHands(){return this.owns&&this.equipped;}
 get canKick(){return this.available&&this.occupiesHands&&this.kickAge===0;}
 grant(){this.net.room.send('move',packMove(this.local.body));this.net.room.send('football',{action:'reward',roundStartedAt:this.net.room.state.startedAt});}
 toggle(){if(!this.available||!this.owns)return;this.equipped=!this.equipped;if(this.equipped)this.onEquip();}
 holster(){this.equipped=false;}
 kick(){if(!this.canKick)return;const aim=this.camera.getWorldDirection(new THREE.Vector3());this.net.room.send('move',packMove(this.local.body));this.net.room.send('football',{action:'kick',aim:aim.toArray(),roundStartedAt:this.net.room.state.startedAt});this.kickAge=.3;}
 private get nearbyEntry(){const p=this.local.body;return [...this.net.room?.state.footballs??[]].find(([,b])=>!b.owner&&!b.flying&&Math.hypot(p.x-b.x,p.z-b.z)<1.5&&Math.abs(p.y+.22-b.y)<1);}
 get nearby(){return !this.owns&&!!this.nearbyEntry&&!this.local.body.vehicleId;}
 interact(){const entry=this.nearbyEntry;if(!entry||this.owns||!this.available)return false;this.net.room.send('football',{action:'pickup',id:entry[0],roundStartedAt:this.net.room.state.startedAt});return true;}
 update(dt:number){
  const state=this.net.room?.state;if(!state)return;if(state.startedAt!==this.round){this.round=state.startedAt;this.equipped=false;this.previous='';}
  const own=this.owned?.[0]??'';if(own&&own!==this.previous){this.equipped=true;this.onEquip();}this.previous=own;
  if(this.local.body.bagId)this.holster();
  this.kickAge=Math.max(0,this.kickAge-dt);this.boot.visible=this.kickAge>0&&this.available;this.boot.position.set(.22,-.68,-.5-Math.sin(this.kickAge/.3*Math.PI)*.3);this.boot.rotation.x=-Math.sin(this.kickAge/.3*Math.PI)*.8;
  for(const [id,b] of state.footballs??[]){let mesh=this.models.get(id);if(!mesh){mesh=createFootballModel();this.models.set(id,mesh);this.scene.add(mesh);}mesh.visible=this.net.canPlay;
   if(b.owner){const p=state.players.get(b.owner);if(!p){mesh.visible=false;continue;}const local=b.owner===this.net.room.sessionId;mesh.visible=mesh.visible&&(!local||this.equipped&&this.available);const body=local?this.local.body:p;
    const direction=local?this.camera.getWorldDirection(new THREE.Vector3()):new THREE.Vector3(Math.sin(p.rotY),0,Math.cos(p.rotY));direction.y=0;direction.normalize();mesh.position.set(body.x+direction.x*.8,body.y+.22,body.z+direction.z*.8);
   }else{const target=new THREE.Vector3(b.x,b.y,b.z);if(mesh.position.distanceToSquared(target)>100)mesh.position.copy(target);else mesh.position.lerp(target,1-Math.exp(-dt*24));if(b.flying)mesh.rotateX(dt*Math.hypot(b.vx,b.vz)/.22);}
  }
  for(const [id,mesh] of this.models)if(!state.footballs?.has(id)){disposeOwnedObject(mesh);this.models.delete(id);}
 }
 dispose(){this.abort.abort();for(const mesh of this.models.values())disposeOwnedObject(mesh);this.models.clear();disposeOwnedObject(this.boot);}
}
