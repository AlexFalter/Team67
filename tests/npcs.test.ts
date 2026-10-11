import test from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import * as C from "../packages/shared/src/index.ts";
import { RaceState, Player, RoomMember } from "../apps/server/src/state.ts";
import { NpcEncounters } from "../apps/server/src/npcs.ts";
import { VehicleManager } from '../apps/server/src/vehicles.ts';
import { withServer, startRound, type WireState, until } from "./fixture.ts";

function fixture() {
  const now = 10000, state = new RaceState({ phase: C.RoomPhase.Running, introComplete: true, startedAt: 9000, endsAt: 200000 });
  const corrected: Array<{ id: string; point: C.GroundPoint }> = [], replies: C.NpcResult[] = [];
  const encounters = new NpcEncounters(state,C.zurichWorld,(id,point)=>{corrected.push({id,point:{...point}});Object.assign(state.players.get(id)!,point);});
  const client = (id: string) => ({sessionId:id,send:(_type:string,result:C.NpcResult)=>replies.push(result)}) as unknown as Client;
  const site=C.NPC_LAYOUT.einstein.site;
  for(const id of ["alice","bob"]){state.players.set(id,new Player({x:site[0]-2.2,y:site[1],z:site[2]}));state.members.set(id,new RoomMember({introSeat:0}));encounters.join(id);}
  const command=(id:string,action:C.NpcCommand["action"],kind:C.NpcTravelKind="einstein",extra:Partial<C.NpcCommand>={},at=now)=>encounters.command(client(id),{action,kind,roundStartedAt:state.startedAt,...extra},at);
  return {now,state,encounters,corrected,replies,client,command};
}

test("Einstein grants independent charges and always lands in front of the cat",()=>{
  const f=fixture();f.command("alice","begin");assert.equal(f.replies.at(-1)!.ok,true);assert.equal(f.encounters.busy("alice"),true);
  assert.equal(f.state.npcs.get("bob")!.teleportUsed,false);assert.equal(f.corrected.length,0);
  const target=f.replies.at(-1)!.target!;assert.deepEqual(target,C.einsteinDestination(C.zurichWorld));
  assert.equal(target.x,C.NPC_LAYOUT.cat.position[0]);
  assert.equal(target.z,C.NPC_LAYOUT.cat.position[2]-1.5);
  assert.equal(f.replies.at(-1)!.facing,C.NPC_LAYOUT.cat.heading);
  assert.ok(Math.hypot(target.x-C.NPC_LAYOUT.goal[0],target.z-C.NPC_LAYOUT.goal[1])>=180);
  f.command("bob","begin");assert.equal(f.replies.at(-1)!.ok,true);assert.deepEqual(f.replies.at(-1)!.target,target);
  f.command("alice","finish", "einstein",{},f.now+4400);assert.equal(f.replies.at(-1)!.ok,false);
  f.command("alice","finish", "einstein",{},f.now+4500);assert.equal(f.replies.at(-1)!.ok,true);assert.equal(f.encounters.busy("alice"),false);assert.equal(f.corrected.length,1);
  assert.deepEqual(f.corrected[0].point,target);assert.equal(f.state.players.get("alice")!.rotY,C.NPC_LAYOUT.cat.heading);
  f.command("alice","begin");assert.equal(f.replies.at(-1)!.ok,false);
});

test('Einstein refuses a blocked cat landing without spending the charge',()=>{
 const f=fixture();
 const encounters=new NpcEncounters(f.state,{...C.zurichWorld,blocked:()=>true},()=>assert.fail('unsafe teleport'));
 encounters.command(f.client('alice'),{action:'begin',kind:'einstein',roundStartedAt:f.state.startedAt},f.now);
 assert.equal(f.replies.at(-1)!.ok,false);assert.equal(f.state.npcs.get('alice')!.teleportUsed,false);
 assert.equal(C.einsteinDestination({...C.zurichWorld,height:()=>undefined}),undefined);
});

