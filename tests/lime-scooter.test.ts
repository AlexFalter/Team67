import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Client} from 'colyseus';
import * as C from '../packages/shared/src/index.ts';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {VehicleManager} from '../apps/server/src/vehicles.ts';
import {Vehicles} from '../apps/client/src/multiplayer/vehicles.ts';

test('normal client interaction boards the free rear position, hides full scooters, and keeps single-seat vehicles exclusive',()=>{
 const state=new RaceState(),manager=new VehicleManager(state),sent:unknown[][]=[];
 const a={sessionId:'a',send:()=>{}} as unknown as Client,b={sessionId:'b',send:()=>{}} as unknown as Client;
 state.players.set('a',new Player());state.players.set('b',new Player());
 manager.add('lime-1',C.createVehicle(C.LIME_KIND));
 const lime=state.vehicles.get('lime-1')!,body=C.createBody();
 const client=Object.assign(Object.create(Vehicles.prototype),{
  items:new Map([['lime-1',{latest:lime,rendered:lime}]]),
  net:{now:()=>1000,room:{state,send:(...args:unknown[])=>sent.push(args)}},
 }) as Vehicles;
 manager.enter(a,'lime-1',1000);
 assert.equal(client.nearestId(body),'lime-1','an occupied front position must not prevent rear boarding');
 client.interact(body);assert.deepEqual(sent.pop(),['vehicleEnter','lime-1']);
 manager.enter(b,'lime-1',1000);assert.equal(client.nearestId(body),'','a full scooter is unavailable');
 manager.exit(b);assert.equal(client.nearestId(body),'lime-1','rear exit makes the scooter available again');
 lime.kind=2;assert.equal(client.nearestId(body),'','an occupied bicycle stays exclusive');
 lime.kind=C.LIME_KIND;lime.fallenUntil=2000;assert.equal(client.nearestId(body),'','recovery still blocks boarding');
});

test('Lime holds two riders, only the front steers, and the last exit needs a parking photo',()=>{
 const state=new RaceState(),manager=new VehicleManager(state),messages:C.VehicleResult[]=[];
 const clients=['a','b','c'].map(sessionId=>({sessionId,send:(_type:string,data:C.VehicleResult)=>messages.push(data)}) as unknown as Client);
 const [a,b,c]=clients;for(const client of clients)state.players.set(client.sessionId,new Player());
 manager.add('lime-1',C.createVehicle(C.LIME_KIND));
 const v=state.vehicles.get('lime-1')!,p=state.players.get('a')!,rear=state.players.get('b')!;
 assert.equal(v.capacity,2);manager.enter(a,'lime-1',1000);manager.enter(b,'lime-1',1000);manager.enter(c,'lime-1',1000);
 assert.equal(v.driver,'a');assert.equal(messages.at(-1)?.ok,false);assert.equal(p.y,C.LIME_DECK_HEIGHT);assert.equal(rear.seat,1);assert.equal(rear.z,-.65);
 manager.move(b,['lime-1',1,0,0,12,0],1100);assert.equal(v.x,0);
 manager.move(a,['lime-1',1,0,Math.PI/2,12,0],1100);manager.tick(1100,()=>{});assert.equal(v.x,1);assert.equal(p.x,1);assert.equal(rear.x,.35);assert.ok(Math.abs(rear.z)<.0001);
 manager.syncDriver('a');assert.equal(v.y,0,'deck offset must not sink the scooter');
 manager.exit(a);assert.equal(p.vehicleId,'');assert.equal(v.driver,'b');assert.equal(rear.seat,0);assert.equal(manager.photoRequired('a'),undefined);
 manager.exit(b);assert.equal(v.driver,'');assert.equal(manager.photoRequired('b'),'lime-1');
 manager.enter(b,'cart-1',1200);assert.match(messages.at(-1)!.message,/parking photo/);
 manager.enter(a,'lime-1',1200);assert.match(messages.at(-1)!.message,/parking photo/);
 assert.equal(manager.finishParkingPhoto('a','lime-1'),false);assert.equal(manager.finishParkingPhoto('b','lime-wrong'),false);
 assert.equal(manager.finishParkingPhoto('b','lime-1'),true);assert.equal(manager.photoRequired('b'),undefined);
 Object.assign(p,{x:v.x,y:v.y,z:v.z});manager.enter(a,'lime-1',1300);assert.equal(v.driver,'a');manager.exit(a);manager.disconnect('a');assert.equal(manager.photoRequired('a'),undefined);
});
test('a rear passenger can leave without stopping the driver or starting a parking photo',()=>{
 const state=new RaceState(),manager=new VehicleManager(state);
 const a={sessionId:'a',send:()=>{}} as unknown as Client,b={sessionId:'b',send:()=>{}} as unknown as Client;
 state.players.set('a',new Player());state.players.set('b',new Player());manager.add('lime-1',C.createVehicle(C.LIME_KIND));manager.enter(a,'lime-1',1000);manager.enter(b,'lime-1',1000);
 const v=state.vehicles.get('lime-1')!;v.vz=10;manager.exit(b);assert.equal(v.driver,'a');assert.equal(v.vz,10);assert.equal(manager.photoRequired('b'),undefined);
 const rear=C.createBody();Object.assign(rear,{vehicleId:'lime-1',vehicleKind:C.LIME_KIND,seat:1,x:4,y:C.LIME_DECK_HEIGHT,z:3});C.stepPlayer(rear,{...C.IDLE_INPUT,z:1},.1);assert.equal(rear.x,4);assert.equal(rear.z,3,'rear passenger cannot drive locally');
});
test('Lime uses terrain collision and accelerates to a higher speed with Shift',()=>{
 const clearWorld={...C.flatWorld,name:'zurich' as const,height:()=>0,blocked:()=>false,bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000}};
 const ride=(sprint:boolean)=>{const v=C.createVehicle(C.LIME_KIND);for(let i=0;i<180;i++)C.stepCart(v,{...C.IDLE_INPUT,x:0,z:1,sprint},1/60,clearWorld);return v;};
 assert.ok(Math.abs(ride(false).vz-C.LIME_SPEED)<.1);assert.ok(Math.abs(ride(true).vz-C.LIME_BOOST_SPEED)<.1);
 const v=C.createVehicle(C.LIME_KIND,0,C.flatWorld.bounds.maxZ-1);for(let i=0;i<60;i++)C.stepCart(v,{...C.IDLE_INPUT,z:1},1/60);assert.ok(v.z<=C.flatWorld.bounds.maxZ-C.vehicleRadius(v));
 const state=new RaceState();new VehicleManager(state,C.zurichWorld);
 const scooters=[...state.vehicles.values()].filter(v=>v.kind===C.LIME_KIND);
 assert.equal(scooters.length,2,'only the two configured Lime scooters spawn');
 assert.deepEqual(scooters.map(v=>[v.x,v.y,v.z]),[[-58.78,9.34,57.53],[-21.84,8.32,124.78]]);
});

