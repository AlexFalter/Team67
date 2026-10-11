import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {collisionProbes} from '../apps/client/src/multiplayer/collisionDebug.ts';

test('collision probes use terrain at the player level and the complete movement query',()=>{
 const calls:number[][]=[];
 const world={...C.flatWorld,height:(x:number,z:number,y?:number)=>{assert.equal(y,8);return x===1&&z===1?undefined:5;},blocked:(...args:number[])=>{calls.push(args);return args[0]===0;}};
 const points=collisionProbes(world,{x:0,y:8,z:0},1,1);
 assert.equal(points.length,8);assert.equal(calls.length,8);
 assert.ok(calls.every(c=>c[1]===8&&c[3]===C.CAPSULE_RADIUS&&c[4]===C.CAPSULE_HEIGHT));
 assert.ok(points.every(p=>p.y===5&&p.blocked===(p.x===0)));
});