test("NPC travel rejects stale rounds, spectators, vehicles, distance, and forged finishes",()=>{
  const f=fixture();f.command("alice","begin","einstein",{roundStartedAt:1});assert.equal(f.replies.at(-1)!.ok,false);
  const p=f.state.players.get("alice")!,m=f.state.members.get("alice")!;
  m.spectator=true;f.command("alice","begin");assert.equal(f.replies.at(-1)!.ok,false);m.spectator=false;
  p.vehicleId="polybahn-1";f.command("alice","begin");assert.equal(f.replies.at(-1)!.ok,false);p.vehicleId="";
  p.x=300;f.command("alice","begin");assert.equal(f.replies.at(-1)!.ok,false);
  f.command("alice","finish");assert.equal(f.replies.at(-1)!.ok,false);assert.equal(f.corrected.length,0);
});

test("Jane Street validates the puzzle before granting a personal ride",()=>{
  const f=fixture(),p=f.state.players.get("alice")!;
  const [x,y,z]=C.NPC_LAYOUT.interview.laptop;Object.assign(p,{x,y,z});
  f.command("alice","solve","limousine",{answer:"alert(1)"});assert.equal(f.replies.at(-1)!.ok,false);
  f.command("alice","solve","limousine",{answer:"3"});assert.equal(f.replies.at(-1)!.ok,true);
  const pickup=C.NPC_LAYOUT.interview.pickup;Object.assign(p,{x:pickup[0],y:pickup[1],z:pickup[2]});
  f.command("alice","begin","limousine");assert.equal(f.replies.at(-1)!.ok,true);assert.equal(f.state.npcs.get("bob")!.limoUsed,false);
  const before={x:p.x,y:p.y,z:p.z};f.encounters.pose(f.client("alice"),{roundStartedAt:f.state.startedAt,car:[10000,0,10000,0,0],player:[10000,0,10000,0]},f.now+100);
  assert.deepEqual({x:p.x,y:p.y,z:p.z},before);assert.equal(f.state.npcs.get("alice")!.limoVisible,false);
  f.command("alice","finish","limousine",{},f.now+9000);assert.equal(f.replies.at(-1)!.ok,true);assert.equal(f.encounters.busy("alice"),false);
});

test("Private property keeps the encounter and turns players inward without moving them",()=>{
  const f=fixture();f.command("alice","begin","property");assert.equal(f.replies.at(-1)!.ok,false);
  const p=f.state.players.get("alice")!,b=C.npcBounds(C.zurichWorld);Object.assign(p,{x:b.minX+10,z:b.minZ+20,y:C.zurichWorld.height(b.minX+10,b.minZ+20)});
  const before={x:p.x,y:p.y,z:p.z};
  f.command("alice","begin","property");assert.equal(f.replies.at(-1)!.ok,true);
  f.command("alice","finish","property",{},f.now+8400);assert.equal(f.replies.at(-1)!.ok,true);
  assert.deepEqual(f.replies.at(-1)!.target,before);
  assert.deepEqual({x:p.x,y:p.y,z:p.z},before);
  assert.equal(p.rotY,Math.PI/2);assert.equal(f.replies.at(-1)!.facing,p.rotY);
  assert.equal(f.state.npcs.get('bob')!.kind,'');
  f.command('bob','begin','property');assert.equal(f.replies.at(-1)!.ok,false);
});

test("Travel cancels and disconnects release the player without replenishing charges",()=>{
  const f=fixture();f.command("alice","begin");f.command("alice","cancel");assert.equal(f.encounters.busy("alice"),false);assert.equal(f.state.npcs.get("alice")!.teleportUsed,true);
  f.command("bob","begin");f.state.phase=C.RoomPhase.Finished;f.encounters.tick(f.now+100);assert.equal(f.encounters.busy("bob"),false);
  f.encounters.leave("alice");assert.equal(f.state.npcs.has("alice"),false);
});

