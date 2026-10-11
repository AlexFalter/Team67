import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene} from 'three';
import {TRAM_KIND,POLYBAHN_KIND,type WorldState} from '../packages/shared/src/index.ts';
import {TrafficRenderer} from '../apps/client/src/multiplayer/traffic.ts';
import {railSoundProfile,trafficEngineSource} from '../apps/client/src/multiplayer/vehicleSoundProfiles.ts';
import {transitAudioBuffers} from '../apps/client/src/multiplayer/transitAudio.ts';
import {GameAudio,type LoopSource} from '../apps/client/src/multiplayer/gameAudio.ts';

test('road audio follows interpolated grounded cars and varies by model',()=>{
 const renderer=new TrafficRenderer(new Scene(),{height:()=>7});
 const state={serverTime:1000,trafficCars:new Map([['car',{x:0,y:8,z:0,rotY:0,speed:5,kind:1}]])} as unknown as WorldState;
 try{
  renderer.patch(state);state.serverTime=1100;state.trafficCars!.get('car')!.x=10;state.trafficCars!.get('car')!.speed=15;renderer.patch(state);renderer.render(1050);
  const sound=renderer.audioSources.get('traffic:car')!;
  assert.equal(sound.x,5);assert.equal(sound.y,7);assert.equal(sound.speed,10);assert.equal(sound.sample,'car-engine');
  const pose={x:0,y:0,z:0,rotY:0,speed:10};
  const sedan=trafficEngineSource({...pose,kind:0}),sports=trafficEngineSource({...pose,kind:1}),tractor=trafficEngineSource({...pose,kind:2});
  assert(sports.rate!>sedan.rate!);assert.equal(tractor.sample,'bus-engine');assert(tractor.rate!<sedan.rate!);
  assert(trafficEngineSource({...pose,speed:20}).rate!>sedan.rate!);
  state.trafficCars!.clear();renderer.patch(state);renderer.render(1100);assert.equal(renderer.audioSources.size,0);
 }finally{renderer.dispose();}
});

test('transit loops and chimes are distinct, finite buffers with quiet edges',()=>{
 const sampleRate=8000;
 const buffers=transitAudioBuffers({sampleRate,createBuffer(_channels,length){const data=new Float32Array(length);return {getChannelData:()=>data} as unknown as AudioBuffer;}});
 for(const [name,b] of buffers){
  const data=b.getChannelData(0);assert(data.some(v=>Math.abs(v)>.1),`${name} is audible`);
  assert(data.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));assert.equal(Math.abs(data[0]),0);assert(Math.abs(data.at(-1)!)<.005);
 }
 assert.equal(railSoundProfile(POLYBAHN_KIND,5).sample,'polybahn-running');assert.equal(railSoundProfile(TRAM_KIND,5).sample,'rail-running');
 assert.notEqual(railSoundProfile(POLYBAHN_KIND,5).departureChime,railSoundProfile(TRAM_KIND,5).departureChime);
});

test('departure chimes play once on door closing, with no initial, arrival, pause or mute replay',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
 const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(){},setTargetAtTime(){}});
 const starts:string[]=[];
 const context={currentTime:1,createGain:()=>({gain:param(),connect(){},disconnect(){}}),createBufferSource:()=>({buffer:'',playbackRate:param(),connect(){},disconnect(){},start(){starts.push(this.buffer);},stop(){}})};
 const audio=Object.create(GameAudio.prototype) as GameAudio;
 Object.assign(audio,{context,master:{},buffers:new Map([['tram-chime','tram-chime'],['polybahn-chime','polybahn-chime'],['vehicle-door','door']]),voices:new Map(),previous:new Map(),shots:new Set(),cooldowns:new Map(),settings:{vehicleSounds:true}});
 const source:LoopSource={...railSoundProfile(TRAM_KIND,0),motor:false,speed:0,active:true,x:0,y:0,z:0,aboard:false,door:false};
 const sources=new Map([['tram',source]]),listener={x:0,y:0,z:0};
 const chimes=()=>starts.filter(s=>s==='tram-chime').length;
 try{
  audio.update(sources,listener);assert.equal(chimes(),0,'initially closed doors are silent');
  source.door=true;audio.update(sources,listener);assert.equal(chimes(),0,'arriving does not play departure chime');
  source.door=false;audio.update(sources,listener);audio.update(sources,listener);assert.equal(chimes(),1);
  context.currentTime+=3;source.door=true;audio.update(sources,listener);source.door=false;audio.update(sources,listener,{paused:true});audio.update(sources,listener);assert.equal(chimes(),1);
  context.currentTime+=3;source.door=true;audio.update(sources,listener);source.door=false;audio.settings.vehicleSounds=false;audio.update(sources,listener);audio.settings.vehicleSounds=true;audio.update(sources,listener);assert.equal(chimes(),1);
  source.door=true;audio.update(sources,listener);source.door=false;audio.update(sources,{x:100,y:0,z:0});assert.equal(chimes(),1,'far departures are silent');
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
