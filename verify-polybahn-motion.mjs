import * as THREE from 'three';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPolybahnPath} from './polybahn-motion.js';
const {points}=JSON.parse(await readFile('public/gameplay/polybahn-route.json','utf8'));
const nodes=points.map((p,i)=>new THREE.Vector3(p[0],i*5,p[1])),path=createPolybahnPath(nodes);
assert(path.sample(0).distanceTo(nodes[0])<1e-8);assert(path.sample(path.length).distanceTo(nodes.at(-1))<1e-8);
let previous=path.frame(0,1.25),maxTurn=0;
for(let d=.1;d<path.length;d+=.1){const frame=path.frame(d,1.25);assert(frame.position.toArray().every(Number.isFinite));const turn=frame.quaternion.angleTo(previous.quaternion);maxTurn=Math.max(maxTurn,turn);assert(turn<.07,'continuous heading and grade');const forward=new THREE.Vector3(0,0,-1).applyQuaternion(frame.quaternion);assert(forward.distanceTo(frame.forward)<1e-7);previous=frame;}
assert(path.sample(path.length*.5,1.25).distanceTo(path.sample(path.length*.5,-1.25))>2.4,'passing loop separates cars');assert(path.sample(0,1.25).distanceTo(path.sample(0,-1.25))<1e-8);
assert(Math.abs(new THREE.Euler().setFromQuaternion(path.frame(path.length*.5).quaternion,'YXZ').x)>.05,'carriage follows an incline');
console.log(`PASS: smooth continuous path, carriage orientation/grade, station endpoints and separated passing loop (max turn ${maxTurn.toFixed(4)} rad per 10cm).`);
