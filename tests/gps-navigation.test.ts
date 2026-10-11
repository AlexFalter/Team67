import {einsteinDestination,zurichWorld} from "../packages/shared/src/index.ts";
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMapNavigation} from '../apps/client/src/npcPrototype/src/world/core/map-navigation.js';
import {remainingRoute,routeDistance,routeDistanceLabel} from '../apps/client/src/multiplayer/navigation/routeModel.ts';

test('navigation chooses the shorter of two valid corridors without crossing the wall',()=>{
 const world={data:{playableBounds:{minX:0,maxX:40,minZ:0,maxZ:40}},height:()=>0,blocked:(x:number,z:number)=>x>=18&&x<=22&&z>=8&&z<=32};
 const nav=createMapNavigation(world,{penetration:()=>0});const route=nav.path([4,12],[36,12]);
 assert(route.some(([,z]:number[])=>z<8));assert(!route.some(([,z]:number[])=>z>32));
 for(let i=1;i<route.length;i++)for(let t=0;t<=1;t+=.02){const a=route[i-1],b=route[i];assert(!world.blocked(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t));}
 const distance=routeDistance(route.map(([x,z]:number[])=>({x,z})));assert(distance>32&&distance<55);
});
test('remaining route distance follows bends and decreases with progress',()=>{
 const route=[{x:0,z:0},{x:100,z:0},{x:100,z:100}];
 assert.equal(routeDistance(route),200);assert.equal(routeDistance(remainingRoute(route,{x:50,z:0})),150);
 assert.equal(routeDistance(remainingRoute(route,{x:100,z:70})),30);
 assert.equal(routeDistanceLabel(150),'150 m');assert.equal(routeDistanceLabel(1250),'1.25 km');
});
test('navigation refuses a destination sealed behind impassable terrain',()=>{
 const nav=createMapNavigation({data:{playableBounds:{minX:0,maxX:40,minZ:0,maxZ:40}},height:()=>0,blocked:(x:number)=>x>=18&&x<=22},{penetration:()=>0});
 assert.throws(()=>nav.path([4,12],[36,12]),/No walkable path/);
});

test('GPS keeps its route while walking, reroutes off course and ignores stale round replies',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');
 class FakeWorker{onmessage?: (event:{data:{id:number;points:{x:number;z:number}[]}})=>void;onerror?:()=>void;requests:{id:number;from:{x:number;z:number};viaCat?:boolean}[]=[];terminated=false;postMessage(data:{id:number;from:{x:number;z:number};viaCat?:boolean}){this.requests.push(data);}terminate(){this.terminated=true;}}
 Object.defineProperty(globalThis,'Worker',{configurable:true,value:FakeWorker});
 try{
  const {RouteNavigation}=await import('../apps/client/src/multiplayer/navigation/RouteNavigation.ts');const nav=new RouteNavigation();
  const worker=(nav as unknown as {worker:FakeWorker}).worker;
  nav.update(0,{x:0,z:0});assert.equal(worker.requests.length,1);assert.equal(worker.requests[0].viaCat,true);
  worker.onmessage!({data:{id:worker.requests[0].id,points:[{x:0,z:0},{x:100,z:0},{x:100,z:100}]}});
  nav.update(2,{x:50,z:0});assert.equal(worker.requests.length,1);assert.equal(nav.distance,150);
  nav.update(2,{x:100,z:70});assert.equal(worker.requests.length,1);assert.equal(nav.distance,30);
  nav.update(2,{x:130,z:70});assert.equal(worker.requests.length,2);
  nav.reset();worker.onmessage!({data:{id:worker.requests[1].id,points:[{x:130,z:70},{x:100,z:100}]}});nav.update(0,{x:300,z:300});assert.equal(nav.points.length,0);
  nav.reset();const cat=einsteinDestination(zurichWorld)!;
  nav.update(0,{x:cat.x,z:cat.z});assert.equal(worker.requests.at(-1)!.viaCat,false,'after reaching the cat, reroutes continue to ETH');
  nav.reset();nav.update(0,{x:0,z:0});assert.equal(worker.requests.at(-1)!.viaCat,true,'a new round restores the cat waypoint');
  nav.dispose();assert(worker.terminated);
 }finally{if(previous)Object.defineProperty(globalThis,'Worker',previous);else Reflect.deleteProperty(globalThis,'Worker');}
});
