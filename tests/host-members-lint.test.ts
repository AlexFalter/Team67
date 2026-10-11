import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Linter} from 'eslint';
// @ts-expect-error JavaScript lint rule.
import {declaredHostMembers} from '../apps/client/lint/declared-host-members.mjs';
function lint(code:string){return new Linter().verify(code,{plugins:{encounters:{rules:{members:declaredHostMembers}}},rules:{'encounters/members':'error'}});}
test('stale passenger UI and removed menu reads fail lint before running the game',()=>{
 const errors=lint('class NpcFeature { update(){this.passengerPrompt.hidden=true;} get riding(){return this.menu.hidden;} }');
 assert.equal(errors.length,2);assert.ok(errors[0].message.includes('passengerPrompt'));assert.ok(errors[1].message.includes('menu'));
});
test('host accepts fields, constructor assignments, injected callbacks, getters and Object.assign dependencies',()=>{
 assert.deepEqual(lint('class NpcFeature { onResume=undefined; constructor(net){Object.assign(this,{net});this.message={hidden:true};} get active(){return !this.message.hidden;} update(){this.net.send();this.onResume?.();return this.active;} }'),[]);
});
