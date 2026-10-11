import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awpAudioCues} from '../apps/client/src/multiplayer/weapons/awpSoundCues.ts';
import {AwpSounds} from '../apps/client/src/multiplayer/weapons/AwpSounds.ts';
test('mechanical cues follow bolt and magazine phases exactly once per crossing',()=>{
 assert.deepEqual(awpAudioCues('bolt',0,.15),['bolt-up']);assert.deepEqual(awpAudioCues('bolt',.15,.8),['bolt-back']);assert.deepEqual(awpAudioCues('bolt',.8,1.4),['mag-in','bolt-forward','bolt-down']);assert.deepEqual(awpAudioCues('bolt',1.4,1.4),[]);
 assert.deepEqual(awpAudioCues('reload',0,.2),['mag-out']);assert.deepEqual(awpAudioCues('reload',.2,1),['mag-in']);assert.deepEqual(awpAudioCues('reload',1,1.8),['bolt-back','bolt-forward','bolt-down']);
});
test('sound playback preloads, avoids duplicate cues, skips paused phases and stops on disposal',async()=>{
 const original=globalThis.fetch,played:number[]=[],voices:{stopped:boolean}[]=[];
 globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));let serial=0;
 const context={state:'running',destination:{},decodeAudioData:async()=>({id:++serial}),createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource:()=>{const voice={buffer:{id:0},stopped:false,connect(){},disconnect(){},start(){played.push(this.buffer.id);},stop(){this.stopped=true;},onended:null};voices.push(voice);return voice;}} as unknown as AudioContext;
 try{const sounds=new AwpSounds(()=>context);await sounds.ready;sounds.update('bolt',1000,0,true);sounds.update('bolt',1000,.2,true);assert.equal(played.length,1);sounds.update('bolt',1000,.2,true);assert.equal(played.length,1);sounds.update('bolt',1000,.5,false);sounds.update('bolt',1000,.6,true);assert.equal(played.length,1);sounds.update('bolt',1000,.99,true);assert.equal(played.length,2);sounds.update('reload',3000,0,true);sounds.update('reload',3000,.2,true);assert.equal(played.length,3);sounds.dispose();assert(voices.every(v=>v.stopped));}finally{globalThis.fetch=original;}
});

test('accepted firing plays the downloaded shot once, resumes audio, and respects disposal',async()=>{
 const original=globalThis.fetch,urls:string[]=[],played:number[]=[],gains:number[]=[];let serial=0,resumes=0;
 globalThis.fetch=async input=>{urls.push(String(input));return new Response(new Uint8Array([1]));};
 const context={state:'suspended',destination:{},async resume(){resumes++;this.state='running';},decodeAudioData:async()=>({id:++serial}),createGain:()=>({gain:{set value(v:number){gains.push(v);}},connect(){},disconnect(){}}),createBufferSource:()=>({buffer:{id:0},connect(){},disconnect(){},start(){played.push(this.buffer.id);},stop(){},onended:null})};
 try{const sounds=new AwpSounds(()=>context as unknown as AudioContext);await sounds.ready;assert(urls.includes('/audio/awp/nerf-fire.mp3'));sounds.fire();await new Promise(resolve=>setImmediate(resolve));assert.equal(resumes,1);assert.deepEqual(played,[1]);assert.deepEqual(gains,[.65]);sounds.fire();assert.deepEqual(played,[1,1]);sounds.dispose();sounds.fire();assert.deepEqual(played,[1,1]);}finally{globalThis.fetch=original;}
});
