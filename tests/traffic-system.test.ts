import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaneGraph, validateTrafficNetwork, sampleLane, trafficOverlap, type TrafficNetwork } from '../packages/shared/src/traffic.ts';
import { Player, Vehicle, RaceState } from '../apps/server/src/state.ts';
import { VehicleManager } from '../apps/server/src/vehicles.ts';
import { LIME_KIND, collisionImpact, applyImpulse } from '../packages/shared/src/index.ts';
import { TrafficManager } from '../apps/server/src/traffic.ts';
import { withServer, until, delay, startRound, type WireState } from './fixture.ts';

const cross: TrafficNetwork = { version: 1, laneWidth: 3.2, nodes: [
  { id: 'west', x: -70, y: 0, z: 0, spawn: true }, { id: 'east', x: 70, y: 0, z: 0, spawn: true },
  { id: 'north', x: 0, y: 0, z: -70, spawn: true }, { id: 'south', x: 0, y: 0, z: 70, spawn: true },
  { id: 'center', x: 0, y: 0, z: 0 },
], roads: ['west', 'east', 'north', 'south'].map(id => ({ id, from: id, to: 'center' })) };
const straight: TrafficNetwork = { version: 1, laneWidth: 3.2,
  nodes: [{ id: 'start', x: 100, y: 0, z: 100, spawn: true }, { id: 'end', x: 300, y: 0, z: 100, despawn: true }],
  roads: [{ id: 'road', from: 'start', to: 'end', oneWay: true, speed: 12 }] };

test('moving traffic runs over road pedestrians once while leaving sidewalks, passengers and elevated players alone', () => {
  const state=new RaceState(), manager=new TrafficManager(state,()=>0);
  manager.replace(validateTrafficNetwork(straight));manager.settings({density:1,spawnInterval:0.25,speedLimit:25});
  for(let i=0;i<120;i++)manager.tick(.05);
  const car=[...state.trafficCars.values()][0], originalX=car.x;
  const foot=new Player({x:car.x+1,y:car.y,z:car.z});
  state.players.set('foot',foot);
  state.players.set('sidewalk',new Player({x:car.x,y:car.y,z:car.z+2}));
  state.players.set('above',new Player({x:car.x,y:car.y+3,z:car.z}));
  state.vehicles.set('passenger-bus',new Vehicle({kind:1,x:car.x,y:car.y,z:car.z}));
  state.players.set('passenger',new Player({x:car.x,y:car.y,z:car.z,vehicleId:'passenger-bus'}));
  state.players.set('spectator',new Player({x:car.x,y:car.y,z:car.z}));
  const hits:unknown[][]=[];
  const hit:Parameters<TrafficManager['tick']>[2]=(...args)=>{hits.push(args);};
  manager.tick(.2,[],hit,id=>id!=='spectator');
  assert.equal(hits.length,1,'substeps and sustained contact do not spam hits');
  assert.equal(hits[0][1],'foot');assert(Number(hits[0][5])>0);assert.equal(hits[0][8],true);
  assert(car.x>originalX,'traffic continues instead of yielding to the pedestrian');
  foot.knockdownUntil=state.serverTime+2500;foot.x=car.x;
  state.serverTime+=500;manager.tick(.05,[],hit,id=>id!=='spectator');
  assert.equal(hits.length,1,'already knocked-down players are not hit again');
  foot.knockdownUntil=0;foot.invincibleUntil=state.serverTime+3000;foot.x=car.x;state.serverTime+=500;
  manager.tick(.05,[],hit,id=>id!=='spectator');
  assert.equal(hits.length,1,'standing players remain protected after getting up');
  foot.invincibleUntil=0;foot.x=car.x;state.serverTime+=500;
  manager.settings({density:1,spawnInterval:.25,speedLimit:1});
  manager.tick(.05,[],hit,id=>id!=='spectator');
  assert.equal(hits.length,1,'traffic below the impact speed threshold does not knock players down');
});

