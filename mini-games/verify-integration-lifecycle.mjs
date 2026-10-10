import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.goto('http://127.0.0.1:5173/?debug=1');await page.waitForFunction(()=>window.__test,{timeout:60000});
 await page.evaluate(()=>window.requestAnimationFrame=()=>0);await page.waitForTimeout(100);
 const result=await page.evaluate(async()=>{
  const [{createWorldAdapter},{createPubliBikeStation},{createBikeFleetState},{loadPubliBike},{createMateMachine},{createMateMachineState},{createItemInventory},{createPhone},{createBikeUnlock}]=await Promise.all([
   import('/src/world/core/world-adapter.js'),import('/src/vehicles/publibike/publibike-station.js'),import('/src/vehicles/publibike/bike-fleet-state.js'),import('/src/vehicles/publibike/publibike-model.js'),import('/src/interactions/mate/mate-machine.js'),import('/src/interactions/mate/mate-machine-state.js'),import('/src/interactions/inventory/item-inventory.js'),import('/src/ui/phone/phone.js'),import('/src/games/bike-scan/bike-unlock.js')]);
  const root=document.createElement('div');document.body.append(root);
  const scene=new __test.scene.constructor(),camera=new __test.camera.constructor(60,1,.1,1000);
  const {world,solver}=createWorldAdapter({height:()=>0,blocked:()=>false,bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},penetration:()=>0,solve:()=>__test.position.clone().set(0,0,0)});
  const make=await loadPubliBike(),fleet=createBikeFleetState({failurePercent:0}),before=fleet.snapshot(),commands=[];
  const station=createPubliBikeStation(scene,world,make,solver,{placement:{anchor:[0,0],next:[10,0]},stateModel:fleet,playerId:'alice',uiRoot:root,replicated:true,onCommand:command=>commands.push(command)});
  const mounted=fleet.snapshot();const position=station.bikes[0].model.position.clone();station.take(position,1);station.updateRide(20);station.reset();const noClientMutation=JSON.stringify(fleet.snapshot())===JSON.stringify(before);
  fleet.claim(1,'alice');station.restore(fleet.snapshot());const restored=station.state().activeBike;
  const inventoryA=createItemInventory({uiRoot:root,id:'inventory-a'}),inventoryB=createItemInventory({uiRoot:root,id:'inventory-b'});inventoryA.setItem('ticket',true);inventoryA.setItem('mate',true);inventoryB.setItem('mate',true);inventoryB.setItem('ticket',true);
  const orderA=[...inventoryA.slot('mate').parentElement.children].map(e=>e.dataset.slot),orderB=[...inventoryB.slot('mate').parentElement.children].map(e=>e.dataset.slot);
  const rules=createMateMachineState({workingFlavor:3}),mate=createMateMachine(scene,world,solver,{placement:{searchAnchors:[[30,30]]},camera,canvas:__test.renderer.domElement,onClose:()=>{},onWin:()=>{},stateModel:rules,uiRoot:root});
  const mateWinner=mate.state().workingFlavors;
  mate.dispose();
  const hostRules=createMateMachineState({workingFlavor:1}),clientRules=createMateMachineState({snapshot:hostRules.snapshot()}),mateCommands=[];let rewards=0;
  const remoteMate=createMateMachine(scene,world,solver,{placement:{position:[30,30]},camera,canvas:__test.renderer.domElement,onClose:()=>{},onWin:()=>rewards++,stateModel:clientRules,uiRoot:root,replicated:true,onCommand:command=>mateCommands.push(command)});
  remoteMate.interact(__test.position.clone().set(30,0,28.5));root.querySelector('[data-flavor="1"]').click();root.querySelector('[data-flavor="1"]').click();
  const noSelectMutation=clientRules.snapshot().phase==='idle';hostRules.select(1);remoteMate.restore(hostRules.snapshot());
  const card=root.querySelector('#mate-card');card.value='100';card.onchange();card.onchange();const noPaymentMutation=clientRules.snapshot().phase==='payment';
  hostRules.pay();remoteMate.restore(hostRules.snapshot());remoteMate.update(100);const noClockMutation=clientRules.snapshot().phase==='loading';
  hostRules.tick(3);remoteMate.restore(hostRules.snapshot());remoteMate.keydown({code:'Enter',preventDefault(){}});const noRewardBeforeApproval=rewards===0&&clientRules.snapshot().won===false;
  hostRules.collect();remoteMate.restore(hostRules.snapshot());remoteMate.restore(hostRules.snapshot());const approvedRewards=rewards;
  remoteMate.dispose();

  const phone=createPhone({uiRoot:root,canOpen:()=>true,onOpen:()=>{},onSound:()=>{}}),scanner=createBikeUnlock({uiRoot:root,camera,attempt:()=>({ok:true}),onUnlocked:()=>{},onClose:()=>{}});
  scanner.dispose();scanner.dispose();phone.dispose();mate.dispose();mate.dispose();station.dispose();station.dispose();inventoryA.dispose();inventoryB.dispose();
  const remaining=root.childElementCount,sceneObjects=scene.children.length;root.remove();
  return {mountedUnchanged:JSON.stringify(mounted)===JSON.stringify(before),noClientMutation,commands,restored,orderA,orderB,mateWinner,remaining,sceneObjects,mateCommands,noSelectMutation,noPaymentMutation,noClockMutation,noRewardBeforeApproval,approvedRewards};
 });
 assert(result.mountedUnchanged);assert(result.noClientMutation);assert.deepEqual(result.commands,[{type:'bike.claim',bikeId:1}]);assert.equal(result.restored,1);assert.deepEqual(result.orderA,['ticket','mate','spare']);assert.deepEqual(result.orderB,['mate','ticket','spare']);assert.deepEqual(result.mateWinner,['Ginger']);assert.equal(result.remaining,0);assert.equal(result.sceneObjects,0);assert(result.noSelectMutation);assert(result.noPaymentMutation);assert(result.noClockMutation);assert(result.noRewardBeforeApproval);assert.equal(result.approvedRewards,1);assert.deepEqual(result.mateCommands.map(c=>c.type),['mate.select','mate.pay','mate.collect']);
 await page.waitForTimeout(1000);assert.deepEqual(errors,[]);
 console.log('PASS: exported features mount on a flat alternative map, preserve host state, request bike claims without client mutation, restore ownership, isolate inventories, and remove UI/scene objects/listeners safely during pending asset loads.');
}finally{await browser.close();}
