import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Sprite,SpriteMaterial,Texture} from 'three';
import * as C from '../packages/shared/src/index.ts';
import {Vehicles} from '../apps/client/src/multiplayer/vehicles.ts';
import {transitStatus} from '../apps/client/src/multiplayer/transitStatus.ts';

test('tram and Polybahn countdown signs and seated prompts tick without network patches',()=>{
 for(const kind of [C.TRAM_KIND,C.POLYBAHN_KIND]){
  const v=C.createVehicle(kind);v.railDistance=kind===C.TRAM_KIND?14:0;Object.assign(v,C.railFrame(v));v.departureAt=105000;
  const label=new Sprite(new SpriteMaterial({map:new Texture()}));
  const context={clearRect(){},beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){},measureText(){return {width:100};}};
  const visual={latest:v,rendered:v,label,mesh:new Group(),canvas:{width:1024,height:160,getContext:()=>context},labelText:''};
  const p=C.createBody(),point=C.railBoardingPoint(v);Object.assign(p,point);p.x+=10;
  let now=100000;const controls={textContent:''};
  const vehicles=Object.create(Vehicles.prototype) as Vehicles;
  Object.assign(vehicles,{net:{now:()=>now,canPlay:true,room:{state:{phase:'Running',players:new Map(),publiBikes:new Map()}}},items:new Map([['rail',visual]]),controls,lastLabels:0});
  vehicles.updateLabels(p,now);assert(label.visible,'sign is visible before entering the boarding circle');assert.match(visual.labelText,/Departs in 5s/);
  now+=2000;vehicles.updateLabels(p,now);assert.match(visual.labelText,/Departs in 3s/);
  p.vehicleId='rail';vehicles.updateLabels(p,now+300);assert.match(controls.textContent,/Departs in 3s/);
  now+=1000;vehicles.updateLabels(p,now);assert.match(controls.textContent,/Departs in 2s/);
  v.traveling=true;v.tripStartedAt=105900;v.arrivalAt=125900;now=105100;vehicles.updateLabels(p,now);assert.match(controls.textContent,/Doors closing/);
  now=106900;vehicles.updateLabels(p,now);assert.match(controls.textContent,/Arriving in 19s/);
  assert.doesNotMatch(controls.textContent,/E [—·]|WASD/, 'ride status does not repeat the toolbar interaction');
  assert.doesNotMatch(visual.labelText,/E (?:to|—)/, 'floating signs contain status only');
  label.material.map?.dispose();label.material.dispose();
 }
});
test('unscheduled vehicles clearly wait instead of showing a false zero countdown',()=>{
 assert.equal(transitStatus(C.createVehicle(C.TRAM_KIND),100000),'Waiting for passengers');
});
