import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Animation feature is JavaScript.
import {sampleKarambitAttack,KARAMBIT_ATTACK_DURATION,KARAMBIT_CONTACT_TIME} from '../apps/client/src/npcPrototype/src/interactions/knife/karambit-attack.js';
test('Karambit slashes travel across the view, alternate direction, and recover without a pose snap',()=>{
 for(const variant of [0,1]){
  const neutral=sampleKarambitAttack(0,variant);assert.deepEqual(sampleKarambitAttack(KARAMBIT_ATTACK_DURATION,variant),neutral);
  const contact=sampleKarambitAttack(KARAMBIT_CONTACT_TIME,variant);
  assert.ok(Math.abs(contact.x)>Math.abs(contact.z)*1.4,'contact is a lateral slash');
  let previous=neutral;
  for(let t=1/240;t<KARAMBIT_ATTACK_DURATION;t+=1/240){const pose=sampleKarambitAttack(t,variant);for(const key of Object.keys(pose)){assert.ok(Number.isFinite(pose[key]));assert.ok(Math.abs(pose[key]-previous[key])<.11,`continuous ${key}`);}previous=pose;}
  assert.deepEqual(sampleKarambitAttack(-1,variant),neutral);assert.deepEqual(sampleKarambitAttack(10,variant),neutral);
 }
 assert.ok(sampleKarambitAttack(.23,0).x*sampleKarambitAttack(.23,1).x<0);
});
