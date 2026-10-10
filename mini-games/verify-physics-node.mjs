import {BOARDING_SECONDS} from './vehicle-passengers.js';
import assert from 'node:assert/strict';
import { physicsHarness } from './physics-harness.mjs';
const {world,solver,polybahn,transport,sim,walkTo,THREE}=await physicsHarness();
const failures=[],results=[];
function check(name,fn){try{const detail=fn();results.push({name,pass:true,detail});}catch(error){failures.push({name,message:error.message});results.push({name,pass:false,message:error.message});}}
for(const hz of [30,60,120])check(`street route at ${hz} Hz`,()=>{
 const route=world.data.route;sim.set(...route[0]);let maxPenetration=0,ticks=0;
 for(let i=1;i<route.length;i++){const r=walkTo(route[i],{hz,maxSeconds:30,tolerance:1.5});maxPenetration=Math.max(maxPenetration,r.maxPenetration);ticks+=r.steps;assert(r.remaining<1.6,`stuck at route point ${i}: ${JSON.stringify(r)}`);assert(!r.state.waterRecovery,`route point ${i} enters water`);}
 assert(maxPenetration<.02);return {ticks,maxPenetration};
});
check('Polybahn station approach and exit',()=>{
 for(const path of polybahn.accessPaths){sim.set(...path[0]);for(const point of path.slice(1)){const r=walkTo(point);assert(r.remaining<.6,JSON.stringify(r));}}return {mapTrianglesRemoved:polybahn.cutTriangles};
});
check('Polybahn round trip remains finite and lands clear',()=>{
 for(let d=0;d<polybahn.path.length;d+=.5){const p=polybahn.path.sample(d);assert(!world.bodyBlocked(p.x,p.y,p.z,2.5,3),'track crosses a native building');}
 for(const destination of [1,0]){const entry=new THREE.Vector3(...polybahn.state()[destination?'start':'end']);assert(polybahn.collectTicket(polybahn.ticketPoints[0]));assert(polybahn.board(entry));let t;
 for(let i=0;i<12000;i++){t=polybahn.update(1/60);assert(t.position.toArray().every(Number.isFinite));if(t.arrived)break;}
 assert(t.arrived);assert(solver.penetration(t.landing)<.02);assert(!world.isWater(t.landing.x,t.landing.z));}return polybahn.state();
});
check('overspeed tram derails at first bend and resets',()=>{
 transport.setCrashProtection(false);
 const entry=transport.data.points[0];assert(transport.board(new THREE.Vector3(entry[0],world.height(...entry),entry[1])));let t,maxSpeed=0;
 for(let i=0;i<600+Math.ceil(BOARDING_SECONDS*60);i++){t=transport.update(1/60);assert(t.position.toArray().every(Number.isFinite));maxSpeed=Math.max(maxSpeed,t.speed);if(t.derailed&&!t.aboard)break;}
 assert(maxSpeed>30);assert(t.derailed&&!t.aboard&&!t.arrived);assert.equal(transport.state().distance,transport.state().firstCorner);assert(!transport.board(t.position));const result={maxSpeed,corner:transport.state().firstCorner};transport.reset();assert(!transport.state().derailed);assert(transport.board(new THREE.Vector3(entry[0],world.height(...entry),entry[1])));transport.reset();transport.setCrashProtection(true);return result;
});
check('jump rises and returns to floor',()=>{
 sim.set(...world.data.route[0]);const floor=sim.position.y;sim.jump();let apex=floor;
 for(let i=0;i<180;i++){sim.move(0,0,1/60);apex=Math.max(apex,sim.position.y);}
 assert(apex-floor>1,'jump must rise at least one metre');assert(sim.state.onGround);assert(Math.abs(sim.position.y-floor)<.02);return {height:apex-floor};
});
check('map boundary blocks fast motion',()=>{
 const edge=world.data.playableBounds?.maxX??545;sim.set(edge-1,0);sim.move(22,0,1);assert(sim.position.x<=edge);return sim.position.toArray();
});
check('actual river entry triggers recovery',()=>{
 let found=false;for(let z=-120;z<200&&!found;z+=10)for(let x=-350;x<-100&&!found;x+=2){if(world.isWater(x,z)&&solver.penetration(new THREE.Vector3(x,world.ground(x,z),z))<.001){const previousFalls=sim.state.waterFalls;sim.set(x,z);sim.move(0,0,.1);assert(sim.state.waterRecovery>0);assert.equal(sim.state.waterFalls,previousFalls+1);found=true;}}
 assert(found,'must find clear actual water');
});
check('native building mask blocks fast impacts',()=>{
 let impacts=0;for(let z=-200;z<250&&impacts<20;z+=4)for(let x=-450;x<450&&impacts<20;x+=4){
 const p=new THREE.Vector3(x,world.height(x,z),z);if(world.blocked(x,z)||solver.penetration(p))continue;
 const target=new THREE.Vector3(x+4,world.height(x+4,z),z);if(!solver.penetration(target)||[-3,-2,-1,0,1,2,3].some(dz=>!solver.penetration(new THREE.Vector3(x+4,world.height(x+4,z+dz),z+dz))))continue;
 sim.set(x,z);sim.move(22,0,.5);assert(sim.position.x<x+4||Math.abs(sim.position.z-z)>3,'passed through source building mask');assert(solver.penetration(sim.position)<.02);impacts++;
 }assert(impacts>=8);return {impacts};
});
console.log(JSON.stringify({results,failures},null,2));if(failures.length)process.exitCode=1;
