import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameControls} from '../apps/client/src/multiplayer/gameControls.ts';

test('a delayed cursor release during cinematic handoff keeps the menu closed, while gameplay Escape still pauses',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{pointerLockElement:null}});
 try {
  const sync=(GameControls.prototype as unknown as {syncPointerLock():void}).syncPointerLock;
  for(const enabled of [false,true]){
   let pauses=0;
   const controls={canvas:{},captured:true,local:{enabled},menu:{hidden:true},ready:()=>true,suspended:()=>false,pause:()=>{pauses++;},releasePauseAt:0};
   sync.call(controls);
   assert.equal(pauses,enabled?1:0);
   assert.equal(controls.captured,false);
  }
 } finally {if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
