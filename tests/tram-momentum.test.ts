import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {smoothRailPoints} from '../packages/shared/src/rail-curve.ts';
import {createRailGeometry} from '../apps/client/src/multiplayer/railGeometry.ts';
import {GameControls} from '../apps/client/src/multiplayer/gameControls.ts';
import {readFileSync} from 'node:fs';
import {Mesh,Vector3} from 'three';
import {loadTransitModels} from '../apps/client/src/multiplayer/transitModels.ts';
import {disposeMap} from '../apps/client/src/maps/zurich/loadZurichMap.ts';

test('actual tipped wagon geometry clears the terrain throughout the derail slide',async t=>{
 t.mock.method(globalThis,'fetch',async(url:string)=>new Response(readFileSync(`apps/client/public/models/${url.includes('polybahn')?'polybahn':'tram'}.glb`)));
 const models=await loadTransitModels(new AbortController().signal,'/'),car=models.create(true),point=new Vector3();
 const v={...C.createVehicle(C.TRAM_KIND),railDistance:C.tramFirstCorner,derailStartedAt:1};
 const incoming=C.railFrame({...v,railDistance:C.tramFirstCorner-8});v.vx=Math.sin(incoming.rotY)*48;v.vz=Math.cos(incoming.rotY)*48;
 try{
  for(const age of [.1,.25,.5,1,1.5,2,4,8])for(let part=0;part<3;part++){
   v.derailAge=age;const f=C.tramDerailFrame(v,part);car.position.set(f.x,f.y,f.z);car.rotation.set(-f.pitch,f.rotY+Math.PI,f.roll,'YXZ');car.updateMatrixWorld(true);
   let minimumGap=Infinity;
   car.traverse(o=>{if(!(o instanceof Mesh))return;
    const positions=o.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
     point.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);
     const ground=C.zurichNativeHeight(point.x,point.z);
     if(ground!==undefined){assert(point.y>=ground-.03,`wagon ${part} clips terrain at crash age ${age}`);minimumGap=Math.min(minimumGap,point.y-ground);}
    }
   });
   if(f.grounded)assert(minimumGap<.06,`wagon ${part} is touching the ground rather than hovering`);
  }
 }finally{disposeMap(car);models.dispose();}
});

test('tram acceleration feeds retained momentum and gravity when the bend throws it off the track',()=>{
 const v=C.createVehicle(C.TRAM_KIND);v.railDistance=C.TRAM_START_DISTANCE;
 let previous=0,acceleratingSteps=0;
 for(let now=0;v.railDistance<C.tramFirstCorner&&now<60000;now+=10){
  C.railMotion(v,now,true);const speed=Math.hypot(v.vx,v.vz);
  assert(speed>=previous-1e-8,'speed increases throughout the approach');
  if(now>0){assert(speed-previous<.06,'no sudden late boost');if(speed>previous)acceleratingSteps++;}previous=speed;
 }
 assert(acceleratingSteps>900,'acceleration starts at departure and continues to the corner');assert(previous>=47);
 assert(C.tramTurnLoad(v)>C.TRAM_TRACK_ADHESION,'cornering force exceeds available adhesion');
 const slow={...v,vx:v.vx/4,vz:v.vz/4};
 assert(C.tramTurnLoad(slow)<C.TRAM_TRACK_ADHESION,'the same turn is safe at normal speed');
 const f=C.railFrame(v),incoming=C.railFrame({...v,railDistance:C.tramFirstCorner-8});
 v.vx=Math.sin(incoming.rotY)*previous;v.vz=Math.cos(incoming.rotY)*previous;v.derailStartedAt=1;
 const at=(age:number)=>C.tramDerailFrame({...v,derailAge:age});
 const start=at(0),flight=at(.5),landed=at(2);
 assert(Math.hypot(start.x-f.x,start.y-f.y,start.z-f.z)<1e-8,'continuous launch position');
 assert(flight.y-f.y>1.8,'the wagon becomes airborne');
 const along=(flight.x-f.x)*Math.sin(incoming.rotY)+(flight.z-f.z)*Math.cos(incoming.rotY);
 assert(along>15,'it flies along the incoming tangent instead of following the curve');
 assert(Number.isFinite(landed.y),'the wreck settles on terrain');
 const contact=at(landed.landedAt),sliding=at(landed.landedAt+.25);
 assert(contact.grounded&&sliding.grounded);
 assert(Math.hypot(sliding.x-contact.x,sliding.z-contact.z)>.5,'momentum keeps it sliding after landing');
 assert(Math.hypot(at(8).x-at(7).x,at(8).z-at(7).z)<.001,'friction settles the wreck');
});

test('rail smoothing removes survey ripples, preserves endpoints and shares connected mesh sections',()=>{
 const points=Array.from({length:101},(_,i)=>({x:i*.5,y:Math.sin(i*1.4)*.12,z:Math.sin(i*1.7)*.15}));
 const distances=points.map(p=>p.x),smooth=smoothRailPoints(points,distances);
 assert.deepEqual(smooth[0],points[0]);assert.deepEqual(smooth.at(-1),points.at(-1));
 const ripple=(p:typeof points)=>p.slice(10,-10).reduce((sum,q,i)=>sum+Math.abs(q.z-2*p[i+9].z+p[i+8].z),0);
 assert(ripple(smooth)<ripple(points)*.1);
 const g=createRailGeometry(d=>({x:d,y:0,z:0,rotY:Math.PI/2}),0,10,.5,.07);
 assert(g.index&&g.attributes.position.count<g.index.count,'adjacent sections reuse vertices');
 for(const value of g.attributes.position.array)assert(Number.isFinite(value));g.dispose();
});

test('derail camera suspends controls without disabling movement and resumes on return',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 const canvas={focus(){},async requestPointerLock(){}},crosshair={hidden:false},menu={hidden:true};
 let releases=0,suspended=true;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{hasFocus:()=>true,pointerLockElement:canvas,exitPointerLock(){releases++;},querySelector(){return {textContent:''};}}});
 try{
  const controls=Object.create(GameControls.prototype) as GameControls;
  const local={enabled:true,clear(){}},view={perspective:0,look(){}};
  Object.assign(controls,{local,view,canvas,menu,crosshair,capturePrompt:{hidden:true},abort:new AbortController(),resumeKeys:new Set(),captured:true,ready:()=>true,suspended:()=>suspended});
  controls.update();assert(local.enabled);assert(menu.hidden);assert.equal(releases,0);
  suspended=false;controls.update();assert(local.enabled);assert(menu.hidden);assert.equal(releases,0);
 }finally{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
});
