import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BagFlight} from '../apps/client/src/multiplayer/bags/bagFlight.ts';
import {bagThrowClip} from '../apps/client/src/multiplayer/bags/bagThrow.ts';
import {AnimationClip,VectorKeyframeTrack} from 'three';
import type {BagState} from '@race/shared';
const bag:BagState={x:0,y:1,z:0,vx:12,vy:0,vz:0,owner:'',thrower:'a',flying:true,throwAt:570,releasedAt:1000,spin:0};
test('bag flight interpolates position and spin, caps extrapolation, and follows authoritative landing',()=>{
 const flight=new BagFlight();flight.push(bag,1000);flight.push({...bag,x:.6,spin:.175},1050);
 assert.ok(Math.abs(flight.sample(1025).x-.3)<1e-8);assert.ok(Math.abs(flight.sample(1025).pitch-.0875)<1e-8);
 const predicted={...flight.sample(1100)};assert.ok(Math.abs(predicted.x-1.2)<1e-8);assert.ok(predicted.y<1);
 assert.ok(Math.abs(flight.sample(5000).x-1.5)<1e-8,'stale packets cannot send a bag flying forever');
 flight.push({...bag,x:1.1,y:0,flying:false,vx:0},1100);assert.equal(flight.sample(1150).x,1.1);assert.equal(flight.sample(1150).y,0);
 flight.push({...bag,x:10,owner:'b',flying:false},1200);assert.equal(flight.sample(1000).x,10,'ownership change clears the old flight');
});
test('throw wind-up keeps the bag and throwing arm out of the camera near plane',()=>{
 const source=new AnimationClip('Throw',.91,[new VectorKeyframeTrack('BagGrip.position',[0,.32,.91],[.29,-.12,-.65,.44,.1,-.16,.29,-.12,-.65]),new VectorKeyframeTrack('RightArm.position',[0,.32,.91],[.28,-.09,-.65,.43,.14,-.13,.29,-.26,-.48])]);
 const fixed=bagThrowClip(source);for(const track of fixed.tracks)for(let i=2;i<track.values.length;i+=3)assert.ok(track.values[i]<=-.48+1e-6);
 assert.equal(source.tracks[0].times.length,3,'source animation stays reusable');assert.equal(fixed.duration,.91);
});
test('release and landing replace an older ownership state even at the same snapshot time',()=>{
 const flight=new BagFlight();flight.push({...bag,owner:'a',flying:false,x:0,z:0},1000);
 flight.push({...bag,owner:'',flying:true,x:2,z:-1,releasedAt:1000},1000);
 assert.equal(flight.sample(1000).x,2);assert.equal(flight.sample(1000).z,-1);
 flight.push({...bag,x:3,y:0,flying:false},1000);assert.equal(flight.sample(1000).x,3);assert.equal(flight.sample(1000).y,0);
});