test('Colyseus traffic impacts send the victim an impulse and replicate knockdown and impact effects to both clients', {timeout:30000}, async()=>{
  await withServer(async(client,rooms)=>{
    const host=await client.create<WireState>('race',{name:'Host',devMode:true,skipIntro:true});rooms.push(host);
    const guest=await client.joinById<WireState>(host.roomId,{name:'Pedestrian'});rooms.push(guest);
    const impulses:{from:string;knockdown:boolean;durationMs:number;at:number;ix:number;iy:number;iz:number}[]=[],hostBumps:{a:string;b:string}[]=[],guestBumps:{a:string;b:string}[]=[];
    host.onMessage('trafficResult',()=>{});host.onMessage('playerCorrection',()=>{});guest.onMessage('playerCorrection',()=>{});
    guest.onMessage('impulse',hit=>impulses.push(hit));host.onMessage('bump',b=>hostBumps.push(b));guest.onMessage('bump',b=>guestBumps.push(b));
    await startRound(host,[host,guest]);
    // Move onto a clear strip of the flat fixture, away from its parked carts/bike rack.
    await delay(400);guest.send('move',[-2,0,-9,0,0,0,0,0]);
    await until(()=>Math.abs(guest.state.players.get(guest.sessionId)!.z+9)<.1,'pedestrian moved clear of parked vehicles');
    const victim=guest.state.players.get(guest.sessionId)!;
    const network:TrafficNetwork={version:1,laneWidth:3.2,nodes:[{id:'start',x:victim.x-25,y:victim.y,z:victim.z,spawn:true},{id:'end',x:victim.x+25,y:victim.y,z:victim.z,despawn:true}],roads:[{id:'runover',from:'start',to:'end',oneWay:true,speed:25}]};
    host.send('trafficEdit',{network});await until(()=>host.state.trafficNetwork!.includes('runover'),'collision test road installed');
    await delay(120);host.send('trafficEdit',{settings:{density:1,spawnInterval:.25}});
    await until(()=>impulses.some(h=>h.from.startsWith('traffic-')&&h.knockdown),'authoritative traffic impulse received',10000);
    await until(()=>host.state.players.get(guest.sessionId)!.knockdownUntil>host.state.serverTime,'knockdown replicated to observer');
    const impact=impulses.find(h=>h.from.startsWith('traffic-'))!;
    assert(impact.durationMs>=2300&&impact.durationMs<=4200,'uses the vehicle recovery timeline from main');
    assert(impact.at>0);assert(Math.hypot(impact.ix,impact.iy,impact.iz)<=25.001,'shared impact force limit');
    const replicated = host.state.players.get(guest.sessionId)!;
    assert(replicated.impactStrength!>0,'new impact animation state replicates');
    assert.equal(replicated.invincibleUntil,replicated.knockdownUntil+3000,'observer receives three seconds of recovery protection');
    await until(()=>hostBumps.some(b=>b.a.startsWith('traffic-')&&b.b===guest.sessionId)&&guestBumps.some(b=>b.a.startsWith('traffic-')&&b.b===guest.sessionId),'traffic bump replicated to both clients');
  });
});

test('traffic ejects bike, cart and both scooter riders, with the car impact direction and severity', () => {
  for(const kind of [0,2,LIME_KIND]) {
    const state=new RaceState(),vehicles=new VehicleManager(state),traffic=new TrafficManager(state,()=>0);
    traffic.replace(validateTrafficNetwork(straight));traffic.settings({density:1,spawnInterval:.25,speedLimit:25});
    for(let i=0;i<120;i++)traffic.tick(.05);
    const car=[...state.trafficCars.values()][0], previousX=car.x;
    state.serverTime=1000;
    const vehicle=new Vehicle({kind,x:car.x+1,y:0,z:car.z,driver:'rider',capacity:kind===LIME_KIND?2:1});
    state.vehicles.set('ride',vehicle);
    state.players.set('rider',new Player({x:vehicle.x,y:.8,z:vehicle.z,vehicleId:'ride',vehicleKind:kind,seat:0}));
    if(kind===LIME_KIND)state.players.set('rear',new Player({x:vehicle.x,y:.8,z:vehicle.z,vehicleId:'ride',vehicleKind:kind,seat:1}));
    const victims:string[]=[];
    const hit:Parameters<VehicleManager['tick']>[1]=(from,target,_x,_y,_z,ix,iy,iz,down,sourceKind)=>{
      assert(from.startsWith('traffic-'));assert.equal(sourceKind,3);
      const p=state.players.get(target)!;assert.equal(p.vehicleId,'');assert(ix>0&&Math.abs(iz)<.001);
      applyImpulse(p,collisionImpact(from,ix,iy,iz,'vehicle',down),state.serverTime);victims.push(target);
    };
    traffic.tick(.2,[],(from)=>vehicles.runOver('ride',state.serverTime,hit,car.speed,{from,rotY:car.rotY,kind:3}));
    assert.equal(victims.length,kind===LIME_KIND?2:1);
    assert.equal(vehicle.driver,'');assert.equal(vehicle.vx,0);assert(vehicle.fallenUntil>state.serverTime);
    for(const player of state.players.values()){assert.equal(player.vehicleKind,-1);assert.equal(player.seat,-1);assert(player.knockdownUntil>state.serverTime);}
    assert(car.x>previousX,'car keeps moving after impact');
  }
});

