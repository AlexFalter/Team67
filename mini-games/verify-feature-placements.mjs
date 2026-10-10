import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {featurePlacement,placementPoint,placementRoute,navigatePlacement,placementRoads} from './src/world/placements/feature-placement.js';
const profile=JSON.parse(await readFile('public/gameplay/feature-placements.json','utf8'));
const locations=JSON.parse(await readFile('public/gameplay/locations.json','utf8'));
assert.deepEqual(profile.features.publiBike.anchor,locations.layoutRoute[6]);assert.deepEqual(profile.features.lime.position,locations.layoutRoute[12]);
for(const id of ['tram','polybahn']){const original=JSON.parse(await readFile(`public/gameplay/${id}-route.json`,'utf8'));assert.deepEqual(profile.features[id].route,original);}
assert.deepEqual(featurePlacement({placements:profile},'mate'),profile.features.mate);
const other={position:[900,-400]};assert.equal(featurePlacement({},'lime',other),other);assert.throws(()=>featurePlacement({},'lime'),/Missing placement/);
const point=[10,20],copy=placementPoint(point);copy[0]=99;assert.equal(point[0],10);assert.throws(()=>placementPoint([NaN,2]));
const route={points:[[1,2],[4,5]]},cloned=placementRoute(route);cloned.points[0][0]=999;assert.equal(route.points[0][0],1);assert.throws(()=>placementRoute({points:[[1,2]]}));
for(const file of ['src/vehicles/rail/transport.js','src/vehicles/rail/polybahn.js','src/vehicles/publibike/publibike-station.js','src/npcs/einstein/einstein-teleporter.js','src/npcs/finance/finance-guy.js','src/npcs/interview/interview-limo.js','src/npcs/scooter/bridge-scooter.js','src/interactions/mate/mate-machine.js']){
 const source=await readFile(file,'utf8');assert(!source.includes("fetch('/gameplay/"),file+' must not load map routes');assert(!source.includes('layoutRoute[6]')&&!source.includes('anchorIndices=[38'),file+' must not choose map indices');assert(!source.includes('feature-placements.json'),file+' must not import a specific map profile');
}
const THREE=await import('three');
const noop=()=>{};
const element=()=>({style:{},classList:{toggle:noop},setAttribute:noop,querySelector:element,getContext:()=>new Proxy({},{get:()=>noop})});
globalThis.document={createElement:element,body:{append:noop}};
const {createPubliBikeStation}=await import('./src/vehicles/publibike/publibike-station.js');
const terrain={height:()=>0,blocked:()=>false,isWater:()=>false,bridgeAt:()=>false};
const makeBike=()=>{const model=new THREE.Group();model.userData.wheels=[];return model;};
const station=createPubliBikeStation(new THREE.Scene(),terrain,makeBike,{penetration:()=>0},{placement:{anchor:[900,-400],next:[905,-400]}});
assert.equal(station.state().x,900);assert.equal(station.state().z,-395);assert.equal(station.state().capacity,8);
station.reset();assert.equal(station.state().bikes.length,8);
const legs=[];const routed=navigatePlacement({path:(a,b)=>{legs.push([a,b]);return [a,b];}},[0,0],[[10,0],[10,10]],[20,10]);
assert.deepEqual(routed,[[0,0],[10,0],[10,10],[20,10]]);assert.equal(legs.length,3);
assert.throws(()=>navigatePlacement({path:()=>[]},[0,0],[[NaN,0]],[1,1]),/waypoint/);
const existing=[{name:'existing'}];assert.equal(placementRoads(profile.roads,existing),existing);
const roads=[{id:'campus-road',name:'Campus road',width:6,points:[[0,0],[20,0]]}];const copied=placementRoads({streets:roads},existing);copied[0].points[0][0]=80;assert.equal(roads[0].points[0][0],0);
assert.throws(()=>placementRoads({streets:[{width:0,points:[[0,0],[1,1]]}]},existing),/width/);
console.log('PASS: current placements/routes preserved, arbitrary-map overrides, clear missing configuration, immutable route copies and feature/map separation.');
