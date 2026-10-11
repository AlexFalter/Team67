import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {featurePlacement} from '../../world/placements/feature-placement.js';
import {gameConfig} from '../../config/game-config.js';
import {createNPCConversationCamera} from '../shared/conversation-camera.js';
import {createRPGDialogue} from '../shared/rpg-dialogue.js';
import * as THREE from 'three';
import {loadNpcGltf} from '../../shared/runtime/load-npc-gltf.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createWorldAccess} from '../../world/core/world-access.js';

export async function createEinsteinTeleporter(scene,world,solver,{camera,onTravel,onOpen,placement,uiRoot=document.body,assetUrl=path=>path,signal}){
 placement=featurePlacement(world,'einstein',placement);
 const loader=new GLTFLoader(),results=await Promise.allSettled(['/models/einstein.glb','/models/einstein-teleporter.glb'].map(path=>loadNpcGltf(loader,assetUrl(path),signal)));
 const failure=results.find(r=>r.status==='rejected');if(failure||signal?.aborted){results.forEach(r=>{if(r.status==='fulfilled')disposeOwnedObject(r.value.scene);});throw failure?.reason??new DOMException('Aborted','AbortError');}
 const [person,machine]=results.map(r=>r.value);
 const actor=person.scene,portal=machine.scene,access=createWorldAccess(world,solver);let site=new THREE.Vector3(...placement.fixedSite),approach=new THREE.Vector3(...placement.fixedApproach);
 const anchors=placement.searchAnchors;
 // Search a flat, reachable roadside alcove; keep the full machine off the route.
 search:for(const anchor of (site?[]:anchors))for(const offset of [[7,0],[-7,0],[0,7],[0,-7],[10,0],[-10,0]]){
  const p=new THREE.Vector3(anchor[0]+offset[0],0,anchor[1]+offset[1]);p.y=world.height(p.x,p.z);
  const a=new THREE.Vector3(anchor[0],world.height(...anchor),anchor[1]);
  if(!access.walkablePath(a,p))continue;
  if(![-2.8,-1.5,0,1.5,2.8].every(dx=>[-1.8,0,1.8].every(dz=>access.clearFloor(p.x+dx,p.z+dz)&&Math.abs(world.height(p.x+dx,p.z+dz)-p.y)<.18)))continue;
  site=p;approach=a;break search;
 }
 if(!site)throw Error('No accessible flat Einstein teleporter site');
 portal.position.copy(site);actor.position.copy(site).add(new THREE.Vector3(-2.2,0,0));if(placement.fixedActor)actor.position.set(...placement.fixedActor);else actor.position.y=world.height(actor.position.x,actor.position.z);actor.rotation.y=Math.atan2(approach.x-actor.position.x,approach.z-actor.position.z);
 for(const model of [actor,portal]){model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(model);}
 const dialogue=createRPGDialogue({uiRoot,id:'einstein-dialogue',compact:true,speaker:'ALBERT EINSTEIN',lines:[
  '“Care to test my teleporter? One charge. Straight to the cat’s bench.”',
 ],choices:[{text:'Let’s test your machine',data:{einstein:'travel'}},{text:'I’ll take my chances on foot',data:{einstein:'close'}},{text:'Where can it take me?',data:{einstein:'about'}}]});
 const view=createNPCConversationCamera(camera,{actor,approach});
 const panel=dialogue.panel;dialogue.status.dataset.einstein='status';
 let introduced=false,travels=0,lastDestination=null,clock=0;
 const stops=placement.destinations;
 // Reject an unsafe landing if the map changes.
 const b=world.data.encounterBounds??world.data.playableBounds;
 const safeStops=stops.filter(({point:[x,z]})=>{
  if(x<b.minX+25||x>b.maxX-25||z<b.minZ+25||z>b.maxZ-25)return false;
  if(!access.clearFloor(x,z))return false;
  const from=new THREE.Vector3(x,world.height(x,z),z);
  return [[3,0],[-3,0],[0,3],[0,-3]].some(([dx,dz])=>access.walkablePath(from,new THREE.Vector3(x+dx,world.height(x+dx,z+dz),z+dz)));
 });
 const destinations=safeStops.map(stop=>stop.point);
 function close(){panel.hidden=true;view.end();}
 function openPanel(){view.begin();dialogue.setLine(travels>=1?'“The capacitor is empty. You will have to walk from here.”':'“Care to test my teleporter? One charge. Straight to the cat’s bench.”');panel.hidden=false;onOpen();const button=panel.querySelector('[data-einstein=travel]');button.disabled=travels>=1||!destinations.length;panel.querySelector('[data-einstein=status]').textContent=travels>=1?'Charge empty · resets next run':destinations.length?'':'The machine is out of service.';dialogue.focus();}
 function travel(){if(travels>=1){openPanel();return true;}const target=destinations[0];if(!target)return false;close();return onTravel(...target);}
 panel.querySelector('[data-einstein=about]').onclick=()=>dialogue.setLine('“Right in front of the cat’s bench. Same destination every time.”');
 panel.querySelector('[data-einstein=close]').onclick=close;
 panel.querySelector('[data-einstein=travel]').onclick=()=>travel();
 return {dispose(){close();dialogue.dispose();disposeOwnedObject(actor);disposeOwnedObject(portal);},actor,portal,approach,destinations,active:()=>!panel.hidden,near:position=>access.canInteract(position,actor.position,gameConfig.npcs.einstein.interactionDistance)?'E: TALK TO ALBERT EINSTEIN':access.canInteract(position,portal.position,gameConfig.npcs.einstein.portalDistance)?(travels>=1?'E: CHECK TELEPORTER · CHARGE EMPTY':'E: USE TELEPORTER · ONE CHARGE'):null,
  interact(position){if(introduced&&access.canInteract(position,portal.position,gameConfig.npcs.einstein.portalDistance))return travel();if(access.canInteract(position,actor.position,gameConfig.npcs.einstein.interactionDistance)){introduced=true;openPanel();return true;}if(access.canInteract(position,portal.position,3)){if(!introduced){introduced=true;openPanel();return true;}return travel();}return false;},
  keydown(e){return dialogue.keydown(e,close);},
  update(dt){if(!panel.hidden)view.update();clock+=dt;portal.traverse(o=>{if(o.isMesh&&o.material.emissiveIntensity>0)o.material.emissiveIntensity=2.5+Math.sin(clock*2)*.35;});},
  markTravel(target){travels=1;lastDestination=target;},reject(){openPanel();},reset(){close();introduced=false;travels=0;lastDestination=null;},state:()=>({introduced,travels,open:!panel.hidden,position:actor.position.toArray(),portal:portal.position.toArray(),approach:approach.toArray(),lastDestination,candidateCount:destinations.length,chargesRemaining:Math.max(0,1-travels),destinations:safeStops.map(stop=>({name:stop.name,point:[...stop.point]})),lastLocation:safeStops.find(stop=>stop.point===lastDestination)?.name??null})};
}
