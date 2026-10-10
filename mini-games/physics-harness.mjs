import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { createWorld, capsuleSolver } from './geo-world.js';
import { createPolybahn } from './polybahn.js';
import { createTransport } from './transport.js';
import {createRiverSurface} from './river-surface.js';

// The simulation uses production geometry, passage carving, capsule solver and
// movement source. Only image/canvas rendering and HTTP are replaced in Node.
export async function physicsHarness({worldOnly=false,vehicles=true}={}) {
 const root=new URL('./public/',import.meta.url);
 const NativeRequest=globalThis.Request;globalThis.Request=class extends NativeRequest{constructor(input,init){super(typeof input==='string'?new URL(input,'http://local.test').href:input,init);}};
 globalThis.ProgressEvent??=class extends Event{constructor(type,values){super(type);Object.assign(this,values);}};
 globalThis.fetch=async input=>{const pathname=new URL(typeof input==='string'?input:input.url,'http://local.test').pathname;const bytes=await readFile(new URL(pathname.slice(1),root));return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});};
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}})})};
 const scene=new THREE.Scene(),world=await createWorld(scene),solver=capsuleSolver(world.collider),riverSurface=createRiverSurface(scene,world);
 if(worldOnly)return {THREE,world,solver};
 const polybahn=vehicles?await createPolybahn(scene,world,solver):null;
 const transport=vehicles?await createTransport(scene,world,solver):null;
 const source=await readFile(new URL('./main.js',import.meta.url),'utf8');
 const marker='function move(',start=source.indexOf(marker);
 if(start<0)throw Error('Production movement entrypoint missing');
 const brace=source.indexOf('{',start);let depth=1,end=brace+1;
 while(depth&&end<source.length){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}
 const body=source.slice(start,end);
 const make=new Function('world','solver','THREE','riverSurface',`
 let pos=new THREE.Vector3(),onGround=true,vy=0,waterRecovery=0,waterFalls=0;
 let running=false,inTram=false,inPolybahn=false;
 function movementBlocked(x,z){return world.blocked(x,z)&&!world.isWater(x,z);}
 function fallInWater(){waterRecovery=1.5;waterFalls++;}
 ${body}
 return {move,get position(){return pos},get state(){return {onGround,vy,waterRecovery,waterFalls}},set(x,z,y=world.height(x,z),velocity=0){pos.set(x,y,z);onGround=velocity===0&&Math.abs(y-world.height(x,z))<.03;vy=velocity;waterRecovery=0;},jump(){vy=7;onGround=false;}};`);
 const sim=make(world,solver,THREE,riverSurface);
 function walkTo(target,{speed=6,hz=60,tolerance=.5,maxSeconds=120}={}) {
  let steps=0,maxPenetration=0,remaining=Infinity;
  for(;steps<maxSeconds*hz;steps++){
   const dx=target[0]-sim.position.x,dz=target[1]-sim.position.z;remaining=Math.hypot(dx,dz);
   if(remaining<=tolerance)break;
   const v=Math.min(speed,remaining*hz);sim.move(dx/remaining*v,dz/remaining*v,1/hz);
   maxPenetration=Math.max(maxPenetration,solver.penetration(sim.position));
   if(sim.state.waterRecovery)break;
  }
  return {remaining:Math.hypot(target[0]-sim.position.x,target[1]-sim.position.z),steps,maxPenetration,position:sim.position.toArray(),state:sim.state};
 }
 return {THREE,world,solver,polybahn,transport,sim,walkTo};
}
