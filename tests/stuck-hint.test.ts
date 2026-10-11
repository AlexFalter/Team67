import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StuckDetector} from '../apps/client/src/multiplayer/stuckHint.ts';
const position={x:10,y:20,z:30,vehicleId:''};
function hold(detector:StuckDetector, start:number, end:number, p=position, eligible=true){
 let result=false;
 for(let now=start;now<=end;now+=100)result=detector.update(p,now,eligible);
 return result;
}
test('stationary coordinates trigger at five seconds without requiring movement input and ignore minor collision jitter',()=>{
 const detector=new StuckDetector();
 assert.equal(hold(detector,0,4900),false);
 assert.equal(detector.update({...position,x:10.08},5000,true),true);
 assert.equal(detector.update({...position,y:20.05},5100,true),true);
});
test('movement, menus, interactions and changing vehicle reset the timer',()=>{
 const detector=new StuckDetector();
 assert.equal(hold(detector,0,5000),true);
 assert.equal(detector.update({...position,z:31},5100,true),false);
 assert.equal(hold(detector,5200,10000,{...position,z:31}),false);
 assert.equal(detector.update({...position,z:31},10100,false),false);
 assert.equal(hold(detector,10200,15000,{...position,z:31}),false);
 assert.equal(detector.update({...position,z:31,vehicleId:'lime-7'},15100,true),false);
 assert.equal(hold(detector,15200,20000,{...position,z:31,vehicleId:'lime-7'}),false);
});
test('slow progress and vertical movement count; background-tab gaps do not trigger warnings',()=>{
 const detector=new StuckDetector();
 for(let now=0;now<=10000;now+=100)assert.equal(detector.update({...position,x:10+now/10000},now,true),false);
 assert.equal(detector.update(position,20000,true),false);
 assert.equal(hold(detector,20100,24900),false);
 assert.equal(detector.update({...position,y:21},25000,true),false);
 assert.equal(detector.update(position,100,true),false,'clock reset starts a fresh window');
});
