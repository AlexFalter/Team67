import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enterSpectator} from '../apps/server/src/spectator.ts';
import {RaceState,Player,RoomMember} from '../apps/server/src/state.ts';
import {withServer,until,startRound,delay} from './fixture.ts';

test('spectator conversion requires an active round, current request and no vehicle',()=>{
 const state=new RaceState({startedAt:123});const p=new Player();state.players.set('a',p);state.members.set('a',new RoomMember());let released=false;
 const enter=(data:unknown,play=true)=>enterSpectator(state,'a',data,()=>play,()=>{released=true;});
 assert.equal(enter(null),false);assert.equal(enter({roundStartedAt:0}),false);assert.equal(enter({roundStartedAt:123},false),false);
 p.vehicleId='tram';assert.equal(enter({roundStartedAt:123}),false);p.vehicleId='';
 assert.equal(enter({roundStartedAt:123}),true);assert.equal(released,true);assert.equal(state.players.has('a'),false);assert.equal(state.members.get('a')!.spectator,true);
});

test('two clients: spectating removes gameplay, preserves membership, blocks movement, and resets next round',{timeout:30000},async()=>{
 await withServer(async(client,rooms)=>{
  const a=await client.create('race',{name:'Watcher',code:'spectatetest'});rooms.push(a);
  const b=await client.joinById(a.roomId,{name:'Runner'});rooms.push(b);
  await startRound(a,[a,b]);let accepted=false;a.onMessage('spectateResult',(r:{ok:boolean})=>{accepted=r.ok;});
  a.send('spectate',{roundStartedAt:a.state.startedAt});await until(()=>accepted&&a.state.members.get(a.sessionId)?.spectator&&!b.state.players.has(a.sessionId),'spectator state shared');
  assert.equal(b.state.players.has(b.sessionId),true);assert.equal(b.state.members.has(a.sessionId),true);
  a.send('move',[0,0,0,0,0,0,0,0]);await delay(100);assert.equal(b.state.players.has(a.sessionId),false);
  a.send('finishRound');await until(()=>a.state.phase==='Finished','round ends');a.send('restartRound');await until(()=>a.state.phase==='Lobby'&&a.state.players.has(a.sessionId),'watcher restored');assert.equal(a.state.members.get(a.sessionId).spectator,false);
 });
});
