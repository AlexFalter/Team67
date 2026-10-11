import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FRUIT_STAND,TOMATO_CAPACITY,TOMATO_STAND_SUPPLY,TOMATO_COOLDOWN_MS,type TomatoEvent,type TomatoProjectile} from '@race/shared';
import type {Network} from '../net.ts';
import type {LocalPlayer} from '../localPlayer.ts';
import {disposeOwnedObject} from '../../npcPrototype/src/shared/runtime/feature-lifecycle.js';
import './fruit.css';
export class FruitFeature {
 readonly ready:Promise<void>;private root=new THREE.Group();private stand?:THREE.Group;private asset?:THREE.Group;private held?:THREE.Group;
 private overlay=document.createElement('section');private notice=document.createElement('div');private abort=new AbortController();private disposed=false;
 private supplyMeshes:THREE.InstancedMesh[]=[];
 private shots=new Map<number,{model:THREE.Group;data:TomatoProjectile}>();private room?:Network['room'];private unsubscribe?:()=>void;
 private round=0;private nextThrow=0;private equipped=false;count=0;covered=false;
 constructor(scene:THREE.Scene,private camera:THREE.PerspectiveCamera,private net:Network,private local:LocalPlayer,private canUse:()=>boolean,private onEquip:()=>void){
  this.root.name='Coop apple and tomato stand';scene.add(this.root);
  this.notice.className='fruit-stock';this.notice.hidden=true;document.querySelector('#combat-actions')!.append(this.notice);
  this.overlay.className='tomato-splat';this.overlay.hidden=true;this.overlay.setAttribute('role','alert');
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#bd170c';ctx.fillRect(0,0,1200,800);
  for(let i=0;i<30;i++){const x=(i*379)%1200,y=(i*227)%800,r=90+i%5*23;const g=ctx.createRadialGradient(x-r*.3,y-r*.3,4,x,y,r);g.addColorStop(0,'#ff6b32');g.addColorStop(.5,'#e22a14');g.addColorStop(1,'#861007');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,r,r*.7,i,0,Math.PI*2);ctx.fill();for(let j=0;j<8;j++){ctx.fillStyle='#ffc864';ctx.beginPath();ctx.ellipse(x+Math.sin(j*2.4+i)*r*.55,y+Math.cos(j*2.4+i)*r*.4,4,9,j,0,Math.PI*2);ctx.fill();}}
  this.overlay.append(canvas);const button=document.createElement('button');button.textContent='R · WIPE TOMATO OFF';button.onclick=()=>this.wipe();this.overlay.append(button);document.body.append(this.overlay);
  window.addEventListener('keydown',e=>{if(e.repeat||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||!this.net.canPlay||document.querySelector<HTMLElement>('#pause')?.hidden===false)return;
   if(e.code==='KeyR'&&this.covered){e.preventDefault();e.stopImmediatePropagation();this.wipe();}
   else if(e.code==='Digit5'&&this.count&&this.canUse()&&this.local.enabled){e.preventDefault();e.stopImmediatePropagation();this.toggle();}
   else if(e.code==='KeyQ'&&this.occupiesHands&&this.canUse()&&this.local.enabled){e.preventDefault();e.stopImmediatePropagation();this.throw();}
  },{capture:true,signal:this.abort.signal});this.ready=this.load();
 }
 private async load(){const loader=new GLTFLoader(),[stand,tomato]=await Promise.all([loader.loadAsync('/models/fruit/stand.glb'),loader.loadAsync('/models/fruit/tomato.glb')]);
  if(this.disposed){disposeOwnedObject(stand.scene);disposeOwnedObject(tomato.scene);return;}
  this.stand=stand.scene;this.stand.position.set(...FRUIT_STAND.position as [number,number,number]);this.stand.rotation.y=FRUIT_STAND.heading;this.stand.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});this.root.add(this.stand);
  this.asset=tomato.scene;this.asset.updateMatrixWorld(true);
  this.asset.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const instances=new THREE.InstancedMesh(o.geometry,o.material,TOMATO_STAND_SUPPLY);instances.castShadow=true;instances.receiveShadow=true;
   for(let i=0;i<TOMATO_STAND_SUPPLY;i++){const transform=new THREE.Matrix4().makeTranslation(.28+(i%4)*.28,1.14,-.25+Math.floor(i/4)*.25).multiply(o.matrixWorld);instances.setMatrixAt(i,transform);}
   instances.instanceMatrix.needsUpdate=true;this.stand!.add(instances);this.supplyMeshes.push(instances);
  });this.held=this.asset.clone(true);this.held.position.set(.35,-.28,-.65);this.held.visible=false;this.camera.add(this.held);
 }
 get nearby(){const p=this.local.body,[x,y,z]=FRUIT_STAND.position;return !!this.stand&&this.canUse()&&!p.vehicleId&&Math.hypot(p.x-x,p.y-y,p.z-z)<3.4;}
 get remaining(){return this.net.room?.state.fruitStock??TOMATO_STAND_SUPPLY;}
 get canTake(){return this.nearby&&this.count<TOMATO_CAPACITY&&this.remaining>0&&!this.local.body.bagId;}
 get occupiesHands(){return this.equipped&&this.count>0&&!this.local.body.bagId&&!this.local.body.vehicleId;}
 get canThrow(){return this.occupiesHands&&!this.covered&&this.canUse()&&this.local.enabled&&this.local.body.knockdownUntil<=this.net.now()&&(this.local.body.moodleSitUntil??0)<=this.net.now()&&this.net.now()>=this.nextThrow;}
 toggle(){if(!this.count||!this.canUse()||this.local.body.bagId||this.local.body.vehicleId)return;this.equipped=!this.equipped;if(this.equipped)this.onEquip();}
 holster(){this.equipped=false;}
 interact(){if(!this.nearby)return false;if(this.canTake)this.send('take');return true;}
 private send(action:string,aim?:number[]){this.net.room.send('fruit',{action,aim,roundStartedAt:this.net.room.state.startedAt});}
 throw(){if(!this.canThrow)return;this.nextThrow=this.net.now()+TOMATO_COOLDOWN_MS;this.send('throw',this.camera.getWorldDirection(new THREE.Vector3()).toArray());}
 private wipe(){if(this.covered&&this.net.canPlay)this.send('wipe');}
 private event(data:TomatoEvent){if(data.roundStartedAt!==this.net.room.state.startedAt)return;
  if(data.kind==='stock'){const wasEmpty=this.count===0;this.count=data.count??0;if(wasEmpty&&this.count){this.equipped=true;this.onEquip();}}
  if(data.kind==='splat'){this.covered=true;this.overlay.hidden=false;}
  if(data.kind==='wipe'){this.covered=false;this.overlay.hidden=true;}
  if(data.kind==='launch'&&data.projectile&&this.asset){const model=this.asset.clone(true);this.root.add(model);this.shots.set(data.projectile.id,{model,data:data.projectile});}
  if(data.kind==='remove'&&data.id!==undefined){this.shots.get(data.id)?.model.removeFromParent();this.shots.delete(data.id);}
 }
 update(){if(this.room!==this.net.room){this.unsubscribe?.();this.room=this.net.room;if(this.room)this.unsubscribe=this.room.onMessage<TomatoEvent>('tomatoEvent',data=>this.event(data));this.reset();}
  const started=this.net.room?.state.startedAt??0;if(started!==this.round){this.round=started;this.reset();}
  for(const mesh of this.supplyMeshes)mesh.count=this.remaining;
  this.root.visible=this.net.canPlay;this.notice.hidden=!this.net.canPlay||!this.count;this.notice.textContent=`🍅 ${this.count} · ${this.equipped?'Q / click to throw':'5 to equip'}`;
  this.overlay.hidden=!this.covered||!this.net.canPlay||document.querySelector<HTMLElement>('#pause')?.hidden===false;
  if(this.held)this.held.visible=this.net.canPlay&&this.occupiesHands&&this.canUse()&&this.local.enabled;
  for(const {model,data:b} of this.shots.values()){const t=Math.max(0,Math.min(5,(this.net.now()-b.born)/1000));model.position.set(b.x+b.vx*t,b.y+b.vy*t-4.905*t*t,b.z+b.vz*t);model.rotation.set(t*7,t*4,0);}
 }
 private reset(){this.count=0;this.equipped=false;this.covered=false;this.nextThrow=0;this.overlay.hidden=true;for(const s of this.shots.values())s.model.removeFromParent();this.shots.clear();}
 dispose(){this.disposed=true;this.abort.abort();this.unsubscribe?.();this.reset();this.overlay.remove();this.notice.remove();this.held?.removeFromParent();if(this.asset)disposeOwnedObject(this.asset);for(const mesh of this.supplyMeshes){mesh.removeFromParent();mesh.dispose();}this.supplyMeshes=[];if(this.stand)disposeOwnedObject(this.stand);this.root.removeFromParent();}
}
