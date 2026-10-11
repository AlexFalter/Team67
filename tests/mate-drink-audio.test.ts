import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../apps/client/src/multiplayer/gameAudio.ts';
import {mateDrinkPose,MATE_BURP_SECONDS} from '../apps/client/src/multiplayer/characters/mateDrink.ts';

test('can opens once, then burps after drinking; pauses and late snapshots never replay sounds',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
 const played:string[]=[];const context={state:'running',currentTime:0,createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource:()=>({buffer:{name:''},playbackRate:{value:1},connect(){},disconnect(){},start(){played.push(this.buffer.name);}})};
 const audio=Object.create(GameAudio.prototype) as GameAudio;
 Object.assign(audio,{context,master:{},buffers:new Map(['mate-can-open','mate-burp'].map(name=>[name,{name}])),shots:new Set(),cooldowns:new Map(),paused:false,settings:{vehicleSounds:true}});
 try{
  audio.updateMateDrink(1000,1000);audio.updateMateDrink(1000,1100);audio.updateMateDrink(1000,2000);assert.deepEqual(played,['mate-can-open']);
  audio.updateMateDrink(1000,1000+MATE_BURP_SECONDS*1000);audio.updateMateDrink(1000,4000);assert.deepEqual(played,['mate-can-open','mate-burp']);
  Object.assign(audio,{paused:true});audio.updateMateDrink(5000,5000);audio.updateMateDrink(5000,7500);Object.assign(audio,{paused:false});audio.updateMateDrink(5000,7600);assert.equal(played.length,2);
  audio.updateMateDrink(10000,15000);assert.equal(played.length,2,'joining after drinking does not replay it');
  audio.settings.vehicleSounds=false;audio.updateMateDrink(20000,20000);audio.updateMateDrink(20000,22500);assert.equal(played.length,2,'sound setting applies to both cues');
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
test('opening precedes the sip and the burp follows lowering the can',()=>{
 assert(mateDrinkPose(.25).open>.9);assert.equal(mateDrinkPose(.25).sip,0);
 assert.equal(mateDrinkPose(1.2).sip,1);assert.equal(mateDrinkPose(1.2).burp,0);
 assert.equal(mateDrinkPose(2.35).sip,0);assert(mateDrinkPose(2.35).burp>.9);
 assert.equal(mateDrinkPose(2.7).active,false);
});