test('boundary encounter works repeatedly on every edge, stops and turns without teleporting, and preserves other players',()=>{
  const f=fixture(),p=f.state.players.get('alice')!,bounds=C.npcBounds(C.zurichWorld);
  for(const [i,point] of [{x:bounds.minX+10,z:bounds.minZ+20},{x:bounds.maxX-10,z:bounds.minZ+20},{x:bounds.minX+20,z:bounds.minZ+10},{x:bounds.minX+20,z:bounds.maxZ-10}].entries()){
    Object.assign(p,point);const now=f.now+i*10000;
    f.command('alice','begin','property',{},now);assert.equal(f.replies.at(-1)!.ok,true);
    f.command('alice','finish','property',{},now+8400);const target=f.replies.at(-1)!.target!;
    assert.ok(target);assert.notDeepEqual(target,C.zurichWorld.spawn);
    assert.equal(target.x,point.x);assert.equal(target.z,point.z);
    const facing=C.propertyReturnFacing(C.zurichWorld,target);assert.equal(f.replies.at(-1)!.facing,facing);assert.equal(p.rotY,facing);
    assert.equal(p.vx,0);assert.equal(p.vy,0);assert.equal(p.vz,0);
    assert(!C.approachingPropertyBoundary(C.zurichWorld,p),'standing still cannot immediately repeat the encounter');
    assert(!C.approachingPropertyBoundary(C.zurichWorld,{...target,vx:Math.sin(facing)*5,vz:Math.cos(facing)*5}),'walking inward is allowed');
    assert(C.approachingPropertyBoundary(C.zurichWorld,{...target,vx:-Math.sin(facing)*5,vz:-Math.cos(facing)*5}),'walking outward triggers the encounter again');
    assert.equal(f.encounters.busy('bob'),false);
  }
});

test('boundary NPC dismounts drivers before returning them, while rail passengers remain aboard',()=>{
  const f=fixture(),manager=new VehicleManager(f.state,C.zurichWorld),p=f.state.players.get('alice')!,bounds=C.npcBounds(C.zurichWorld);
  const encounters=new NpcEncounters(f.state,C.zurichWorld,(_id,point)=>Object.assign(p,point),client=>manager.exit(client));
  const cart=f.state.vehicles.get('cart-1')!;Object.assign(cart,{x:bounds.minX+10,z:bounds.minZ+20,y:C.zurichWorld.height(bounds.minX+10,bounds.minZ+20)!});Object.assign(p,{x:cart.x,y:cart.y,z:cart.z});
  manager.enter(f.client('alice'),'cart-1',f.now);assert.equal(p.vehicleId,'cart-1');
  encounters.command(f.client('alice'),{action:'begin',kind:'property',roundStartedAt:f.state.startedAt},f.now);
  assert.equal(p.vehicleId,'');assert.equal(cart.driver,'');assert.equal(f.state.npcs.get('alice')!.kind,'property');
  const stopped={x:p.x,y:p.y,z:p.z};
  encounters.command(f.client('alice'),{action:'finish',kind:'property',roundStartedAt:f.state.startedAt},f.now+8400);assert.deepEqual({x:p.x,y:p.y,z:p.z},stopped);assert.equal(p.rotY,Math.PI/2);
  Object.assign(p,{vehicleId:'polybahn-1',x:bounds.minX+10,z:0});
  encounters.command(f.client('alice'),{action:'begin',kind:'property',roundStartedAt:f.state.startedAt},f.now+10000);assert.equal(p.vehicleId,'polybahn-1');assert.equal(f.state.npcs.get('alice')!.kind,'');
});

test("Live rooms synchronize NPC state, reject spectator travel, and reset per-round progress",async()=>{
  await withServer(async(client,rooms)=>{
    const a=await client.create<WireState>("race",{name:"Alice"});rooms.push(a);a.onMessage("playerCorrection",()=>{});
    const b=await client.joinById<WireState>(a.roomId,{name:"Bob"});rooms.push(b);b.onMessage("playerCorrection",()=>{});
    await startRound(a,[a,b]);assert.equal(a.state.npcs?.size,2);assert.equal(b.state.npcs?.get(a.sessionId)?.teleportUsed,false);
    const waiting=await client.joinById<WireState>(a.roomId,{name:"Waiting"});rooms.push(waiting);
    const reply=new Promise<C.NpcResult>(resolve=>waiting.onMessage("npcResult",resolve));
    waiting.send("npc",{action:"begin",kind:"einstein",roundStartedAt:a.state.startedAt});assert.equal((await reply).ok,false);
    assert.equal(a.state.npcs?.has(waiting.sessionId),false);
    a.send("finishRound");await until(()=>a.state.phase===C.RoomPhase.Finished,"round finished");
    a.send("restartRound");await until(()=>a.state.phase===C.RoomPhase.Lobby&&a.state.npcs?.size===3,"new lobby NPC state");
    assert.ok([...a.state.npcs!.values()].every(npc=>!npc.teleportUsed&&!npc.limoUsed&&!npc.kind));
  });
});