test('Lime boost lasts seven seconds at twenty percent less speed, never recharges, even on foot or after remounting',()=>{
 const world={...C.flatWorld,name:'zurich' as const,height:()=>0,blocked:()=>false,bounds:{minX:-10000,maxX:10000,minZ:-10000,maxZ:10000}};
 const p=C.createBody();Object.assign(p,{vehicleId:'lime',vehicleKind:C.LIME_KIND,seat:0,y:C.LIME_DECK_HEIGHT});
 const boost={...C.IDLE_INPUT,z:1,sprint:true};
 for(let i=0;i<69;i++)C.stepPlayer(p,boost,.1,world);
 assert.equal(p.limeBoostMs,100);assert.ok(Math.abs(p.vz-C.LIME_BOOST_SPEED)<.01);assert.equal(C.LIME_BOOST_SPEED,18*.8);assert.equal(C.LIME_BOOST_DURATION_MS,7000);
 C.stepPlayer(p,boost,.1,world);assert.equal(p.limeBoostMs,0);
 for(let i=0;i<20;i++)C.stepPlayer(p,boost,.1,world);
 assert.equal(p.limeBoostMs,0);assert.ok(Math.abs(p.vz-C.LIME_SPEED)<.01,'empty boost returns to cruising');
 for(let i=0;i<20;i++)C.stepPlayer(p,{...boost,sprint:false},.1,world);
 assert.equal(p.limeBoostMs,0);assert.equal(p.limeBoostExhausted,true);
 p.vehicleId='';for(let i=0;i<20;i++)C.stepPlayer(p,C.IDLE_INPUT,.1,world);
 assert.equal(p.limeBoostMs,0,'walking cannot recharge');
 Object.assign(p,{vehicleId:'lime',vehicleKind:C.LIME_KIND,seat:0});C.stepPlayer(p,boost,.1,world);
 assert.equal(p.limeBoostMs,0,'remounting cannot recharge');
 const fresh=C.createBody();Object.assign(fresh,{vehicleId:'lime',vehicleKind:C.LIME_KIND,seat:0});
 C.stepPlayer(fresh,{...C.IDLE_INPUT,sprint:true},.1,world);assert.equal(fresh.limeBoostMs,C.LIME_BOOST_DURATION_MS,'stationary does not spend boost');
 C.stepPlayer(fresh,boost,.1,world);assert.equal(fresh.limeBoostMs,6900);
 C.stepPlayer(fresh,{...boost,sprint:false},.1,world);assert.equal(fresh.limeBoostMs,6900,'releasing preserves unused boost');
 fresh.seat=1;C.stepPlayer(fresh,boost,.1,world);assert.equal(fresh.limeBoostMs,6900,'rear passenger cannot spend boost');
});


test('nearby Lime interaction allows a second rider and hides a full scooter',()=>{
 const lime=C.createVehicle(C.LIME_KIND);lime.driver='a';
 const players=new Map([['a',{vehicleId:'lime'}]]),sent:unknown[]=[];
 const vehicles=Object.create(Vehicles.prototype) as Vehicles;
 Object.assign(vehicles,{items:new Map([['lime',{latest:lime,rendered:lime}]]),net:{now:()=>1000,room:{state:{players,publiBikes:new Map()},send:(...args:unknown[])=>sent.push(args)}}});
 const p=C.createBody();
 assert.equal(vehicles.interactionKind(p),'scooter');vehicles.interact(p);assert.deepEqual(sent,[['vehicleEnter','lime']]);
 players.set('b',{vehicleId:'lime'});assert.equal(vehicles.interactionKind(p),undefined);vehicles.interact(p);assert.equal(sent.length,1);
 players.delete('a');lime.driver='b';assert.equal(vehicles.interactionKind(p),'scooter','remaining rear rider leaves one seat available');
 lime.fallenUntil=2000;assert.equal(vehicles.interactionKind(p),undefined,'fallen scooter cannot be boarded');
});