test('parked bicycles fall over on impact and never stop the passing traffic car', () => {
  const state=new RaceState(),vehicles=new VehicleManager(state),traffic=new TrafficManager(state,()=>0);
  traffic.replace(validateTrafficNetwork(straight));traffic.settings({density:1,spawnInterval:.25,speedLimit:25});
  for(let i=0;i<120;i++)traffic.tick(.05);
  const [id,car]=[...state.trafficCars][0], bike=new Vehicle({kind:2,x:car.x+10,y:0,z:car.z});
  state.vehicles.set('parked',bike);
  const beside=new Vehicle({kind:2,x:bike.x,y:0,z:bike.z+2});state.vehicles.set('sidewalk-bike',beside);
  let impacts=0;
  const bikeHit:Parameters<TrafficManager['tick']>[4]=(bikeId,from,pose)=>{
    assert.equal(bikeId,'parked');impacts++;
    vehicles.runOver(bikeId,state.serverTime,()=>assert.fail('parked bike has no rider to hit'),pose.speed,{from,rotY:pose.rotY,kind:3});
  };
  for(let i=0;i<160;i++){
    state.serverTime+=50;traffic.tick(.05,[],undefined,undefined,bikeHit);
    if(car.x>bike.x+7)break;
  }
  assert.equal(impacts,1);assert(bike.fallenUntil>state.serverTime);
  assert.equal(beside.fallenUntil,0);assert(state.trafficCars.has(id));assert(car.x>bike.x+7&&car.speed>3,'traffic passes the knocked-over bicycle');
});

test('new maps target 60 cars and authoritative traffic settings reject larger populations', () => {
  const state=new RaceState(),traffic=new TrafficManager(state);
  assert.equal(state.trafficDensity,60);assert(state.trafficCars.size>0&&state.trafficCars.size<=60);
  assert.throws(()=>traffic.settings({density:61,spawnInterval:2}),/0–60/);
  assert.equal(state.trafficDensity,60);
});

test('Colyseus traffic knocks parked bicycles over and continues through their position', {timeout:30000}, async()=>{
  await withServer(async(client,rooms)=>{
    const host=await client.create<WireState>('race',{name:'Host',devMode:true,skipIntro:true});rooms.push(host);
    host.onMessage('trafficResult',()=>{});host.onMessage('bump',()=>{});
    await until(()=>host.state?.hostId===host.sessionId,'parked bicycle test room ready');
    const road:TrafficNetwork={version:1,laneWidth:3.2,nodes:[{id:'start',x:-25,y:0,z:4,spawn:true},{id:'end',x:25,y:0,z:4,despawn:true}],roads:[{id:'parked-bike-impact',from:'start',to:'end',oneWay:true,speed:25}]};
    host.send('trafficEdit',{network:road});await until(()=>host.state.trafficNetwork!.includes('parked-bike-impact'),'parked bicycle road installed');
    await delay(120);host.send('trafficEdit',{settings:{density:1,spawnInterval:.25}});
    await until(()=>host.state.vehicles.get('bike-1')!.fallenUntil>host.state.serverTime,'parked bike knocked over',12000);
    await until(()=>[...host.state.trafficCars!.values()].some(car=>car.x>11&&car.speed>3),'car continues past parked bicycles');
  });
});

test('Colyseus traffic runs over a mounted cyclist and replicates the bike release and rider knockdown', {timeout:30000}, async()=>{
  await withServer(async(client,rooms)=>{
    const host=await client.create<WireState>('race',{name:'Host',devMode:true,skipIntro:true});rooms.push(host);
    const guest=await client.joinById<WireState>(host.roomId,{name:'Cyclist'});rooms.push(guest);
    const impacts:{from:string;knockdown:boolean}[]=[];
    host.onMessage('trafficResult',()=>{});host.onMessage('playerCorrection',()=>{});host.onMessage('bump',()=>{});
    guest.onMessage('playerCorrection',()=>{});guest.onMessage('vehicleResult',()=>{});guest.onMessage('bump',()=>{});guest.onMessage('impulse',h=>impacts.push(h));
    await startRound(host,[host,guest]);
    await delay(400);guest.send('move',[3,0,6,0,0,0,0,0]);
    await until(()=>Math.hypot(guest.state.players.get(guest.sessionId)!.x-3,guest.state.players.get(guest.sessionId)!.z-6)<.2,'cyclist moves beside bike');
    guest.send('vehicleEnter','bike-1');await until(()=>guest.state.players.get(guest.sessionId)!.vehicleId==='bike-1','bike mounted');
    const road:TrafficNetwork={version:1,laneWidth:3.2,nodes:[{id:'start',x:3,y:0,z:35,spawn:true},{id:'end',x:3,y:0,z:-5,despawn:true}],roads:[{id:'bike-impact',from:'start',to:'end',oneWay:true,speed:25}]};
    host.send('trafficEdit',{network:road});await until(()=>host.state.trafficNetwork!.includes('bike-impact'),'cyclist collision road installed');
    await delay(120);host.send('trafficEdit',{settings:{density:1,spawnInterval:.25}});
    await until(()=>impacts.some(h=>h.from.startsWith('traffic-')&&h.knockdown),'mounted cyclist hit by traffic',12000);
    await until(()=>host.state.players.get(guest.sessionId)!.vehicleId===''&&host.state.players.get(guest.sessionId)!.knockdownUntil>host.state.serverTime,'ejection and knockdown replicated');
    assert.equal(host.state.vehicles.get('bike-1')!.driver,'');
    assert(host.state.vehicles.get('bike-1')!.fallenUntil>host.state.serverTime);
  });
});

