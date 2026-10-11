import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../apps/client/src/multiplayer/gameAudio.ts';

test('exam ticks once per second, even with the world mix paused, and never catches up',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 const doc={hidden:false};Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 const audio=Object.create(GameAudio.prototype) as GameAudio,plays:string[]=[];
 const context={state:'running'};
 Object.assign(audio,{context,settings:{vehicleSounds:true},paused:true,play:(sample:string)=>plays.push(sample)});
 try{
  audio.examClock(1000,true);audio.examClock(1100,true);audio.examClock(1900,true);assert.equal(plays.length,0);
  audio.examClock(2000,true);audio.examClock(2100,true);assert.deepEqual(plays,['exam-tick']);
  audio.examClock(5000,true);assert.equal(plays.length,2,'a delayed frame produces only one tick');
  audio.examClock(6000,false);audio.examClock(10000,true);assert.equal(plays.length,2,'return from spectator or pause does not replay missed ticks');
  audio.settings.vehicleSounds=false;audio.examClock(11000,true);audio.settings.vehicleSounds=true;audio.examClock(12000,true);assert.equal(plays.length,2);
  doc.hidden=true;audio.examClock(13000,true);doc.hidden=false;audio.examClock(14000,true);assert.equal(plays.length,2);
  context.state='suspended';audio.examClock(15000,true);context.state='running';audio.examClock(16000,true);assert.equal(plays.length,2);
  audio.examClock(17000,true);assert.equal(plays.length,3);
  audio.examClock(18000,false);audio.examClock(Infinity,true);audio.examClock(20000,true);assert.equal(plays.length,3,'stopped exams reset the clock');
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
