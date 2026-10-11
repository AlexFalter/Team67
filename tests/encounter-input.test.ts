import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Vector3} from 'three';
import {createBody} from '../packages/shared/src/index.ts';
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context);}});
const {NpcFeature}=await import('../apps/client/src/npcPrototype/host.js');

function fixture(run:(npc:any,pause:{hidden:boolean},doc:any)=>void){
 const original=Object.getOwnPropertyDescriptor(globalThis,'document'),pause={hidden:true},canvas={focus(){}};
 const doc={pointerLockElement:canvas as unknown,querySelector:()=>pause,exitPointerLock(){this.pointerLockElement=null;}};
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 const npc=Object.create(NpcFeature.prototype);
 Object.assign(npc,{canvas,phone:{active:()=>false,keydown:()=>false},features:[],pending:null,travel:null,limePhotoPending:null,message:{hidden:true},saved:null,poly:new Map(),ui:{children:[]},camera:{fov:60,up:new Vector3(0,1,0),updateProjectionMatrix(){}},local:{body:createBody(),enabled:true,clear(){}},net:{canPlay:true,npcPaused:false,now:()=>1000}});
 try{run(npc,pause,doc);}finally{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
}
function key(code='Escape',target={matches:()=>false}){return {code,target,repeat:false,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};}

test('mandatory encounters yield Escape to the pause menu without cancelling the encounter',()=>{
 for(const kind of ['finance','inspector','property','scooter','tourists','limePhoto','transition'])fixture(npc=>{
  const scene:{active:()=>boolean;keydown?:()=>never}={active:()=>true,keydown:()=>{throw Error('mandatory photo must not swallow Escape');}};
  npc[kind]=scene;npc.features=[scene];
  // Non-photo cinematic scenes do not have their own keyboard handler.
  if(kind!=='tourists'&&kind!=='limePhoto')delete scene.keydown;
  const e=key();npc.keydown(e);
  assert.equal(e.stopped,false,kind);assert.equal(npc.pauseAvailable,true,kind);assert.equal(scene.active(),true,kind);
 });
});

test('optional dialogues consume Escape before controls can open the menu',()=>{
 for(const name of ['Einstein','6–7 kid','food enthusiast','Michael','laptop','ticket machine'])fixture(npc=>{
  let open=true;const dialogue={active:()=>open,keydown:(e:ReturnType<typeof key>)=>{if(open&&e.code==='Escape'){open=false;return true;}return false;}};
  npc.features=[dialogue];npc.syncLock();const e=key();npc.keydown(e);
  assert.equal(open,false,name);assert.equal(e.stopped,true,name);assert.equal(e.prevented,true,name);assert.equal(npc.active,false,name);
 });
});

test('opening a phone inside an already locked helicopter releases the cursor and keeps the ride locked on close',()=>fixture((npc,_pause,doc)=>{
 let phone=false;npc.phone.active=()=>phone;
 const ride={active:()=>true,riding:()=>true,state:()=>({phase:'driving'}),modal:()=>false};npc.limo=ride;npc.features=[ride];npc.travel={kind:'limousine'};
 npc.ui.children=[{id:'game-phone',inert:false},{id:'dialogue',inert:false}];
 npc.syncLock();assert.notEqual(doc.pointerLockElement,null);assert.equal(npc.local.enabled,false);
 phone=true;npc.syncLock();assert.equal(doc.pointerLockElement,null);assert.equal(npc.ui.children[1].inert,true);assert.equal(npc.ui.children[0].inert,false);assert.equal(npc.pauseAvailable,false);
 phone=false;npc.syncLock();assert.equal(npc.local.enabled,false);assert.equal(npc.ui.children[1].inert,false);assert.equal(npc.pauseAvailable,true);
}));

test('phone is available in conversations and rides but cannot replace a camera, payment app or pause menu',()=>fixture((npc,pause)=>{
 npc.finance={active:()=>true};assert.equal(npc.canOpenPhone,true);
 npc.features=[{active:()=>true}];assert.equal(npc.canOpenPhone,true,'RPG dialogue permits the phone');
 npc.travel={kind:'limousine'};assert.equal(npc.canOpenPhone,true);
 for(const kind of ['tourists','limePhoto','ticketMachine','transition']){npc[kind]={active:()=>true};assert.equal(npc.canOpenPhone,false,kind);npc[kind]=null;}
 npc.limo={modal:()=>true};assert.equal(npc.canOpenPhone,false);npc.limo=null;
 pause.hidden=false;assert.equal(npc.canOpenPhone,false);
}));

test('phone Escape has priority over conversations; P typed into a dialogue input stays text',()=>fixture(npc=>{
 let open=true,calls=0;npc.phone.active=()=>open;npc.phone.keydown=(e:ReturnType<typeof key>)=>{calls++;if(e.code==='Escape'){open=false;e.preventDefault();return true;}return false;};
 let dialogueCalls=0;npc.features=[npc.phone,{active:()=>true,keydown:()=>{dialogueCalls++;return false;}}];
 const e=key();npc.keydown(e);assert.equal(e.stopped,true);assert.equal(dialogueCalls,0);assert.equal(open,false);
 npc.keydown(key('KeyP',{matches:()=>true}));assert.equal(calls,1,'typing P must not invoke the phone hotkey');
}));

test('pause overlay blocks encounter inputs and makes underlying panels inert',()=>fixture((npc,pause)=>{
 let handled=0;const scene={active:()=>true,keydown:()=>{handled++;return true;}};npc.features=[scene];npc.ui.children=[{id:'game-phone',inert:false},{id:'scene',inert:false}];
 pause.hidden=false;npc.keydown(key('Enter'));npc.syncLock();assert.equal(handled,0);assert.ok(npc.ui.children.every((p:{inert:boolean})=>p.inert));
 pause.hidden=true;npc.syncLock();assert.ok(npc.ui.children.every((p:{inert:boolean})=>!p.inert));
}));

test('conversations revoke gameplay capture before intentionally unlocking, for every NPC location',()=>{
 for(const name of ['scooter riders','Tim Gio','finance guy','ticket machine','Einstein','Polybahn passengers','Michael Jackson','tourists','phone'])fixture((npc,pause,doc)=>{
  const conversation={active:()=>true};npc.features=[conversation];let suspended=false,releases=0;
  npc.onSuspend=()=>{suspended=true;};
  doc.exitPointerLock=()=>{assert.equal(suspended,true,`${name}: capture ownership must clear before the release event`);doc.pointerLockElement=null;releases++;};
  npc.syncLock();
  assert.equal(releases,1,name);assert.equal(pause.hidden,true,name);assert.equal(npc.local.enabled,false,name);assert.equal(npc.saved.enabled,true,`${name}: dismissal remembers gameplay was enabled`);
  npc.syncLock();assert.equal(releases,1,'repeated frame updates do not release again');
 });
});

test('phone close explicitly returns capture to the ride without waiting for an animation frame',()=>fixture(npc=>{
 let captures=0,walkResumes=0;
 npc.limo={riding:()=>true,active:()=>true,state:()=>({phase:'driving'}),resumeLook:()=>{captures++;}};
 npc.features=[npc.limo];npc.travel={kind:'limousine'};npc.onResume=()=>{walkResumes++;};
 npc.syncLock();npc.resumeAfterPhone();assert.equal(captures,1);assert.equal(walkResumes,0);assert.equal(npc.local.enabled,false);
}));