test('road JSON validation, right-hand lanes, one-way and continuous curved turns', () => {
  const n = validateTrafficNetwork(cross), graph = buildLaneGraph(n);
  assert.equal(graph.spawns.length, 4);
  const incoming = graph.paths.get('west:forward:0')!;
  assert.equal(incoming.points[0].z, 1.6);
  assert.equal(graph.paths.get('west:back:0')!.points[0].z, -1.6);
  assert.equal(incoming.next.length, 3);
  for (const id of incoming.next) {
    const turn = graph.paths.get(id)!, out = graph.paths.get(turn.next[0])!;
    const start = sampleLane(turn, 0), end = sampleLane(turn, turn.length);
    assert.deepEqual([start.x, start.y, start.z], [incoming.points[1].x, incoming.points[1].y, incoming.points[1].z]);
    assert.deepEqual([end.x, end.y, end.z], [out.points[0].x, out.points[0].y, out.points[0].z]);
    assert(Number.isFinite(start.rotY)); assert(turn.points.length > 2);
  }
  const multilane = structuredClone(straight); multilane.roads[0].lanes = 3;
  const lanes = buildLaneGraph(validateTrafficNetwork(multilane));
  assert.equal(lanes.paths.size, 3); assert.equal(lanes.spawns.length, 3);
  assert.deepEqual([...lanes.paths.values()].map(p => p.points[0].z), [96.8, 100, 103.2]);
  for (const bad of [{ ...cross, version: 2 }, { ...cross, nodes: [...cross.nodes, cross.nodes[0]] }, { ...cross, roads: [{ id: 'bad', from: 'missing', to: 'west' }] }, { ...straight, roads: [{ ...straight.roads[0], lanes: 8 }] }]) assert.throws(() => validateTrafficNetwork(bad));
  assert.throws(() => validateTrafficNetwork({ ...straight, nodes: [{ ...straight.nodes[0], spawn: 'yes' }, straight.nodes[1]] }));
});

test('traffic queues, reserved crossing turns and terminals stay collision-free under load', () => {
  const state = new RaceState(); let seed = 42;
  const manager = new TrafficManager(state, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; });
  manager.replace(validateTrafficNetwork(cross)); manager.settings({ density: 24, spawnInterval: 0.25 });
  const seen = new Set<string>(); let junctionMoves = 0;
  for (let step = 0; step < 2400; step++) {
    manager.tick(0.05);
    const cars = [...state.trafficCars];
    for (const [id, car] of cars) { seen.add(id); if (Math.hypot(car.x, car.z) < 8 && car.speed > 0) junctionMoves++; }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++)
      assert.equal(trafficOverlap(cars[i][1], cars[j][1], 0), false, `cars overlap at step ${step}`);
    assert(cars.length <= 24);
  }
  assert(seen.size > 30, `terminal cars must drain (${seen.size})`); assert(junctionMoves > 100);
});

test('blocked spawns, following gaps, density changes and atomic live replacement', () => {
  const state = new RaceState(), manager = new TrafficManager(state, () => 0);
  manager.replace(validateTrafficNetwork(straight)); manager.settings({ density: 5, spawnInterval: 0.25 });
  const start = sampleLane([...manager.graph.paths.values()][0], 0);
  for (let i = 0; i < 100; i++) manager.tick(0.05, [start]);
  assert.equal(state.trafficCars.size, 0);
  for (let i = 0; i < 300; i++) {
    manager.tick(0.05);
    const cars = [...state.trafficCars.values()].sort((a, b) => a.x - b.x);
    for (let j = 1; j < cars.length; j++) assert(cars[j].x - cars[j - 1].x >= 6.99);
  }
  assert(state.trafficCars.size > 1);
  manager.settings({ density: 0, spawnInterval: 1 });
  for (let i = 0; i < 1000; i++) manager.tick(0.05);
  assert.equal(state.trafficCars.size, 0);
  manager.replace(validateTrafficNetwork(cross)); assert.equal(state.trafficCars.size, 0);
  assert.equal(JSON.parse(state.trafficNetwork).nodes.length, 5);
  assert.throws(() => manager.settings({ density: 101, spawnInterval: 1 }));
});

