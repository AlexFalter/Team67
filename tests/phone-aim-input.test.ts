import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PhoneAimInput} from '../apps/client/src/multiplayer/phoneAimInput.ts';
const bounds={left:0,top:0,width:1440,height:900};
test('scanner starts at the centred reticle regardless of cursor handoff position',()=>{
 for(const [x,y] of [[0,0],[1440,900],[10,890],[900,20],[720,450]]){
  const input=new PhoneAimInput();
  assert.deepEqual(input.move(x,y,bounds),{x:0,y:0});
  assert.deepEqual(input.edgeMovement(1),{x:0,y:0});
  const dx=x>1000?-30:30,dy=y>700?-15:15;
  assert.deepEqual(input.move(x+dx,y+dy,bounds),{x:dx,y:dy});
 }
});
test('movement outside the phone still aims; viewport edges cannot trap the cursor',()=>{
 const input=new PhoneAimInput();input.move(20,300,bounds);
 assert.deepEqual(input.move(0,300,bounds),{x:-20,y:0});
 assert.deepEqual(input.edgeMovement(1),{x:-.45,y:0});
 input.move(40,300,bounds);assert.deepEqual(input.edgeMovement(1),{x:0,y:0});
 input.reset();assert.deepEqual(input.move(1200,800,bounds),{x:0,y:0});
 assert.deepEqual(input.move(100,100,bounds),{x:0,y:0},'ignore restore/resize jumps');
});
test('touch and resize never leave continuous edge turning active',()=>{
 const input=new PhoneAimInput();input.move(100,100,bounds,true);input.move(0,100,bounds,true);
 assert.deepEqual(input.edgeMovement(1),{x:0,y:0});input.reset();
 assert.deepEqual(input.move(0,100,bounds),{x:0,y:0});
});
