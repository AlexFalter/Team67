import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatPetting} from '../apps/client/src/npcPrototype/src/npcs/cat/cat-petting.js';
import config from '../apps/client/src/npcPrototype/game.config.json' with {type:'json'};
import {LocalPlayer} from '../apps/client/src/multiplayer/localPlayer.ts';
import {createBody,stepMovement,flatWorld} from '../packages/shared/src/index.ts';

test('original cat accepts gentle strokes and only bites after sustained rough petting',()=>{
 let wins=0,bites=0;
 const pet=createCatPetting(config.npcs.cat,{onComplete:()=>wins++,onBite:()=>bites++});
 pet.start(0,0,0);let time=0;
 for(let pass=0;pass<5;pass++)for(let i=1;i<=20;i++){
  time+=50;pet.move(pass%2?1-i/20:i/20,0,time);
 }
 assert.equal(wins,1);assert.equal(bites,0);
 pet.reset();pet.start(0,0,0);time=0;
 for(let pass=0;pass<5;pass++)for(let i=1;i<=20;i++){
  time+=50;const t=pass%2?1-i/20:i/20;
  pet.move(-.47*t,.47*t*t,time);
 }
 assert.equal(wins,2,'following the curved back counts as a continuous stroke');
 pet.reset();pet.start(0,0,0);pet.move(1,0,10);
 assert.equal(bites,0,'one abrupt move is forgiven');
 pet.move(1,0,1000);assert.equal(pet.state().roughness,0);
 pet.reset();pet.start(0,0,0);
 for(let i=1;i<=30;i++)pet.move(i%2,0,i*20);
 assert.equal(bites,1);assert.equal(pet.state().phase,'bitten');
 pet.reset();assert.equal(pet.state().phase,'petting');assert.equal(pet.state().strokes,0);
});

test('cat slowdown uses the normal movement input and leaves ride input unaffected',()=>{
 const local=Object.create(LocalPlayer.prototype) as LocalPlayer;
 Object.assign(local,{body:createBody(),enabled:true,keys:new Set(['KeyW']),input:{},movementMultiplier:.7});
 const input={...local.controls(0)};
 assert.ok(Math.abs(Math.hypot(input.x,input.z)-.7)<1e-6);
 const slowed=createBody(),normal=createBody();
 for(let now=0;now<2000;now+=17){
  stepMovement(slowed,input,1/60,now,flatWorld);
  stepMovement(normal,{...input,x:0,z:-1},1/60,now,flatWorld);
 }
 assert.ok(Math.abs(Math.hypot(slowed.vx,slowed.vz)/Math.hypot(normal.vx,normal.vz)-.7)<.01);
 local.body.vehicleId='test-bike';
 assert.equal(Math.hypot(local.controls(0).x,local.controls(0).z),1);
 local.body.vehicleId='';
 local.movementMultiplier=1;
 assert.equal(Math.hypot(local.controls(0).x,local.controls(0).z),1);
});
