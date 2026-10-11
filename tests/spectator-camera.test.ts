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
 Object.assign(exam,{portal:{root:{visible:true},update(){}},stage:'exam',round:123,enteredRound:123,remaining:90,score:5,lastPublish:0,publish:(value:ExamSession)=>{session=value;}});
 exam.spectate();assert.equal(exam.spectating,true);
 exam.update(createBody(),true,false,123,70,1000);
 exam.returnToExam();assert.equal(exam.screenVisible,true);assert.equal(session!.stage,'exam');assert.equal(session!.remainingSeconds,70);assert.equal(session!.score,5);
 exam.spectate();assert.equal(exam.spectating,true);assert.equal(session!.remainingSeconds,70);
});
