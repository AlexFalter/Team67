import {featurePlacement} from '../../world/placements/feature-placement.js';
import {gameConfig} from '../../config/game-config.js';
import {createBikeFleetState} from './bike-fleet-state.js';
import {createFeatureLifecycle,disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {createVehiclePassengers} from '../passengers/vehicle-passengers.js';
import * as THREE from 'three';
import {createWorldAccess} from '../../world/core/world-access.js';

export function createPubliBikeStation(scene,world,makeBicycle,solver,{placement,stateModel,playerId='local',uiRoot=document.body,replicated=false,onCommand=()=>{}}={}){
 const lifecycle=createFeatureLifecycle();
 const fleet=stateModel??createBikeFleetState({batterySeconds:gameConfig.vehicles.bikeBatterySeconds,failurePercent:gameConfig.vehicles.bikeFailurePercent});
 if(fleet.snapshot().count!==8)throw Error('PubliBike station requires eight fleet records');
 placement=featurePlacement(world,'publiBike',placement);

 const access=createWorldAccess(world,solver),groundPoint=(x,z)=>new THREE.Vector3(x,world.height(x,z),z);
 const anchor=placement.anchor,next=placement.next,dx=next[0]-anchor[0],dz=next[1]-anchor[1],len=Math.hypot(dx,dz),u=[dx/len,dz/len],n=[-u[1],u[0]],count=8,spacing=1.3;
 if(!Number.isFinite(len)||len===0)throw Error('PubliBike placement requires two distinct finite anchor points');
 let slots,center;
 if(placement.slots){
  if(!Array.isArray(placement.slots)||placement.slots.length!==count||placement.slots.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))throw Error('PubliBike placement.slots requires eight {x,z} points');
  slots=placement.slots.map(p=>({x:p.x,z:p.z}));center=[slots.reduce((n,p)=>n+p.x,0)/count,slots.reduce((n,p)=>n+p.z,0)/count];
  if(slots.some(p=>!access.clearFloor(p.x,p.z)))throw Error('Host PubliBike slots are blocked on this map');
 }

 // Find room beside the route, including the full bicycle footprint and access aisle.
 if(!slots){
 outer:for(const along of [0,8,-8,16,-16,24,-24])for(const offset of [5,-5,8,-8,11,-11,14,-14]){
  const c=[anchor[0]+u[0]*along+n[0]*offset,anchor[1]+u[1]*along+n[1]*offset];
  const proposed=Array.from({length:count},(_,i)=>({x:c[0]+u[0]*(i-(count-1)/2)*spacing,z:c[1]+u[1]*(i-(count-1)/2)*spacing}));
  let valid=true;
  for(const p of proposed)for(const a of [-.6,0,.6])for(const b of [-2,0,2]){
   const x=p.x+u[0]*a+n[0]*b,z=p.z+u[1]*a+n[1]*b;
   if(!access.clearFloor(x,z)||world.bridgeAt(x,z)||Math.abs(world.height(x,z)-world.height(p.x,p.z))>.3)valid=false;
  }
  if(valid){const tx=c[0]-u[0]*6.3,tz=c[1]-u[1]*6.3;for(const a of [-.5,.5])for(const b of [-.4,.4])if(!access.clearFloor(tx+u[0]*a+n[0]*b,tz+u[1]*a+n[1]*b))valid=false;}
  if(valid){const from=groundPoint(...anchor);valid=proposed.every(p=>access.walkablePath(from,groundPoint(p.x,p.z)));}
  if(valid){slots=proposed;center=c;break outer;}
 }
 }
 if(!slots)throw new Error('No clear PubliBike station site near the route');
 const batteryDuration=fleet.snapshot().batterySeconds;
 const heading=Math.atan2(-n[0],-n[1]),bikes=slots.map((s,i)=>{
  const model=makeBicycle();model.name=`PubliBike ${i+1}`;model.userData.entityId=fleet.bike(i+1).entityId;scene.add(model);const bike={passengers:createVehiclePassengers('bike',`bike-${i+1}`),id:i+1,model,dock:i,working:false,broken:false,reason:null,scanAttempts:0,rideTime:0};
  for(const key of ['working','broken','reason','scanAttempts','rideTime','dock','ownerId','destroyed'])Object.defineProperty(bike,key,{get:()=>fleet.bike(i+1)[key],enumerable:true});
  return bike;
 });
 const atlas=document.createElement('canvas');atlas.width=1024;atlas.height=128;const ac=atlas.getContext('2d');
 for(let i=0;i<count;i++){const x=i*128;ac.fillStyle='#fff';ac.fillRect(x,0,128,128);ac.fillStyle='#92246c';ac.font='bold 30px Arial';ac.textAlign='center';ac.fillText(String(i+1).padStart(2,'0'),x+64,32);ac.fillStyle='#15232b';for(let y=0;y<11;y++)for(let q=0;q<11;q++)if((q*7+y*11+i+q*y)%5<3)ac.fillRect(x+36+q*5,43+y*5,5,5);ac.font='10px Arial';ac.fillText('E · SCAN TO RIDE',x+64,117);}
 const tagTexture=new THREE.CanvasTexture(atlas);tagTexture.colorSpace=THREE.SRGBColorSpace;const tagMaterial=new THREE.MeshBasicMaterial({map:tagTexture,side:THREE.DoubleSide});
 bikes.forEach((b,i)=>{const geometry=new THREE.PlaneGeometry(.23,.23);const uv=geometry.attributes.uv;for(let j=0;j<uv.count;j++)uv.setX(j,(uv.getX(j)+i)/count);const tag=new THREE.Mesh(geometry,tagMaterial);tag.name='PubliBike rear QR code';tag.position.set(0,1.25,1.35);b.model.add(tag);b.qrTag=tag;});
 const group=new THREE.Group();group.name='PubliBike station';scene.add(group);
 const berry=new THREE.MeshStandardMaterial({color:'#a82779',roughness:.45}),metal=new THREE.MeshStandardMaterial({color:'#50606b',metalness:.6,roughness:.4}),paint=new THREE.MeshBasicMaterial({color:'#db64ad',depthWrite:false});
 const markers=slots.map(s=>{
  const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-.55,-1.75],[.55,-1.75],[.55,1.75],[-.55,1.75]].map(([a,b])=>new THREE.Vector3(a,.035,b))),new THREE.LineBasicMaterial({color:'#df73b8'}));
  line.position.set(s.x,world.height(s.x,s.z),s.z);line.rotation.y=heading;group.add(line);
  // Low wheel stand, with an occupancy light.
  const stand=new THREE.Group();stand.position.copy(line.position);stand.rotation.y=heading;
  const foot=new THREE.Mesh(new THREE.BoxGeometry(.40,.08,.50),metal);foot.position.set(0,.04,-1.15);stand.add(foot);
  const light=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),new THREE.MeshBasicMaterial({color:'#72e3ad'}));light.position.set(.17,.10,-1.15);stand.add(light);group.add(stand);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.64,.025,6,32),paint);ring.rotation.x=-Math.PI/2;ring.position.copy(line.position);ring.position.y+=.045;ring.visible=false;group.add(ring);
  return {light,ring};
 });
 const terminal=new THREE.Group();const tx=center[0]-u[0]*6.3,tz=center[1]-u[1]*6.3;terminal.position.set(tx,world.height(tx,tz),tz);terminal.rotation.y=heading;group.add(terminal);
 const column=new THREE.Mesh(new THREE.BoxGeometry(.65,2.35,.38),berry);column.position.y=1.18;terminal.add(column);
 const screen=new THREE.Mesh(new THREE.BoxGeometry(.49,.55,.025),new THREE.MeshStandardMaterial({color:'#163d43',roughness:.3}));screen.position.set(0,1.53,-.205);terminal.add(screen);
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true}));sign.position.set(center[0],world.height(...center)+3.3,center[1]);sign.scale.set(7.5,1.875,1);group.add(sign);
 const battery=document.createElement('aside');battery.id='bike-battery';battery.hidden=true;battery.innerHTML='<span>PUBLIBIKE BATTERY</span><div role="progressbar" aria-label="PubliBike battery" aria-valuemin="0" aria-valuemax="100"><i></i></div><b></b>';uiRoot.append(battery);
 const frameMaterials=[];bikes.forEach(b=>b.model.traverse(mesh=>{if(!mesh.isMesh)return;const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];const copies=materials.map(m=>{if(!m.name.includes('berry enamel'))return m;const copy=m.clone();frameMaterials.push({bike:b,material:copy,original:copy.color.clone()});return copy;});mesh.material=Array.isArray(mesh.material)?copies:copies[0];}));
 let active=null,selected=null,lastLabel='',highlightWorking=true;
 function refreshBattery(){const remaining=Math.max(0,batteryDuration-(active?.rideTime??0)),percent=remaining/batteryDuration*100;battery.hidden=!active;battery.querySelector('i').style.width=`${percent}%`;battery.querySelector('[role="progressbar"]').setAttribute('aria-valuenow',String(Math.round(percent)));battery.querySelector('b').textContent=`${remaining.toFixed(1)}s`;battery.classList.toggle('low',remaining<=5);}
 function refreshColors(){frameMaterials.forEach(({bike,material,original})=>{material.color.copy(original);if(highlightWorking&&bike.working&&!bike.broken)material.color.set('#ffd174');});}

 function refresh(){
  refreshColors();refreshBattery();
  const docked=bikes.filter(b=>b.model.visible&&!b.broken&&b.dock!==null).length,label=`${docked} / ${count} BIKES AVAILABLE`;
  if(label!==lastLabel){ctx.fillStyle='#92246c';ctx.fillRect(0,0,768,192);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 52px Arial';ctx.fillText('PubliBike station',384,65);ctx.font='30px Arial';ctx.fillText(label,384,112);ctx.font='26px Arial';ctx.fillText('E TO RIDE · E TO RETURN',384,160);texture.needsUpdate=true;lastLabel=label;}
  markers.forEach((m,i)=>{const b=bikes.find(b=>b.model.visible&&b.dock===i);m.light.material.color.set(b?.broken?'#ef5e58':b?'#72e3ad':'#efb859');m.ring.visible=!!b&&b.id===selected;});
 }
 function nearest(position,healthyOnly=false){let found=null,distance=Infinity;for(const b of bikes)if(b.model.visible&&(!healthyOnly||!b.broken)){const d=Math.hypot(position.x-b.model.position.x,position.z-b.model.position.z);if(d<distance){distance=d;found=b;}}return found;}
 function nearby(position,healthyOnly=false){let found=null,distance=Infinity;for(const b of bikes)if(b.model.visible&&(!healthyOnly||!b.broken)){const d=position.distanceTo(b.model.position);if(d<distance&&access.canInteract(position,b.model.position,2.8)){found=b;distance=d;}}return found;}
 function syncFleet(){
  active=bikes.find(b=>b.ownerId===playerId)??null;
  bikes.forEach((b,i)=>{const record=fleet.bike(b.id);b.passengers.clear();if(record.ownerId)b.passengers.board(record.ownerId);b.model.visible=record.ownerId===null&&!record.destroyed;const p=record.position??[slots[i].x,world.height(slots[i].x,slots[i].z),slots[i].z];b.model.position.fromArray(p);b.model.rotation.set(0,record.position?record.yaw:heading,0);});refresh();
 }
 function reset(options){selected=null;if(replicated){syncFleet();return;}fleet.reset(options);bikes.forEach((b,i)=>{fleet.setPose(b.id,[slots[i].x,world.height(slots[i].x,slots[i].z),slots[i].z],heading);b.model.userData.wheels.forEach(w=>w.rotation.x=0);});syncFleet();}
 // A supplied host state must survive mounting; do not reroll it.
 syncFleet();
 lifecycle.own(()=>{battery.remove();disposeOwnedObject(group);bikes.forEach(b=>{b.model.removeFromParent();b.qrTag.geometry.dispose();});tagTexture.dispose();tagMaterial.dispose();frameMaterials.forEach(({material})=>material.dispose());});
 return {group,bikes,slots,center,nearest,nearby,reset,
  dispose:()=>lifecycle.dispose(),snapshot:()=>fleet.snapshot(),restore(snapshot){if(!fleet.applySnapshot(snapshot))return false;syncFleet();return true;},
  setHighlightWorking(value){highlightWorking=!!value;refresh();},
  scan(b){if(replicated)return b.broken||b.ownerId?{ok:false,permanent:b.broken,error:b.reason??'Bike is occupied'}:{ok:true};return fleet.scan(b.id);},
  updateRide(dt){if(!active)return null;if(replicated){refreshBattery();return active.broken?active:null;}const depleted=fleet.tick(dt);refreshBattery();if(depleted.includes(active.id)){refresh();return active;}return null;},
  update(position){const b=nearby(position);const id=b?.id??null;if(id!==selected){selected=id;refresh();}return id;},
  take(position,id){if(active)return null;const b=id?bikes.find(b=>b.id===id):nearest(position);if(!b||b.broken||!b.model.visible||!access.canInteract(position,b.model.position,2.8))return null;if(replicated){onCommand({type:'bike.claim',bikeId:b.id});return null;}if(!fleet.claim(b.id,playerId))return null;b.passengers.board(playerId);active=b;b.model.visible=false;selected=null;refresh();return b;},
  destroyActive(reason='Exploded in the Limmat'){if(replicated){if(active)onCommand({type:'bike.destroy',bikeId:active.id,reason});return false;}if(!active||!fleet.destroy(active.id,playerId,reason))return false;syncFleet();selected=null;return true;},
  park(position,yaw){if(!active)return false;let dock=null,distance=Infinity;const occupied=new Set(bikes.filter(b=>b.model.visible&&b.dock!==null).map(b=>b.dock));slots.forEach((s,i)=>{const d=Math.hypot(position.x-s.x,position.z-s.z);if(!occupied.has(i)&&Math.hypot(position.x-center[0],position.z-center[1])<10&&d<distance){dock=i;distance=d;}});
   const b=active;if(replicated){onCommand({type:'bike.park',bikeId:b.id,dock,position:position.toArray(),yaw});return false;}if(!fleet.park(b.id,playerId,dock))return false;b.passengers.clear();b.model.visible=true;if(dock!==null){const s=slots[dock];b.model.position.set(s.x,world.height(s.x,s.z),s.z);b.model.rotation.set(0,heading,0);}else{b.model.position.set(position.x,world.height(position.x,position.z),position.z);b.model.rotation.set(0,yaw,0);}fleet.setPose(b.id,b.model.position.toArray(),b.model.rotation.y);active=null;refresh();return dock!==null;
  },
  pickupState(position){const b=active??nearest(position,true);return b?{id:b.id,working:b.working,batteryRemaining:Math.max(0,batteryDuration-b.rideTime),golden:highlightWorking&&b.working&&!b.broken,x:b.model.position.x,z:b.model.position.z,available:b.model.visible}:{available:false};},
  state(){return {failurePercent:gameConfig.vehicles.bikeFailurePercent,highlightWorking,batteryDuration,batteryRemaining:active?Math.max(0,batteryDuration-active.rideTime):null,x:center[0],z:center[1],capacity:count,available:bikes.filter(b=>b.model.visible&&!b.broken&&b.dock!==null).length,activeBike:active?.id??null,selectedBike:selected,bikes:bikes.map(b=>({passengers:b.passengers.state(),id:b.id,working:b.working,batteryRemaining:Math.max(0,batteryDuration-b.rideTime),golden:highlightWorking&&b.working&&!b.broken,x:b.model.position.x,z:b.model.position.z,available:b.model.visible&&!b.broken,dock:b.dock,broken:b.broken,reason:b.reason,scanAttempts:b.scanAttempts}))};}
 };
}
