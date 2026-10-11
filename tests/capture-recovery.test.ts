import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CaptureRecovery,resumeKey} from '../apps/client/src/multiplayer/captureRecovery.ts';
function fixture(){
 let locked=false,allowed=true,focused=true,requests=0,captured=0,waiting=0;
 const port={locked:()=>locked,allowed:()=>allowed,focused:()=>focused,request:async()=>{requests++;locked=true;},release:()=>{locked=false;},captured:()=>{captured++;},waiting:()=>{waiting++;}};
 return {port,recovery:new CaptureRecovery(port),state:()=>({requests,captured,waiting,locked}),lock:(v:boolean)=>locked=v,allow:(v:boolean)=>allowed=v,focus:(v:boolean)=>focused=v};
}
test('a rejected Escape capture waits for the next movement gesture and retries once',async()=>{
 const f=fixture();f.port.request=async()=>{throw Error('gesture required');};await f.recovery.resume();
 assert.equal(f.recovery.waiting,true);assert.equal(f.state().waiting,1);
 f.port.request=async()=>{f.lock(true);};await f.recovery.resume();assert.equal(f.state().captured,1);assert.equal(f.recovery.waiting,false);
});
test('pending requests do not multiply and a late result cannot undo an explicit pause',async()=>{
 const f=fixture();let finish!:()=>void;f.port.request=()=>new Promise<void>(resolve=>{finish=()=>{f.lock(true);resolve();};});
 const first=f.recovery.resume();await f.recovery.resume();f.recovery.cancel();finish();await first;f.recovery.changed();
 assert.equal(f.state().captured,0);assert.equal(f.state().locked,false);
});
test('legacy pointer-lock events complete a request while focus loss rejects it',async()=>{
 const f=fixture();f.port.request=()=>Promise.resolve();await f.recovery.resume();assert.equal(f.recovery.pending,true);
 f.focus(false);f.lock(true);f.recovery.changed();assert.equal(f.state().locked,false);assert.equal(f.state().captured,0);
 f.recovery.cancel();f.focus(true);await f.recovery.resume();f.lock(true);f.recovery.changed();assert.equal(f.state().captured,1);
});
test('movement and Enter resume; interaction, combat, settings keys do not',()=>{
 for(const code of ['KeyW','KeyA','KeyS','KeyD','Space','Enter'])assert.equal(resumeKey(code),true);
 for(const code of ['KeyE','KeyF','KeyP','KeyM','KeyV','Tab'])assert.equal(resumeKey(code),false);
});
