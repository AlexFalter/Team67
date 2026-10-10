import assert from 'node:assert/strict';
import {physicsHarness} from './physics-harness.mjs';
const {world,polybahn}=await physicsHarness();
assert(polybahn.cutTriangles>0,'native station walls opened');
for(const path of polybahn.accessPaths){for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1);let last;for(let j=0;j<=steps;j++){const h=world.height(a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps);if(last!==undefined)assert(Math.abs(h-last)<.55,'station floor stays walkable');last=h;}}}
assert.deepEqual(world.root.position.toArray(),[0,0,0]);
assert.deepEqual(world.data.origin,[2683475,1248000,400]);
assert.equal(world.physics.step,2);
for(const p of world.data.route){assert(Number.isFinite(world.ground(...p)));assert(Number.isFinite(world.rawGround(...p)));}
for(const mesh of [...world.buildings,world.groundMesh])assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
console.log('PASS: native coordinates, original terrain, source collision grid, finite ground across the complete route; walkable blended station passage floors.');
