import * as THREE from 'three';
import * as C from '@race/shared';
import type {Network} from './net.ts';

const RANGE=24,STEP=.5,SIZE=2*RANGE/STEP+1;
/** Visual probes use the authoritative movement query, including machine and track overrides. */
export function collisionProbes(world:C.MovementWorld,player:Pick<C.PlayerState,'x'|'y'|'z'>,range=RANGE,step=STEP){
 const points:{x:number;y:number;z:number;blocked:boolean}[]=[];
 const cx=Math.round(player.x/step)*step,cz=Math.round(player.z/step)*step;
 for(let x=cx-range;x<=cx+range;x+=step)for(let z=cz-range;z<=cz+range;z+=step){
  const y=world.height(x,z,player.y);if(y===undefined)continue;
  points.push({x,y,z,blocked:world.blocked(x,player.y,z,C.CAPSULE_RADIUS,C.CAPSULE_HEIGHT)});
 }
 return points;
}

export class CollisionDebug {
 private root=new THREE.Group();
 private setting=document.querySelector<HTMLElement>('#collision-setting')!;
 private checkbox=document.querySelector<HTMLInputElement>('#show-collisions')!;
 private toggle=document.querySelector<HTMLInputElement>('#collision-toggle')!;
 private abort=new AbortController();
 private legend=document.createElement('aside');
 private obstacles:THREE.InstancedMesh;
 private ground:THREE.InstancedMesh;
 private entities=new Map<string,THREE.Mesh>();
 private matrix=new THREE.Matrix4();
 private dummiesRequestedRound=-1;
 private wasEnabled=false;
 private lastX=Infinity;private lastY=Infinity;private lastZ=Infinity;
 constructor(private scene:THREE.Scene,private net:Network,parent:HTMLElement){
  this.root.name='Developer collision checks';
  this.obstacles=new THREE.InstancedMesh(new THREE.BoxGeometry(STEP,C.CAPSULE_HEIGHT,STEP),new THREE.MeshBasicMaterial({color:0xff8f30,wireframe:true,transparent:true,opacity:.5,depthTest:false}),SIZE*SIZE);
  this.ground=new THREE.InstancedMesh(new THREE.BoxGeometry(STEP,.015,STEP),new THREE.MeshBasicMaterial({color:0x3bdde8,wireframe:true,transparent:true,opacity:.3,depthTest:false}),SIZE*SIZE);
  this.obstacles.count=this.ground.count=0;this.obstacles.frustumCulled=this.ground.frustumCulled=false;
  this.root.add(this.obstacles,this.ground);
  const b=C.zurichWorld.bounds,bounds=new THREE.Box3(new THREE.Vector3(b.minX,0,b.minZ),new THREE.Vector3(b.maxX,100,b.maxZ));
  this.root.add(new THREE.Box3Helper(bounds,0xff4545));this.root.visible=false;scene.add(this.root);
  this.legend.textContent='COLLISION CHECKS · 24 m nearby · orange: blocked player space at your height · cyan: ground · yellow: players / practice dummies · pink: vehicle contacts · red: map bounds';
  Object.assign(this.legend.style,{position:'absolute',top:'70px',left:'20px',maxWidth:'400px',padding:'8px 12px',fontSize:'12px',color:'#fff',background:'#132027dd',pointerEvents:'none',zIndex:'40'});
  this.legend.hidden=true;parent.append(this.legend);
  this.toggle.addEventListener('change',()=>{this.checkbox.checked=this.toggle.checked;this.checkbox.dispatchEvent(new Event('change'));},{signal:this.abort.signal});
 }
 update(player:C.PlayerState){
  const state=this.net.room?.state,dev=state?.devMode===true;
  this.setting.hidden=!dev;this.toggle.checked=this.checkbox.checked;
  const enabled=dev&&this.net.canPlay&&this.checkbox.checked;
  if(enabled&&state?.hostId===this.net.room.sessionId&&(!this.wasEnabled||this.dummiesRequestedRound!==state.startedAt)){
   if(!state.debugDummies)this.net.room.send("debugDummies",true);
   this.dummiesRequestedRound=state.startedAt;
  }
  this.wasEnabled=enabled;
  this.root.visible=enabled;this.legend.hidden=!this.root.visible;
  if(!this.root.visible)return;
  if(Math.hypot(player.x-this.lastX,player.z-this.lastZ)>=1||Math.abs(player.y-this.lastY)>=.25){
   this.lastX=player.x;this.lastY=player.y;this.lastZ=player.z;
   let occupied=0,ground=0;
   for(const point of collisionProbes(C.zurichWorld,player)){
    this.ground.setMatrixAt(ground++,this.matrix.makeTranslation(point.x,point.y+.025,point.z));
    if(point.blocked)this.obstacles.setMatrixAt(occupied++,this.matrix.makeTranslation(point.x,player.y+C.CAPSULE_HEIGHT/2,point.z));
   }
   this.obstacles.count=occupied;this.ground.count=ground;this.obstacles.instanceMatrix.needsUpdate=this.ground.instanceMatrix.needsUpdate=true;
  }
  const active=new Set<string>();
  for(const [id,p] of [...(state?.players??[]),...(state?.dummies??[])])this.entity(`p:${id}`,p,undefined,active);
  for(const [id,v] of state?.vehicles??[])this.entity(`v:${id}`,v,v,active);
  for(const [id,mesh] of this.entities)if(!active.has(id)){this.root.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();this.entities.delete(id);}
 }
 private entity(id:string,p:{x:number;y:number;z:number},v:C.VehicleState|undefined,active:Set<string>){
  active.add(id);let mesh=this.entities.get(id);
  if(!mesh){
   const geometry=v?(v.kind===4?new THREE.SphereGeometry(C.vehicleRadius(v),12,8):new THREE.CylinderGeometry(C.vehicleRadius(v),C.vehicleRadius(v),1.1,16)):
    new THREE.CapsuleGeometry(C.CAPSULE_RADIUS,C.CAPSULE_HEIGHT-2*C.CAPSULE_RADIUS,4,12);
   mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:v?0xff60ce:0xffea40,wireframe:true,depthTest:false,transparent:true,opacity:.75}));
   this.entities.set(id,mesh);this.root.add(mesh);
  }
  mesh.position.set(p.x,p.y+(v?(v.kind===4?C.vehicleRadius(v):.55):C.CAPSULE_HEIGHT/2),p.z);
 }
 dispose(){
  this.abort.abort();this.setting.hidden=true;this.legend.remove();this.scene.remove(this.root);
  this.root.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)material.dispose();}});
  this.entities.clear();
 }
}
