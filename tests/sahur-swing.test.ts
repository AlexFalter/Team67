import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {avatar,pose,disposeAvatar} from '../apps/client/src/multiplayer/avatar.ts';
import {createBody,ATTACK_COOLDOWN_MS} from '../packages/shared/src/index.ts';

test('Sahur lifts the club, strikes forward and down, and smoothly returns to idle',()=>{
 for(const firstPerson of [false,true]){
  const mesh=avatar('#fff',4,firstPerson),p=createBody();const stick=mesh.getObjectByName('sahur-stick')!;
  for(let i=0;i<60;i++)pose(mesh,p);
  mesh.updateMatrixWorld(true);const idle=stick.localToWorld(new Vector3(0,.97,0));
  p.attackReadyAt=1000+ATTACK_COOLDOWN_MS;
  const points:Vector3[]=[];
  for(let i=0;i<90;i++){p.simTime=1000+i*1000/60;pose(mesh,p);mesh.updateMatrixWorld(true);points.push(stick.localToWorld(new Vector3(0,.97,0)));}
  const lift=points[9],strike=points[18];
  assert(lift.y>idle.y+(firstPerson?.2:.6),'club rises for the wind-up');
  assert(strike.y<lift.y-.4,'club swings down');
  assert(strike.z>lift.z+.5,'strike travels toward the target');
  assert(points.at(-1)!.distanceTo(idle)<.02,'returns to its resting grip');
  for(let i=1;i<points.length;i++)assert(points[i].distanceTo(points[i-1])<.5,'no frame jumps');
  assert.equal(mesh.getObjectByName('head')!.visible,!firstPerson);
  pose(mesh,p,1/60,0,undefined,true);assert.equal(stick.visible,false,'put stick away while using the knife');
  disposeAvatar(mesh);
 }
});
