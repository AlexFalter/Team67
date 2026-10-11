import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {UavAircraft} from '../apps/client/src/multiplayer/streaks/uavAircraft.ts';

test('UAV flies overhead on the replicated clock and departs before expiry',()=>{
 const scene=new THREE.Scene(),uav=new UavAircraft(scene);
 const player={x:20,y:8,z:30,droneCallUntil:3400,droneScanUntil:33400};
 uav.update([['remote',player]],3400,1,true);assert.equal(scene.children.length,1);
 const aircraft=scene.children[0],first=aircraft.position.clone();assert.equal(first.y,63);
 uav.update([['remote',player]],4400,1,true);assert(aircraft.position.distanceTo(first)>1);
 const forward=new THREE.Vector3(0,0,-1).applyQuaternion(aircraft.quaternion);assert(forward.dot(aircraft.position.clone().sub(first).normalize())>.9,'nose follows travel direction');
 player.x=200;uav.update([['remote',player]],10400,1,true);assert(aircraft.position.x<60,'orbit remains anchored after caller moves');
 uav.update([['remote',player]],32400,1,true);assert(aircraft.position.y>63,'departing aircraft climbs');
 uav.update([['remote',player]],33400,1,true);assert.equal(scene.children.length,0);uav.dispose();
});
test('UAV resources are disposed on disconnect, round changes and leaving play',()=>{
 const scene=new THREE.Scene(),uav=new UavAircraft(scene),player={x:0,y:0,z:0,droneCallUntil:3400,droneScanUntil:33400};
 uav.update([['a',player],['b',player]],4400,1,true);assert.equal(scene.children.length,2);
 let disposed=0;scene.children[0].traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.addEventListener('dispose',()=>disposed++);});
 uav.update([['b',player]],5000,1,true);assert.equal(scene.children.length,1);assert(disposed>0);
 uav.update([],5000,2,true);assert.equal(scene.children.length,0);
 uav.update([['a',player]],5000,2,true);uav.update([['a',player]],5000,2,false);assert.equal(scene.children.length,0);
 uav.update([['a',player]],5000,2,true);uav.dispose();assert.equal(scene.children.length,0);
});
