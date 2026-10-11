import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Client} from 'colyseus';
import * as C from '../packages/shared/src/index.ts';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {VehicleManager} from '../apps/server/src/vehicles.ts';

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
 const state=new RaceState(),manager=new VehicleManager(state,C.zurichWorld);const lime=state.vehicles.get('lime-1');assert.ok(lime,'configured Lime must spawn on the current map');assert.equal(lime.kind,C.LIME_KIND);assert.ok(Math.hypot(lime.x-C.NPC_LAYOUT.lime.position[0],lime.z-C.NPC_LAYOUT.lime.position[1])<5);void manager;
});
