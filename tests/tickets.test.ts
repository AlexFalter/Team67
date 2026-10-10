import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from 'colyseus';
import * as C from '../packages/shared/src/index.ts';
import { Npc, Player, RaceState, RoomMember } from '../apps/server/src/state.ts';
import { TicketMachine } from '../apps/server/src/tickets.ts';
import { VehicleManager } from '../apps/server/src/vehicles.ts';
import { withServer, startRound, type WireState, until } from './fixture.ts';

function fixture() {
  const state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt:1000,endsAt:100000}), now=2000;
  const machine=new TicketMachine(state,C.zurichWorld), site=C.ticketSite(C.zurichWorld), replies:C.TicketResult[]=[];
  const clients=['alice','bob'].map(sessionId=>{
    state.players.set(sessionId,new Player({...site,z:site.z-1.4}));state.members.set(sessionId,new RoomMember());state.npcs.set(sessionId,new Npc());
    return {sessionId,send:(type:string,result:C.TicketResult)=>{if(type==='ticketResult')replies.push(result);}} as unknown as Client;
  });
  const command=(i:number,action:C.TicketCommand['action'],extra:Partial<C.TicketCommand>={},at=now)=>machine.command(clients[i],{action,roundStartedAt:state.startedAt,...extra},at);
  return {state,now,machine,site,replies,clients,command};
}

test('two players independently pay and collect; early and duplicate collection are rejected',()=>{
  const f=fixture();f.command(0,'collect');assert.equal(f.replies.at(-1)!.ok,false);
  f.command(0,'pay',{tiles:[0,4,8]});f.command(1,'pay',{tiles:[8,0,4]});assert.ok(f.replies.slice(-2).every(r=>r.ok));
  f.command(0,'collect',{},f.now+C.TICKET_PRINT_MS-1);assert.equal(f.replies.at(-1)!.ok,false);
  f.command(0,'collect',{},f.now+C.TICKET_PRINT_MS);assert.equal(f.state.npcs.get('alice')!.ticketCount,1);assert.equal(f.state.npcs.get('bob')!.ticketCount,0);
  f.command(1,'collect',{},f.now+C.TICKET_PRINT_MS);assert.equal(f.state.npcs.get('bob')!.ticketCount,1);
  f.command(0,'collect',{},f.now+C.TICKET_PRINT_MS);assert.equal(f.replies.at(-1)!.ok,false);
});

test('tickets reject stale rounds, spectators, invalid captcha, rear access, vehicles, and knockdown',()=>{
  const f=fixture(),p=f.state.players.get('alice')!,member=f.state.members.get('alice')!,valid={tiles:[0,4,8]};
  f.command(0,'pay',{...valid,roundStartedAt:0});assert.equal(f.replies.at(-1)!.ok,false);
  member.spectator=true;f.command(0,'pay',valid);assert.equal(f.replies.at(-1)!.ok,false);member.spectator=false;
  for(const tiles of [[0,4,4],[0,4,8,1],['0',4,8] as unknown as number[]]){f.command(0,'pay',{tiles});assert.equal(f.replies.at(-1)!.ok,false);}
  p.z=f.site.z+1;f.command(0,'pay',valid);assert.equal(f.replies.at(-1)!.ok,false);p.z=f.site.z-1.4;
  p.vehicleId='cart-1';f.command(0,'pay',valid);assert.equal(f.replies.at(-1)!.ok,false);p.vehicleId='';
  p.knockdownUntil=f.now+1;f.command(0,'pay',valid);assert.equal(f.replies.at(-1)!.ok,false);p.knockdownUntil=0;
  assert.equal(f.state.npcs.get('alice')!.ticketReadyAt,0);
  f.command(0,'pay',valid);const deadline=f.state.npcs.get('alice')!.ticketReadyAt;f.command(0,'pay',valid,f.now+500);assert.equal(f.state.npcs.get('alice')!.ticketReadyAt,deadline);
});

test('successful Polybahn boarding consumes one ticket; failed boarding and other vehicles preserve it',()=>{
  const f=fixture(),manager=new VehicleManager(f.state,C.zurichWorld),p=f.state.players.get('alice')!,npc=f.state.npcs.get('alice')!;
  // The default cabin now starts along the track; ticket boarding is tested at its platform.
  const cabin=f.state.vehicles.get('polybahn-1')!;cabin.railDistance=0;Object.assign(cabin,C.railFrame(cabin));
  npc.ticketCount=1;manager.enter(f.clients[0],'polybahn-1',f.now);assert.equal(p.vehicleId,'');assert.equal(npc.ticketCount,1);
  const cart=f.state.vehicles.get('cart-1')!;Object.assign(p,{x:cart.x,y:cart.y,z:cart.z});p.vehicleId='';manager.enter(f.clients[0],'cart-1',f.now);assert.equal(npc.ticketCount,1);manager.exit(f.clients[0]);
  Object.assign(p,C.railBoardingPoint(f.state.vehicles.get('polybahn-1')!));manager.enter(f.clients[0],'polybahn-1',f.now);
  assert.equal(p.vehicleId,'polybahn-1');assert.equal(npc.ticketCount,0);assert.equal(npc.polybahnTicketed,true);
  const bob=f.state.players.get('bob')!;Object.assign(bob,C.railBoardingPoint(f.state.vehicles.get('polybahn-1')!));manager.enter(f.clients[1],'polybahn-1',f.now);
  assert.equal(bob.vehicleId,'polybahn-1');assert.equal(f.state.npcs.get('bob')!.polybahnTicketed,false);
});

test('current map has reachable ticket access, solid cabinet collision, and all stations inside the story boundary',()=>{
  const site=C.ticketSite(C.zurichWorld),front={...site,z:site.z-1.4};
  assert.ok(C.nearTicket(front,C.zurichWorld));assert.equal(C.zurichWorld.blocked(front.x,front.y,front.z,C.CAPSULE_RADIUS,C.CAPSULE_HEIGHT),false);
  assert.equal(C.zurichWorld.blocked(site.x,site.y,site.z,C.CAPSULE_RADIUS,C.CAPSULE_HEIGHT),true);
  const bounds=C.npcBounds(C.zurichWorld);
  for(const p of [C.zurichWorld.spawn,...C.polybahnPlatforms,...C.zurichWorld.route])assert.ok(Math.min(p.x-bounds.minX,bounds.maxX-p.x,p.z-bounds.minZ,bounds.maxZ-p.z)>13);
});

test('live rooms reject remote purchase and reset synchronized ticket inventory for the next round',async()=>{
  await withServer(async(client,rooms)=>{
    const a=await client.create<WireState>('race',{name:'Alice'});rooms.push(a);
    const b=await client.joinById<WireState>(a.roomId,{name:'Bob'});rooms.push(b);
    await startRound(a,[a,b]);assert.equal(a.state.npcs?.get(a.sessionId)?.ticketCount,0);assert.equal(b.state.npcs?.get(a.sessionId)?.ticketCount,0);
    const result=new Promise<C.TicketResult>(resolve=>a.onMessage('ticketResult',resolve));a.send('ticket',{action:'pay',tiles:[0,4,8],roundStartedAt:a.state.startedAt});assert.equal((await result).ok,false);
    a.send('finishRound');await until(()=>a.state.phase===C.RoomPhase.Finished,'finish');a.send('restartRound');await until(()=>a.state.phase===C.RoomPhase.Lobby,'reset');
    assert.ok([...a.state.npcs!.values()].every(n=>!n.ticketCount&&!n.ticketReadyAt&&!n.polybahnTicketed));
  },'zurich');
});
