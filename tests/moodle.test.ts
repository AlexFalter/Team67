import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {MoodleEvents} from '../apps/server/src/moodle.ts';
import {RaceState,Player,RoomMember} from '../apps/server/src/state.ts';
// @ts-expect-error Prototype phone feature is JavaScript.
import {createPhoneQuizzes} from '../apps/client/src/npcPrototype/src/games/quizzes/phone-quizzes.js';
function fixture(){const state=new RaceState();state.startedAt=123;state.endsAt=100000;for(const id of ['a','b']){state.players.set(id,new Player());state.members.set(id,new RoomMember());}const results:{id:string;passed:boolean}[]=[];const events=new MoodleEvents(state,(id,r)=>results.push({id,passed:r.passed}),()=>0);events.tick(1000);events.tick(26000);return {state,results,events};}
test('correct answers reserve an eight-second boost that starts once the phone closes',()=>{
 const {state,events,results}=fixture();assert.equal(state.moodleDeadline,56000);const data={id:1,answer:1,roundStartedAt:123};
 assert.equal(events.answer('a',data,27000),true);assert.equal(state.players.get('a')!.moodleBoostUntil,0);assert.equal(state.players.get('b')!.moodleBoostUntil,0);
 assert.equal(events.answer('a',data,28000),false);
 assert.equal(events.answer('b',data,29000),true);events.tick(40000);
 assert.equal(state.players.get('a')!.moodleBoostUntil,0);assert.equal(state.players.get('b')!.moodleBoostUntil,0);
 assert.equal(events.claim('a',data,40000),true);assert.equal(state.players.get('a')!.moodleBoostUntil,48000);
 assert.equal(events.claim('a',data,41000),false);assert.equal(state.players.get('a')!.moodleBoostUntil,48000);
 assert.equal(events.claim('b',data,41000),true);assert.equal(state.players.get('b')!.moodleBoostUntil,49000);
 assert.equal(state.endsAt,100000);assert.deepEqual(results,[{id:'a',passed:true},{id:'b',passed:true}]);
});
test('wrong and unanswered quizzes never stop players or penalize them after leaving a vehicle',()=>{
 const {state,events,results}=fixture(),a=state.players.get('a')!,b=state.players.get('b')!;a.vehicleId='tram';b.vx=5;b.vz=2;b.mateBoostMs=3000;
 assert.equal(events.answer('b',{id:1,answer:0,roundStartedAt:123},27000),true);events.tick(56000);a.vehicleId='';events.tick(57000);
 for(const p of [a,b]){assert.equal(p.moodleSitUntil,0);assert.equal(p.moodleBoostUntil,0);}
 assert.equal(b.vx,5);assert.equal(b.vz,2);assert.equal(b.mateBoostMs,3000);assert.equal(state.endsAt,100000);assert.deepEqual(results,[{id:'b',passed:false},{id:'a',passed:false}]);
});
test('server distinguishes submitted wrong answers from missed deadlines, including late submissions',()=>{
 const state=new RaceState();state.startedAt=123;
 for(const id of ['wrong','missed','late'])state.players.set(id,new Player());
 const results:{id:string;passed:boolean;submitted:boolean}[]=[];
 const events=new MoodleEvents(state,(id,r)=>results.push({id,passed:r.passed,submitted:r.submitted}),()=>0);
 events.tick(1000);events.tick(26000);
 assert.equal(events.answer('wrong',{id:1,answer:0,roundStartedAt:123},27000),true);
 assert.equal(events.answer('late',{id:1,answer:1,roundStartedAt:123},56000),false);
 events.tick(56000);
 assert.deepEqual(results,[{id:'wrong',passed:false,submitted:true},{id:'missed',passed:false,submitted:false},{id:'late',passed:false,submitted:false}]);
});
test('phone uses Unsubmitted for expired quizzes and Incorrect for accepted wrong answers',()=>{
 for(const [passed,submitted,status] of [[false,false,'unsubmitted'],[false,true,'failed'],[true,true,'passed']] as const){
  const rewards:boolean[]=[];
  const quizzes=createPhoneQuizzes({notify:()=>{},changed:()=>{},onSubmit:()=>{},onResult:(reward:boolean)=>rewards.push(reward)});
  quizzes.sync({enabled:true,id:1,deadline:30000,now:0,question:0});
  quizzes.resolve({id:1,passed,submitted});
  assert.equal(quizzes.state()[0].status,status);assert.deepEqual(rewards,[passed]);
 }
});
test('offline phone also marks unanswered quizzes as Unsubmitted',()=>{
 const quizzes=createPhoneQuizzes({notify:()=>{},changed:()=>{}});
 quizzes.update(1000,{enabled:true,playing:true});
 assert.equal(quizzes.state()[0].status,'active');
 quizzes.update(31,{enabled:true,playing:true});
 assert.equal(quizzes.state()[0].status,'unsubmitted');
});
test('Moodle grants fifty percent extra speed, expires on time and never multiplies the Mate boost',()=>{
 const run=(moodleUntil:number,mateMs=0,now=27000,sprint=false)=>{const p=C.createBody();p.moodleBoostUntil=moodleUntil;p.mateBoostMs=mateMs;
  for(let i=0;i<60;i++)C.stepMovement(p,{x:1,z:0,sprint,jump:false},1/60,now+i*1000/60,C.flatWorld);return p.vx;};
 const normal=run(0),moodle=run(35000),mate=run(0,C.MATE_BOOST_MS);
 assert(Math.abs(moodle/normal-1.5)<.01);assert(Math.abs(mate/normal-2)<.01);
 assert.equal(run(35000,C.MATE_BOOST_MS),mate);assert.equal(run(35000,0,35000),normal);
 assert(Math.abs(run(35000,0,27000,true)/run(0,0,27000,true)-1.5)<.01);
});
test('reward claims reject forged, stale, wrong-player and reset requests',()=>{
 const {state,events}=fixture(),data={id:1,answer:1,roundStartedAt:123};
 assert.equal(events.claim('a',data,27000),false);events.answer('a',data,27000);
 assert.equal(events.claim('b',data,27000),false);assert.equal(events.claim('a',{...data,id:2},27000),false);
 assert.equal(events.claim('a',{...data,roundStartedAt:0},27000),false);
 state.members.get('a')!.spectator=true;assert.equal(events.claim('a',data,27000),false);state.members.get('a')!.spectator=false;
 events.reset();assert.equal(events.claim('a',data,30000),false);assert.equal(state.players.get('a')!.moodleBoostUntil,0);
 events.tick(31000);events.tick(56000);events.answer('a',data,57000);events.claim('a',data,58000);
 assert.equal(state.players.get('a')!.moodleBoostUntil,66000);events.reset();assert.equal(state.players.get('a')!.moodleBoostUntil,0);
});
test('rejects stale, late, invalid and unknown-player answers; disabling cancels pending quizzes',()=>{const {state,events,results}=fixture();for(const data of [{id:1,answer:1,roundStartedAt:0},{id:0,answer:1,roundStartedAt:123},{id:1,answer:9,roundStartedAt:123}])assert.equal(events.answer('a',data,27000),false);assert.equal(events.answer('stranger',{id:1,answer:1,roundStartedAt:123},27000),false);assert.equal(events.answer('a',{id:1,answer:1,roundStartedAt:123},56000),false);events.enabled(false);events.tick(100000);assert.equal(state.moodleDeadline,0);assert.equal(results.length,0);});
