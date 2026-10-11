import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardAnimationFrame} from '../apps/client/src/scene/guardAnimationFrame.ts';
test('a runtime error stops later frames and reports only once, preventing a frozen-screen error flood',()=>{
 let frames=0;const failures:unknown[]=[],error=new TypeError('removed passenger menu');
 const frame=guardAnimationFrame(()=>{frames++;throw error;},e=>failures.push(e));
 for(let i=0;i<120;i++)frame();assert.equal(frames,1);assert.deepEqual(failures,[error]);
});
test('normal animation keeps running and a fresh instance works after restarting',()=>{
 let frames=0;const frame=guardAnimationFrame(()=>{frames++;},()=>assert.fail('unexpected error'));
 for(let i=0;i<120;i++)frame();assert.equal(frames,120);
});