test('Colyseus replicates authoritative traffic and restricts live edits to dev hosts', { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const host = await client.create<WireState>('race', { name: 'Host', devMode: true, skipIntro: true }); rooms.push(host);
    const guest = await client.joinById<WireState>(host.roomId, { name: 'Guest' }); rooms.push(guest);
    await until(() => host.state?.members.size === 2 && guest.state?.members.size === 2, 'both clients joined');
    assert((host.state.trafficCars?.size ?? 0) > 0, 'room opens with cars already on the map');
    const initialPositions = new Map([...host.state.trafficCars!].map(([id, car]) => [id, { x: car.x, z: car.z }]));
    await until(() => [...host.state.trafficCars!].some(([id, car]) => {
      const initial = initialPositions.get(id);
      return initial && Math.hypot(car.x - initial.x, car.z - initial.z) > 0.2;
    }), 'dev traffic moves in lobby without starting round');
    const results: { ok: boolean; message: string }[] = [];
    host.onMessage('trafficResult', r => results.push(r)); guest.onMessage('trafficResult', r => results.push(r));
    guest.send('trafficEdit', { network: straight });
    await until(() => results.length === 1, 'guest rejected'); assert.equal(results[0].ok, false);
    host.send('trafficEdit', { network: validateTrafficNetwork(straight) });
    await until(() => !!guest.state.trafficNetwork?.includes('start'), 'network replicated');
    await delay(120); host.send('trafficEdit', { settings: { density: 3, spawnInterval: 0.25, speedMultiplier: 2 } });
    await until(() => (host.state.trafficCars?.size ?? 0) > 0 && (guest.state.trafficCars?.size ?? 0) > 0, 'shared traffic spawned');
    const id = host.state.trafficCars!.keys().next().value!, first = host.state.trafficCars!.get(id)!.x;
    await until(() => (guest.state.trafficCars?.get(id)?.x ?? 0) > first + 2, 'server-driven movement visible on guest');
    await delay(120); host.send('trafficEdit', { network: { ...straight, version: 9 } });
    await until(() => results.some(r => !r.ok && r.message.includes('JSON')), 'invalid JSON rejected');
    assert.equal(JSON.parse(guest.state.trafficNetwork!).version, 1);
    await delay(120); host.send('trafficEdit', { network: { version: 1, laneWidth: 3.2, nodes: [], roads: [] } });
    await until(() => guest.state.trafficCars?.size === 0 && JSON.parse(guest.state.trafficNetwork!).roads.length === 0, 'live clear replicated');
    const {default:city}=await import('../packages/shared/src/traffic-network.json',{with:{type:'json'}});
    const cityNetwork = validateTrafficNetwork(city), cityJson = JSON.stringify(cityNetwork);
    assert(Buffer.byteLength(cityJson) > 4096, 'full network exceeds the old WebSocket payload limit');
    await delay(120);host.send('trafficEdit',{network:cityNetwork});
    await until(()=>guest.state.trafficNetwork===cityJson,'full city network fits WebSocket message limit');
    assert.equal(host.connection.isOpen,true);assert.equal(guest.connection.isOpen,true);
    assert.equal(guest.state.trafficSpeedMultiplier,2,'speed multiplier replicates to observers');
    const normal = await client.create<WireState>('race', { name: 'Normal' }); rooms.push(normal);
    await until(() => normal.state?.hostId === normal.sessionId, 'normal room host');
    assert.equal(normal.state.trafficDensity,60);assert(normal.state.trafficCars!.size<=60);
    assert((normal.state.trafficCars?.size ?? 0) > 0, 'normal map also starts populated');
    let denied = false; normal.onMessage('trafficResult', r => { denied = !r.ok; });
    normal.send('trafficEdit', { network: straight }); await until(() => denied, 'non-dev host denied');
  });
});


test('higher density increases both target population and spawn frequency', () => {
  const count = (density: number) => {
    const state = new RaceState(), manager = new TrafficManager(state, () => 0);
    // Leave enough time between entries that following clearance doesn't limit spawning.
    manager.replace(validateTrafficNetwork(straight)); manager.settings({ density, spawnInterval: 6 });
    assert.equal(state.trafficDensity, density);
    for (let i = 0; i < 200; i++) manager.tick(0.05);
    return state.trafficCars.size;
  };
  assert(count(60) > count(20));
});


