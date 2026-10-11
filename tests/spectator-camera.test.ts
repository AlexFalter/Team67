import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {flySpectator} from '../apps/client/src/multiplayer/spectator.ts';
import {ExamSequence,type ExamSession} from '../apps/client/src/exam/ExamSequence.ts';
import {createBody} from '../packages/shared/src/index.ts';

test('spectator flies in view direction, rises and descends through geometry without diagonal speed boosts',()=>{
 const position=new Vector3(0,0,0);
 flySpectator(position,new Set(['KeyW']),Math.PI/2,0,.1);
 assert(Math.abs(position.x+1.2)<1e-9);assert(Math.abs(position.z)<1e-9);
 flySpectator(position,new Set(['ShiftLeft']),0,0,.1);
 assert(Math.abs(position.y+1.2)<1e-9,'noclip permits descending below terrain');
 const diagonal=new Vector3();flySpectator(diagonal,new Set(['KeyW','KeyD','Space']),0,0,.1);
 assert(Math.abs(diagonal.length()-1.2)<1e-9);
 const fast=new Vector3();flySpectator(fast,new Set(['Space','ControlLeft']),0,0,.1);assert.equal(fast.y,3);
 flySpectator(fast,new Set(),0,0,.1);assert.equal(fast.y,3,'releasing input stops flight');
});

test('spectating and returning to the exam keep the same round deadline and allow spectating again',()=>{
 let session:ExamSession|undefined;
 const exam=Object.create(ExamSequence.prototype) as ExamSequence;
 Object.assign(exam,{portal:{root:{visible:true},update(){}},abort:new AbortController(),stage:'exam',round:123,enteredRound:123,remaining:90,score:5,lastPublish:0,publish:(value:ExamSession)=>{session=value;}});
 exam.spectate();assert.equal(exam.spectating,true);
 exam.update(createBody(),true,false,123,70,1000);
 exam.returnToExam();assert.equal(exam.screenVisible,true);assert.equal(session!.stage,'exam');assert.equal(session!.remainingSeconds,70);assert.equal(session!.score,5);
 exam.spectate();assert.equal(exam.spectating,true);assert.equal(session!.remainingSeconds,70);
});

test('a completed exam can only spectate until the next round resets it',()=>{
 const exam=Object.create(ExamSequence.prototype) as ExamSequence;
 Object.assign(exam,{portal:{root:{visible:true},update(){}},abort:new AbortController(),stage:'exam',round:123,enteredRound:123,remaining:90,score:5,lastPublish:0,publish:()=>{}});
 exam.complete(800);assert.equal(exam.completed,true);
 exam.spectate();exam.returnToExam();assert.equal(exam.spectating,true,'completed quiz cannot be reopened');
 exam.update(createBody(),false,false,123,0,1000);assert.equal(exam.spectating,true);
 exam.update(createBody(),true,false,124,180,2000);assert.equal(exam.completed,false);assert.equal(exam.active,false);
});

test('late spectators cannot open a quiz they never entered',()=>{
 const exam=Object.create(ExamSequence.prototype) as ExamSequence;
 Object.assign(exam,{abort:new AbortController(),stage:'world',round:123,enteredRound:-1,publish:()=>{}});
 exam.spectate();assert.equal(exam.entered,false);exam.returnToExam();assert.equal(exam.spectating,true);
});

test('round ending expires an active quiz, preserves its results, and lobby reset clears either screen',()=>{
 for(const stage of ['exam','complete']){
  let session:ExamSession|undefined;
  const exam=Object.create(ExamSequence.prototype) as ExamSequence;
  Object.assign(exam,{portal:{root:{visible:true},update(){}},abort:new AbortController(),stage,round:123,enteredRound:123,remaining:90,score:800,finished:stage==='complete',lastPublish:0,publish:(value:ExamSession)=>{session=value;}});
  exam.update(createBody(),false,false,123,0,1000);
  assert.equal(session!.remainingSeconds,0);
  assert.equal(session!.stage,stage,'results stay visible; active quiz receives the expired clock');
  assert.equal(session!.score,800);
  exam.update(createBody(),false,false,0,0,2000);
  assert.equal(session!.stage,'world','host reset must reveal the lobby');
  assert.equal(exam.completed,false);assert.equal(exam.entered,false);
  assert.equal(session!.score,0);
 }
});
