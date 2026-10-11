import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {RoundManager} from '../apps/server/src/round.ts';
import {MoodleEvents} from '../apps/server/src/moodle.ts';
import {withServer,until,delay,type WireState} from './fixture.ts';

test('admin free roam survives the normal deadline and can still be explicitly finished',()=>{
 const state=new RaceState();state.adminMode=true;
 const rounds=new RoundManager(state,1000,undefined,undefined,{durationMs:0,leadMs:0});
 rounds.join('host',{name:'Host'});state.players.set('host',new Player());rounds.ready('host',true,1000);
 assert.equal(state.endsAt,Number.MAX_SAFE_INTEGER);rounds.tick(1000000);
 assert.equal(state.phase,C.RoomPhase.Running);assert.equal(rounds.canPlay('host',1000000),true);
 rounds.finish(1000000);assert.equal(state.phase,C.RoomPhase.Finished);
 rounds.restart('host');rounds.ready('host',true,2000000);assert.equal(state.endsAt,Number.MAX_SAFE_INTEGER);
});

test('enabling Moodle starts a fresh interval and rewards do not alter the untimed deadline',()=>{
 const state=new RaceState();state.adminMode=true;state.endsAt=Number.MAX_SAFE_INTEGER;state.moodleEnabled=false;state.players.set('host',new Player());
 const moodle=new MoodleEvents(state,()=>{},()=>true,()=>0);
 moodle.tick(1000);moodle.tick(100000);assert.equal(state.moodleDeadline,0);
 moodle.enabled(true);moodle.tick(100000);assert.equal(state.moodleDeadline,0);
 moodle.tick(125000);assert.ok(state.moodleDeadline>125000);
 assert.equal(moodle.answer('host',{id:state.moodleEventId,answer:1,roundStartedAt:state.startedAt},125001),true);
 assert.equal(state.endsAt,Number.MAX_SAFE_INTEGER);
 moodle.enabled(false);assert.equal(state.moodleDeadline,0);
 moodle.enabled(true);moodle.tick(300000);assert.equal(state.moodleDeadline,0,'re-enabling does not immediately send an overdue notification');
});

test('live admin room stays playable, shares settings and only lets the host toggle Moodle', {timeout:20000},async()=>{
 await withServer(async(client,rooms)=>{
  const host=await client.create<WireState>('race',{name:'Admin',devMode:true,adminMode:true,skipIntro:true,moodleEnabled:false});rooms.push(host);
  const guest=await client.joinById<WireState>(host.roomId,{name:'Guest'});rooms.push(guest);
  host.send('ready',true);await until(()=>host.state.introComplete&&guest.state.introComplete,'free roam started');
  assert.equal(host.state.adminMode,true);assert.equal(guest.state.moodleEnabled,false);
  guest.send('moodleSettings',true);await delay(150);assert.equal(host.state.moodleEnabled,false);
  host.send('moodleSettings',true);await until(()=>guest.state.moodleEnabled===true,'host enabled Moodle');
  host.send('moodleSettings',false);await until(()=>guest.state.moodleEnabled===false,'host disabled Moodle');
  await delay(650);assert.equal(host.state.phase,C.RoomPhase.Running);
  let result:C.VehicleResult|undefined;host.onMessage('vehicleResult',data=>result=data as C.VehicleResult);
  host.send('vehicleEnter','cart-1');await until(()=>result?.ok===true,'vehicle boarding after normal deadline');
  await until(()=>host.state.players.get(host.sessionId)?.vehicleId==='cart-1','boarding state replicated');
  host.send('finishRound');await until(()=>host.state.phase===C.RoomPhase.Finished,'manual finish');
  const normal=await client.create<WireState>('race',{name:'Normal',adminMode:true});rooms.push(normal);
  await until(()=>normal.state.members?.size===1,'normal state');assert.equal(normal.state.adminMode,false);assert.equal(normal.state.moodleEnabled,true);
  const quiet=await client.create<WireState>('race',{name:'Quiet',moodleEnabled:false});rooms.push(quiet);
  await until(()=>quiet.state.members?.size===1,'quiet normal state');assert.equal(quiet.state.adminMode,false);assert.equal(quiet.state.moodleEnabled,false);
 },'flat',{ROUND_DURATION_MS:'500'});
});