test('short road chains release the previous junction before reserving the next', () => {
  const network: TrafficNetwork = { version: 1, laneWidth: 3.2,
    nodes: [0, 15, 30, 45, 80].map((x, i) => ({ id: `n${i}`, x, y: 0, z: 0, spawn: i === 0, despawn: i === 4 })),
    roads: [0, 1, 2, 3].map(i => ({ id: `r${i}`, from: `n${i}`, to: `n${i + 1}`, oneWay: true })) };
  const state = new RaceState(), manager = new TrafficManager(state, () => 0);
  manager.replace(validateTrafficNetwork(network)); manager.settings({ density: 10, spawnInterval: 0.25 });
  const seen = new Set<string>(); let completed = 0;
  for (let i = 0; i < 1800; i++) {
    manager.tick(0.05);
    for (const id of [...seen]) if (!state.trafficCars.has(id)) { completed++; seen.delete(id); }
    for (const id of state.trafficCars.keys()) seen.add(id);
  }
  assert(completed > 10, `short-road traffic must flow (${completed} completed)`);
});
test('curb offsets replicate through JSON and retain continuous turns on both sides of the street',()=>{
  const n=validateTrafficNetwork({...cross,roads:cross.roads.map(r=>({...r,laneOffset:5}))});
  assert(n.roads.every(r=>r.laneOffset===5));
  const graph=buildLaneGraph(n),incoming=graph.paths.get('west:forward:0')!;
  assert.equal(incoming.points[0].z,5);
  assert.equal(graph.paths.get('west:back:0')!.points[0].z,-5);
  for(const id of incoming.next) {
    const turn=graph.paths.get(id)!,out=graph.paths.get(turn.next[0])!;
    assert.deepEqual(turn.points[0],incoming.points.at(-1));assert.deepEqual(turn.points.at(-1),out.points[0]);
  }
  for(const laneOffset of [-1,0,100,NaN]) assert.throws(()=>validateTrafficNetwork({...cross,roads:cross.roads.map(r=>({...r,laneOffset}))}));
});
test('authored city routes have no branches, spawn at their starts, and keep the uphill tram corridor clear', async()=>{
  const {default:source}=await import('../packages/shared/src/traffic-network.json',{with:{type:'json'}});
  const n=validateTrafficNetwork(source),adj=new Map(n.nodes.map(p=>[p.id,new Set<string>()]));
  for(const r of n.roads){adj.get(r.from)!.add(r.to);adj.get(r.to)!.add(r.from);}
  assert(n.nodes.every(p=>adj.get(p.id)!.size<=2),'fixed tracks have no junctions');
  const starts=n.nodes.filter(p=>p.spawn), ends=n.nodes.filter(p=>p.despawn);
  assert.equal(starts.length,3);assert.equal(ends.length,3);
  const visited=new Set<string>();
  for(const start of starts) {
    const todo=[start.id];
    while(todo.length){const id=todo.pop()!;if(visited.has(id))continue;visited.add(id);todo.push(...adj.get(id)!);}
  }
  assert.equal(visited.size,n.nodes.length,'every track is reachable from an entrance');
  assert(n.nodes.every(p=>!(p.spawn&&p.despawn)));
  const main=n.roads.filter(r=>{const a=n.nodes.find(p=>p.id===r.from)!,b=n.nodes.find(p=>p.id===r.to)!;return a.z<20&&b.z>-130&&Math.abs(a.x-23)<2&&Math.abs(b.x-23)<2;});
  assert(main.length>=8);assert(main.every(r=>Math.abs(r.laneOffset!)>=4));
  const state=new RaceState();let seed=123;
  const manager=new TrafficManager(state,()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;});
  const seen=new Set<string>();
  for(let i=0;i<6000;i++){
    manager.tick(.05);const cars=[...state.trafficCars];
    for(const [id] of cars)seen.add(id);
    for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++)assert.equal(trafficOverlap(cars[a][1],cars[b][1],0),false);
  }
  assert(seen.size>60,'cars continue entering and leaving through the joined strokes');
  assert([...state.trafficCars.values()].filter(c=>c.speed>.1).length>=10,'normal density remains moving after five simulated minutes');
});

