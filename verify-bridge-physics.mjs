import assert from 'node:assert/strict';
import {physicsHarness} from './physics-harness.mjs';
const {world,solver,sim,walkTo}=await physicsHarness({vehicles:false});
let crossings=0;
for(const hz of [30,60,120])for(const speed of [6,12,18,22])for(const z of [65,71,72.405414,77])for(const dir of [1,-1]){
 sim.set(dir>0?-145:-40,z);const result=walkTo([dir>0?-40:-145,z],{speed,hz,maxSeconds:25});
 assert(result.remaining<.6,JSON.stringify({hz,speed,z,dir,result}));assert.equal(result.state.waterFalls,0);assert(result.maxPenetration<.01);assert(result.state.onGround);crossings++;
}
// Open water and real buildings must retain their collision behavior.
let water=0,buildings=0;
for(let x=-200;x<0;x+=5)for(let z=-100;z<150;z+=5){if(world.isWater(x,z))water++;if(world.bodyBlocked(x,world.ground(x,z),z))buildings++;}
assert(water>20&&buildings>20);assert(world.height(-60,71)>8.7&&world.height(-55,71)>8.7,'deck continues to eastern bank');
console.log(`PASS: ${crossings} bidirectional bridge crossings across three lanes, walking/scooter/bike speeds at 30/60/120 Hz; dry grounded exits, no penetration, water and building collisions retained.`);
