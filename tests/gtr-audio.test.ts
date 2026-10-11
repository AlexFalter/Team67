import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio, type LoopSource} from '../apps/client/src/multiplayer/gameAudio.ts';

test('donut engine fades with distance and stop on pause, mute and removal',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
 const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(){},setTargetAtTime(){}});
 const started:string[]=[],stopped:string[]=[];
 const context={currentTime:1,createGain:()=>({gain:param(),connect(){}}),createBufferSource:()=>({buffer:'',playbackRate:param(),connect(){},disconnect(){},start(){started.push(this.buffer);},stop(){stopped.push(this.buffer);}})};
 const voices=new Map<string,{target:number,source:unknown}>();
 const audio=Object.create(GameAudio.prototype) as GameAudio;
 Object.assign(audio,{context,master:{},buffers:new Map([['car-engine','engine']]),voices,previous:new Map(),shots:new Set(),settings:{vehicleSounds:true}});
 const engine:LoopSource={sample:'car-engine',motor:true,active:true,speed:11,x:0,y:0,z:0,aboard:false,range:50,volume:2,rate:1.35};
 const sources=new Map<string,LoopSource>([['engine',engine]]);
 try{
  audio.update(sources,{x:0,y:0,z:0});
  assert.deepEqual(started,['engine']);
  const near=voices.get('engine')!.target;assert.equal(near,.46);
  audio.update(sources,{x:25,y:0,z:0});assert.equal(voices.get('engine')!.target,near/4);
  audio.update(sources,{x:51,y:0,z:0});assert.equal(voices.get('engine')!.target,0);assert.equal(stopped.length,1);
  audio.update(sources,{x:0,z:0});audio.update(sources,{x:0,z:0},{paused:true});assert.equal(voices.get('engine')!.source,null);
  audio.settings.vehicleSounds=false;audio.update(sources,{x:0,z:0});assert.equal(voices.get('engine')!.target,0);
  audio.settings.vehicleSounds=true;audio.update(sources,{x:0,z:0});audio.update(new Map(),{x:0,z:0});assert.equal(voices.size,0);
  audio.update(new Map([['normal',{...engine,range:undefined,volume:undefined}]]),{x:0,z:0});assert.equal(voices.get('normal')!.target,.23,'other car levels remain unchanged');
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