test('HB and Polybahn tracks keep separate uphill lanes while the southern track turns under Polybahn', async () => {
  const { default: source } = await import('../packages/shared/src/traffic-network.json', { with: { type: 'json' } });
  const network = validateTrafficNetwork(source), graph = buildLaneGraph(network);
  assert(network.roads.every(r=>r.oneWay&&r.lanes===1));
  assert([...graph.paths.values()].every(p=>p.next.length<=1),'no random turns or branching junctions');
  assert([...graph.paths.values()].filter(p=>p.turn).every(p=>!p.yield),'independent tracks need no junction reservations');
  const follow=(prefix:string)=>{
    let lane=graph.paths.get(graph.spawns.find(id=>id.startsWith(prefix+'-'))!)!;
    const route=[];
    while(lane){route.push(lane);if(!lane.next.length)break;lane=graph.paths.get(lane.next[0])!;}
    return route;
  };
  for(const prefix of ['hb','poly']) {
    const route=follow(prefix);
    const hill=route.find(p=>p.road===prefix+'-road-15200682')!;
    assert(hill);
    assert(prefix==='hb'?hill.points[0].x<19:hill.points[0].x>26,'dedicated curb lane outside tram corridor');
    assert.equal(route.at(-1)!.to,prefix+'-draw-6c69414c');
  }
  const south=follow('south');
  assert(south.some(p=>p.road==='south-road-5a47a9c1'));
  assert(south.some(p=>p.road==='south-road-f118acc5'));
  assert(!south.some(p=>p.road.endsWith('road-7837510b')||p.road.endsWith('road-15200682')),'bottom cars turn toward Polybahn instead of uphill');
  assert.equal(south.at(-1)!.to,'south-draw-9c643da7');
});

test('60-car traffic clears short junction exits and keeps both uphill lanes flowing', () => {
  for (const initialSeed of [2, 18, 123]) {
    let seed = initialSeed;
    const state = new RaceState(), manager = new TrafficManager(state, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32;
    });
    manager.settings({ density: 60, spawnInterval: 2 });
    const seen = new Set<string>();
    for (let i = 0; i < 6000; i++) {
      manager.tick(0.05);
      for (const id of state.trafficCars.keys()) seen.add(id);
      if (i % 10 === 0) {
        const cars = [...state.trafficCars.values()];
        for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++)
          assert.equal(trafficOverlap(cars[a], cars[b], 0), false);
      }
    }
    assert(seen.size > 100, `entries and exits continue at high density (seed ${initialSeed})`);
    assert([...state.trafficCars.values()].filter(car => car.speed > 0.1).length >= 10, `junction reservations do not deadlock (seed ${initialSeed})`);
  }
});
test('rush-hour multiplier doubles free-flow traffic speed without changing the population target or spawn interval',()=>{
  const run=(speedMultiplier:number)=>{
    const state=new RaceState(),manager=new TrafficManager(state,()=>0);
    manager.replace(validateTrafficNetwork(straight));manager.settings({density:20,spawnInterval:2,speedMultiplier});
    manager.tick(.2);for(let i=0;i<99;i++)manager.tick(.05);
    const first=[...state.trafficCars.values()].sort((a,b)=>b.x-a.x)[0];
    return {state,manager,first};
  };
  const normal=run(1),rush=run(2);
  assert.equal(rush.first.speed,normal.first.speed*2);
  assert.equal(rush.state.trafficDensity,normal.state.trafficDensity);
  assert.equal(rush.state.trafficSpawnInterval,normal.state.trafficSpawnInterval);
  assert(rush.first.x>normal.first.x);
  rush.manager.settings({density:20,spawnInterval:2,speedMultiplier:1});assert.equal(rush.state.trafficSpeedMultiplier,1);
  for(const speedMultiplier of [0,4,NaN])assert.throws(()=>rush.manager.settings({density:20,spawnInterval:2,speedMultiplier}));
});

test('one live road speed limit updates all lanes without resetting cars or their progress', () => {
  const state = new RaceState(), manager = new TrafficManager(state, () => 0);
  const network = structuredClone(straight);
  network.nodes.push({ id: 'far-end', x: 500, y: 0, z: 100, despawn: true });
  network.nodes[1].despawn = false;
  network.roads.push({ id: 'second-road', from: 'end', to: 'far-end', oneWay: true, speed: 3 });
  manager.replace(validateTrafficNetwork(network));
  manager.settings({ density: 1, spawnInterval: 0.25 });
  for (let i = 0; i < 200; i++) manager.tick(0.05);
  const id = [...state.trafficCars.keys()][0], car = state.trafficCars.get(id)!;
  const x = car.x;
  manager.settings({ density: 1, spawnInterval: 0.25, speedLimit: 6 });
  assert.equal(state.trafficCars.get(id), car);
  assert.equal(car.x, x);
  assert(JSON.parse(state.trafficNetwork).roads.every((road: { speed: number }) => road.speed === 6));
  assert([...manager.graph.paths.values()].filter(path => !path.turn).every(path => path.speed === 6));
  for (let i = 0; i < 20; i++) manager.tick(0.05);
  assert.equal(car.speed, 6); assert(car.x > x);
  const before = state.trafficNetwork;
  for (const speedLimit of [0, 26, NaN]) assert.throws(() => manager.settings({ density: 1, spawnInterval: 0.25, speedLimit }));
  assert.equal(state.trafficNetwork, before);
});

