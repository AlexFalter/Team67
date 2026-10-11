import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {FootballManager} from '../apps/server/src/football.ts';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {withServer,startRound,until,type WireState} from './fixture.ts';
function fixture(){
 const site=C.NPC_LAYOUT.football.position,state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt:123}),p=new Player({x:site[0],y:0,z:site[2]}),hits:string[]=[];
 const world={...C.flatWorld,height:()=>0,blocked:()=>false,bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500}};
 let busy=false;const manager=new FootballManager(state,world,(from,to)=>{hits.push(`${from}:${to}`);return true;},()=>busy),client={sessionId:'a',send:()=>{}};
 state.players.set('a',p);p.y=site[1];
 const command=(action:string,extra:Record<string,unknown>={},who=client)=>manager.command(who,{action,roundStartedAt:123,...extra},1000);
 return {state,p,hits,manager,command,client,busy:(value:boolean)=>{busy=value;}};
}
test('football reward is proximity-checked, once per round, and cannot be kicked by another owner or with invalid aim',()=>{
 const f=fixture();f.p.x+=10;f.command('reward');assert.equal(f.state.footballs.size,0);f.p.x-=10;
 f.manager.command(f.client,{action:'reward',roundStartedAt:122},1000);assert.equal(f.state.footballs.size,0);
 f.command('reward');f.command('reward');assert.equal(f.state.footballs.size,1);
 f.state.players.set('b',new Player());f.command('kick',{aim:[1,0,0]},{sessionId:'b',send:()=>{}});const ball=[...f.state.footballs.values()][0];assert.equal(ball.owner,'a');
 for(const aim of [[NaN,0,0],[0,0,0],[100,0,0]]){f.command('kick',{aim});assert.equal(ball.owner,'a');}
 f.busy(true);f.command('kick',{aim:[1,0,0]});assert.equal(ball.owner,'a');f.busy(false);
 f.manager.reset();assert.equal(f.state.footballs.size,0);f.command('reward');assert.equal(f.state.footballs.size,1);
});
test('kick sweeps into a player once, settles, and can be collected by another player without duplicating ownership',()=>{
 const f=fixture();f.command('reward');f.p.y=0;f.state.players.set('b',new Player({x:f.p.x+3,y:0,z:f.p.z}));
 f.command('kick',{aim:[1,0,0]});const [id,b]=[...f.state.footballs][0];assert.equal(b.owner,'');assert(b.flying);
 for(let now=1000;now<=6500;now+=50)f.manager.tick(now);
 assert.deepEqual(f.hits,['a:b']);assert.equal(b.flying,false);assert.equal(b.y,.22);
 const guest={sessionId:'b',send:()=>{}};f.command('pickup',{id},guest);assert.equal(b.owner,'');
 Object.assign(f.state.players.get('b')!,{x:b.x,z:b.z,y:0});f.command('pickup',{id},guest);assert.equal(b.owner,'b');f.command('kick',{aim:[1,0,0]});assert.equal(b.owner,'b');
 f.manager.leave('b');assert.equal(b.owner,'');
});
test('football kicks and pickups respect walls',()=>{
 const f=fixture();f.command('reward');f.p.y=0;const ball=[...f.state.footballs.values()][0];
 const wallWorld={...C.flatWorld,height:()=>0,blocked:(x:number)=>x>f.p.x+.2,bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500}};
 const manager=new FootballManager(f.state,wallWorld,()=>false);
 manager.command(f.client,{action:'kick',aim:[1,0,0],roundStartedAt:123},1000);assert.equal(ball.owner,'a');
 ball.owner='';ball.x=f.p.x+1;ball.y=.22;manager.command(f.client,{action:'pickup',id:[...f.state.footballs.keys()][0],roundStartedAt:123},1000);assert.equal(ball.owner,'');
});
test('two live clients see the same awarded and kicked football', {timeout:30000},async()=>{
 await withServer(async(client,rooms)=>{
  const host=await client.create<WireState>('race',{name:'Kicker',devMode:true,skipIntro:true,mapTeleport:true,moodleEnabled:false});rooms.push(host);
  const guest=await client.joinById<WireState>(host.roomId,{name:'Viewer'});rooms.push(guest);
  host.onMessage('playerCorrection',()=>{});host.onMessage('mapTeleportResult',()=>{});
  await startRound(host,[host,guest]);const site=C.NPC_LAYOUT.football.position;
  host.send('debugMapTeleport',{x:site[0],z:site[2],roundStartedAt:host.state.startedAt});
  await until(()=>Math.abs(host.state.players.get(host.sessionId)!.x-site[0])<1,'host arrives at Tim Gio');
  host.send('football',{action:'reward',roundStartedAt:host.state.startedAt});
  await until(()=>guest.state.footballs?.size===1,'football reward replicated');
  const id=`football-${host.sessionId}`;assert.equal(guest.state.footballs!.get(id)!.owner,host.sessionId);
  host.send('football',{action:'kick',aim:[1,0,0],roundStartedAt:host.state.startedAt});
  await until(()=>guest.state.footballs!.get(id)!.flying,'kick replicated');
  assert.equal(guest.state.footballs!.get(id)!.owner,'');const start=guest.state.footballs!.get(id)!.x;
  await until(()=>Math.abs(guest.state.footballs!.get(id)!.x-start)>.5,'shared projectile moves');
 },'zurich');
});
