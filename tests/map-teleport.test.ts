import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Room} from 'colyseus';
import {registerMapTeleport} from '../apps/server/src/mapTeleport.ts';
import {RaceState,Player} from '../apps/server/src/state.ts';
import {type MovementWorld} from '@race/shared';
test('admin map teleport validates authority, round and terrain then corrects the player',()=>{
 const state=new RaceState({devMode:true,mapTeleport:true,hostId:'host',startedAt:123});const p=new Player();state.players.set('host',p);state.players.set('guest',new Player());
 let handler:(client:any,data:unknown)=>void=()=>{};const sent:unknown[]=[];let busy=false,blocked=false;
 const room={state,onMessage(_name:string,fn:typeof handler){handler=fn;}};
 const world={bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},height:()=>7,blocked:()=>blocked} as unknown as MovementWorld;
 const moves=new Map<string,number>();registerMapTeleport(room as unknown as Room<{state:RaceState}>,world,moves,()=>true,()=>busy);
 const client={sessionId:'host',send(_name:string,data:unknown){sent.push(data);}},data={x:12,z:34,roundStartedAt:123};
 for(const invalid of [null,{...data,x:NaN},{...data,z:1000},{...data,roundStartedAt:0}])handler(client,invalid);
 state.mapTeleport=false;handler(client,data);state.mapTeleport=true;handler({...client,sessionId:'guest'},data);state.devMode=false;handler(client,data);state.devMode=true;
 p.vehicleId='tram';handler(client,data);p.vehicleId='';busy=true;handler(client,data);busy=false;blocked=true;handler(client,data);blocked=false;
 assert.equal(sent.length,0);handler(client,data);assert.equal(sent.length,2);assert.equal(p.x,12);assert.equal(p.y,7);assert.equal(p.z,34);assert.equal(p.vx,0);assert.ok(moves.has('host'));
});