test('short drawn segments and free sharp turns retain road speed', () => {
  const network: TrafficNetwork = { version: 1, laneWidth: 3.2,
    nodes: Array.from({ length: 41 }, (_, i) => ({ id: `n${i}`, x: 100 + i * 25, y: 0, z: 100, spawn: i === 0, despawn: i === 40 })),
    roads: Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, from: `n${i}`, to: `n${i + 1}`, oneWay: true, speed: 20 })) };
  const graph = buildLaneGraph(validateTrafficNetwork(network));
  assert([...graph.paths.values()].filter(path => path.turn).every(path => path.speed === 20));
  assert([...graph.paths.values()].filter(path => path.turn).every(path => !path.yield));
  const state = new RaceState(), manager = new TrafficManager(state, () => 0);
  manager.replace(validateTrafficNetwork(network)); manager.settings({ density: 1, spawnInterval: 0.25 });
  for (let i = 0; i < 400; i++) manager.tick(0.05);
  const car = [...state.trafficCars.values()][0];
  assert.equal(car.speed, 20); assert(car.x > 300, 'cars make progress at speed across many short segments');
  const junction = buildLaneGraph(validateTrafficNetwork({ ...cross, roads: cross.roads.map(road => ({ ...road, speed: 20 })) }));
  const incoming = junction.paths.get('west:forward:0')!;
  for (const id of incoming.next) {
    const connector = junction.paths.get(id)!;
    assert.equal(connector.speed, 20);
    assert.equal(connector.yield, true, 'crossing traffic still reserves the junction even when going straight');
  }
});

test('a car retries a clear valid turn instead of waiting indefinitely for its blocked choice', () => {
  const network = structuredClone(cross);
  for (const node of network.nodes) { node.spawn = node.id === 'west'; node.despawn = !['west', 'center'].includes(node.id); }
  for (const road of network.roads) road.speed = 20;
  const state = new RaceState(), manager = new TrafficManager(state, () => 0);
  manager.replace(validateTrafficNetwork(network)); manager.settings({ density: 1, spawnInterval: 0.25 });
  const incoming = manager.graph.paths.get('west:forward:0')!;
  const chosen = manager.graph.paths.get(incoming.next[0])!;
  const blocked = sampleLane(manager.graph.paths.get(chosen.next[0])!, 3);
  let first = '', rerouted = false, obstructionEnabled = false;
  for (let i = 0; i < 600; i++) {
    manager.tick(0.05, obstructionEnabled ? [blocked] : []);
    if (!first && state.trafficCars.size) first = [...state.trafficCars.keys()][0];
    const car = state.trafficCars.get(first);
    if (car && car.x > -14) obstructionEnabled = true;
    if (car && Math.abs(car.z) > 15) rerouted = true;
    for (const car of state.trafficCars.values()) assert.equal(trafficOverlap(car, blocked, 0), false);
  }
  assert(rerouted, 'waiting car must choose another open road');
  assert(!state.trafficCars.has(first), 'the rerouted car reaches a boundary and leaves');
});

test('an unobstructed 90-degree corner is driven at full road speed', () => {
  const network: TrafficNetwork = { version: 1, laneWidth: 3.2,
    nodes: [{ id: 'start', x: 100, y: 0, z: 100, spawn: true }, { id: 'corner', x: 300, y: 0, z: 100 }, { id: 'end', x: 300, y: 0, z: 300, despawn: true }],
    roads: [{ id: 'in', from: 'start', to: 'corner', oneWay: true, speed: 20 }, { id: 'out', from: 'corner', to: 'end', oneWay: true, speed: 20 }] };
  const state = new RaceState(), manager = new TrafficManager(state, () => 0);
  manager.replace(validateTrafficNetwork(network)); manager.settings({ density: 1, spawnInterval: 0.25 });
  let cornerSamples = 0;
  for (let i = 0; i < 500; i++) {
    manager.tick(0.05);
    for (const car of state.trafficCars.values()) if (car.x > 295.4 && car.z > 100 && car.z < 104.6) {
      cornerSamples++; assert.equal(car.speed, 20);
    }
  }
  assert(cornerSamples > 0, 'car traverses the corner curve');
});
