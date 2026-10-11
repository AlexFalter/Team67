import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EmoteChallenge} from '../apps/server/src/emotes.ts';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {RoomPhase,EMOTE_IDS,NPC_LAYOUT} from '@race/shared';
import {avatar,pose,dancePose,disposeAvatar} from '../apps/client/src/multiplayer/avatar.ts';
import type {MovementWorld} from '@race/shared';
import {createBody} from '@race/shared';
function harness(){const state=new RaceState({phase:RoomPhase.Running,introComplete:true,startedAt:123});const p=new Player({x:NPC_LAYOUT.michaelJackson.anchor[0],y:NPC_LAYOUT.michaelJackson.height,z:NPC_LAYOUT.michaelJackson.anchor[1],grounded:true});state.players.set('a',p);state.players.set('b',new Player({...p}));return {state,p,game:new EmoteChallenge(state)};}
test('Michael requires both lines, isolates players, accepts punctuation, and grants only once completed',()=>{
 const {state,p,game}=harness(),answer=(s:string)=>game.answer('a',{answer:s,roundStartedAt:123},1000);
 assert.equal(answer('wrong').ok,false);assert.equal(p.emotesUnlocked,false);
 assert.deepEqual(answer('Hee-hee!'),{ok:true,step:1,unlocked:false});assert.equal(answer('hee hee').ok,false);
 assert.deepEqual(answer('I wanna dance.'),{ok:true,step:2,unlocked:true});assert.equal(state.players.get('b')!.emotesUnlocked,false);
});
test('challenge rejects remote, vehicle, downed, malformed and stale answers; round change resets progress',()=>{
 const {state,p,game}=harness(),data={answer:'hee hee',roundStartedAt:123};
 p.x+=30;assert.equal(game.answer('a',data,1000).ok,false);p.x-=30;
 p.vehicleId='tram';assert.equal(game.answer('a',data,1000).ok,false);p.vehicleId='';
 p.knockdownUntil=2000;assert.equal(game.answer('a',data,1000).ok,false);p.knockdownUntil=0;
 assert.equal(game.answer('a',null,1000).ok,false);assert.equal(game.answer('a',{...data,roundStartedAt:1},1000).ok,false);
 game.answer('a',data,1000);state.startedAt=124;
 assert.equal(game.answer('a',{answer:'i wanna dance',roundStartedAt:124},1000).ok,false);
});
test('emotes are server gated, validate IDs and stop on movement, boarding or falling',()=>{
 const {p,game}=harness(),dance=(id:unknown)=>game.dance('a',{id,roundStartedAt:123},1000);
 assert.equal(dance('floss'),false);
 assert.equal(dance('dance-moves'),true);assert.equal(dance('orange-justice'),true);
 for(const id of ['floss','take-the-l','dab','robot'])assert.equal(dance(id),false);
 game.answer('a',{answer:'hee hee',roundStartedAt:123},1000);game.answer('a',{answer:'i wanna dance',roundStartedAt:123},1000);
 assert.equal(dance('invalid'),false);assert.equal(dance(null),false);
 for(const id of EMOTE_IDS){assert.equal(dance(id),true);assert.equal(p.emoteId,id);assert.equal(p.emoteStartedAt,1000);}
 p.vx=1;game.tick(1001);assert.equal(p.emoteId,'');assert.equal(dance('floss'),false);p.vx=0;dance('floss');p.vehicleId='tram';game.tick(1002);assert.equal(p.emoteId,'');p.vehicleId='';p.grounded=false;assert.equal(dance('robot'),false);
});
test('all six dances produce finite articulated poses on the current avatar without moving its world root',()=>{
 const mesh=avatar('#fff'),body=createBody();body.grounded=true;body.x=7;body.z=11;
 for(const id of EMOTE_IDS)for(let t=.1;t<8;t+=.1){pose(mesh,body);dancePose(mesh,id,t);mesh.updateMatrixWorld(true);mesh.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite),`${id} ${t} ${o.name}`));assert.equal(mesh.position.x,7);assert.equal(mesh.position.z,11);}
 disposeAvatar(mesh);
});

test('dialogue uses current terrain height and retains the conversation until the player leaves',()=>{
 const {state,p}=harness();p.y=25;
 const game=new EmoteChallenge(state,{height:()=>25} as unknown as MovementWorld);
 const send=(data:object,now=1000)=>game.answer('a',{roundStartedAt:123,...data},now);
 assert.equal(send({begin:true}).ok,true);
 assert.equal(send({answer:'wrong'}).reason,'Say the line shown above.');
 assert.equal(send({answer:'hee hee'},5000).step,1);
 assert.equal(send({answer:'i wanna dance'},15000).unlocked,true);
 const second=harness();const session=second.game;
 session.answer('a',{begin:true,roundStartedAt:123},1000);second.p.x+=3;
 assert.equal(session.answer('a',{answer:'hee hee',roundStartedAt:123},2000).ok,false);
});

test('starter dances remain available to other players and reset with each round',()=>{
 const {state,p,game}=harness();
 game.answer('a',{answer:'hee hee',roundStartedAt:123},1000);game.answer('a',{answer:'i wanna dance',roundStartedAt:123},1000);
 assert.equal(game.dance('b',{id:'orange-justice',roundStartedAt:123},1000),true);
 assert.equal(game.dance('b',{id:'floss',roundStartedAt:123},1000),false);
 p.emotesUnlocked=false;state.startedAt=124;game.reset();
 assert.equal(game.dance('a',{id:'dance-moves',roundStartedAt:123},2000),false);
 assert.equal(game.dance('a',{id:'dance-moves',roundStartedAt:124},2000),true);
 assert.equal(game.dance('a',{id:'floss',roundStartedAt:124},2000),false);
});
