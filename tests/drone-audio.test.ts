import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DroneSoundCues,type DroneAudioState} from '../apps/client/src/multiplayer/streaks/droneSoundCues.ts';
const base:DroneAudioState={round:1,ready:false,callUntil:0,scanUntil:0,sweepAt:0};
test('UAV sounds follow confirmed call, three tablet taps, scans and expiry without duplication',()=>{
 const cues=new DroneSoundCues();cues.update(base,950,true);
 assert.deepEqual(cues.update({...base,ready:true},980,true),['ready']);
 const active={...base,callUntil:3400,scanUntil:33400};
 assert.deepEqual(cues.update(active,1050,true),['request']);assert.deepEqual(cues.update(active,1060,true),[]);
 for(const at of [1816,2248,2680]){assert.deepEqual(cues.update(active,at,true),['tablet']);assert.deepEqual(cues.update(active,at+1,true),[]);}
 assert.deepEqual(cues.update(active,3400,true),['online']);
 assert.deepEqual(cues.update({...active,sweepAt:3400},3410,true),['scan']);
 assert.deepEqual(cues.update({...active,sweepAt:3400},3420,true),[]);
 assert.deepEqual(cues.update({...active,sweepAt:5400},5410,true),['scan']);
 cues.update(active,33390,true);assert.deepEqual(cues.update(active,33400,true),['end']);assert.deepEqual(cues.update(active,33410,true),[]);
});
test('muting, pause and stale packets do not replay old UAV sounds',()=>{
 const cues=new DroneSoundCues(),active={...base,callUntil:3400,scanUntil:33400};
 assert.deepEqual(cues.update(active,1000,false),[]);assert.deepEqual(cues.update(active,1100,true),[]);
 cues.update(active,1816,false);assert.deepEqual(cues.update(active,1830,true),[]);
 assert.deepEqual(cues.update({...active,sweepAt:3400},10000,true),[]);
 assert.deepEqual(cues.update({...active,round:2,callUntil:0,scanUntil:0},33400,true),[]);
});