test("limousine arrival poses synchronize on the separate road before boarding",()=>{
 const f=fixture(),p=f.state.players.get("alice")!,npc=f.state.npcs.get("alice")!;
 const [x,y,z]=C.NPC_LAYOUT.interview.laptop;Object.assign(p,{x,y,z});
 f.command("alice","solve","limousine",{answer:"3"});assert.equal(f.replies.at(-1)!.ok,true);
 const initial={x:p.x,y:p.y,z:p.z};
 for(const [i,point] of C.NPC_LAYOUT.interview.approachSamples.entries()){
  f.encounters.pose(f.client("alice"),{roundStartedAt:f.state.startedAt,car:[...point,0,0]},f.now+i*100);
  assert.equal(npc.limoVisible,true);assert.equal(npc.limoX,point[0]);assert.equal(npc.limoZ,point[2]);
 }
 assert.deepEqual({x:p.x,y:p.y,z:p.z},initial,'arrival does not move the passenger');
 f.encounters.pose(f.client("alice"),{roundStartedAt:f.state.startedAt,car:[500,10,500,0,0]},f.now+10000);
 assert.ok(Math.abs(npc.limoX-C.NPC_LAYOUT.interview.pickup[0])<.001,'reject poses off both routes');
});

test("scooter arrival starts once near an active player and shares the server clock",()=>{
 const f=fixture(),p=f.state.players.get('alice')!,[x,z]=C.NPC_LAYOUT.scooter.ridePoints.at(-1)!;
 f.encounters.tick(f.now);assert.equal(f.state.scooterArrivalAt,0);
 Object.assign(p,{x,y:C.zurichWorld.height(x,z),z});f.state.members.get('alice')!.spectator=true;
 f.encounters.tick(f.now);assert.equal(f.state.scooterArrivalAt,0);
 f.state.members.get('alice')!.spectator=false;f.encounters.tick(f.now);assert.equal(f.state.scooterArrivalAt,f.now);
 f.encounters.tick(f.now+1000);assert.equal(f.state.scooterArrivalAt,f.now,'nearby players do not restart the animation');
});


test("scooter riders arrive in the open plaza after the bridge over clear terrain", () => {
 const points=C.NPC_LAYOUT.scooter.ridePoints,[x,z]=points.at(-1)!;
 assert.ok(x>-50&&x<-35&&z>70&&z<85);
 for(let t=0;t<=1;t+=.01){
  const x=points[0][0]+(points[1][0]-points[0][0])*t,z=points[0][1]+(points[1][1]-points[0][1])*t;
  const y=C.zurichWorld.height(x,z)!;
  assert.ok(y>8.8&&y<9.2);assert.equal(C.zurichWorld.blocked(x,y+.15,z,.65,3),false);
 }
});

test('Einstein uses the requested location and has a reachable adjacent teleporter',()=>{
 assert.deepEqual(C.NPC_LAYOUT.einstein.position,[44.32,11.77,140.83]);
 for(const [x,y,z] of [C.NPC_LAYOUT.einstein.position,C.NPC_LAYOUT.einstein.site,C.NPC_LAYOUT.einstein.approach]){
  assert(Math.abs(C.zurichWorld.height(x,z)!-y)<.03);
  assert.equal(C.zurichWorld.blocked(x,y,z,C.CAPSULE_RADIUS,C.CAPSULE_HEIGHT),false);
 }
});
