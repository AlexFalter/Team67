import {featurePlacement} from '../../world/placements/feature-placement.js';
import {gameConfig} from '../../config/game-config.js';
import {createNPCConversationCamera} from '../shared/conversation-camera.js';
import {createRPGDialogue} from '../shared/rpg-dialogue.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createWorldAccess} from '../../world/core/world-access.js';

export async function createEinsteinTeleporter(scene,world,solver,{camera,onTravel,onOpen,placement}){
 placement=featurePlacement(world,'einstein',placement);
 const loader=new GLTFLoader(),[person,machine]=await Promise.all([loader.loadAsync('/models/einstein.glb'),loader.loadAsync('/models/einstein-teleporter.glb')]);
 const actor=person.scene,portal=machine.scene,access=createWorldAccess(world,solver);let site=null,approach=null;
 const anchors=placement.searchAnchors;
 // Search a flat, reachable roadside alcove; keep the full machine off the route.
 search:for(const anchor of anchors)for(const offset of [[7,0],[-7,0],[0,7],[0,-7],[10,0],[-10,0]]){
  const p=new THREE.Vector3(anchor[0]+offset[0],0,anchor[1]+offset[1]);p.y=world.height(p.x,p.z);
  const a=new THREE.Vector3(anchor[0],world.height(...anchor),anchor[1]);
  if(!access.walkablePath(a,p))continue;
  if(![-2.8,-1.5,0,1.5,2.8].every(dx=>[-1.8,0,1.8].every(dz=>access.clearFloor(p.x+dx,p.z+dz)&&Math.abs(world.height(p.x+dx,p.z+dz)-p.y)<.18)))continue;
  site=p;approach=a;break search;
 }
 if(!site)throw Error('No accessible flat Einstein teleporter site');
 portal.position.copy(site);actor.position.copy(site).add(new THREE.Vector3(-2.2,0,0));actor.position.y=world.height(actor.position.x,actor.position.z);actor.rotation.y=Math.atan2(approach.x-actor.position.x,approach.z-actor.position.z);
 for(const model of [actor,portal]){model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(model);}
 const dialogue=createRPGDialogue({id:'einstein-dialogue',compact:true,speaker:'ALBERT EINSTEIN',lines:[
  '“Care to test my teleporter? One charge. No express service to ETH.”',
 ],choices:[{text:'Let’s test your machine',data:{einstein:'travel'}},{text:'I’ll take my chances on foot',data:{einstein:'close'}},{text:'Where can it take me?',data:{einstein:'about'}}]});
 const view=createNPCConversationCamera(camera,{actor,approach});
 const panel=dialogue.panel;dialogue.status.dataset.einstein='status';
 let introduced=false,travels=0,lastDestination=null,clock=0;
 const stops=placement.destinations;
 // Fixed, modest shortcuts only. Reject an unsafe stop if the map changes.
 const b=world.data.encounterBounds??world.data.playableBounds;
 const safeStops=stops.filter(({point:[x,z]})=>{
  if(x<b.minX+25||x>b.maxX-25||z<b.minZ+25||z>b.maxZ-25)return false;
  if(world.height(x,z)>site.y+14||Math.hypot(x-placement.goal[0],z-placement.goal[1])<180)return false;
  if(![-.8,0,.8].every(dx=>[-.8,0,.8].every(dz=>access.clearFloor(x+dx,z+dz))))return false;
  const from=new THREE.Vector3(x,world.height(x,z),z);
  return [[3,0],[-3,0],[0,3],[0,-3]].some(([dx,dz])=>access.walkablePath(from,new THREE.Vector3(x+dx,world.height(x+dx,z+dz),z+dz)));
 });
 const destinations=safeStops.map(stop=>stop.point);
 function close(){panel.hidden=true;view.end();}
 function openPanel(){view.begin();dialogue.setLine(travels>=1?'“The capacitor is empty. You will have to walk from here.”':'“Care to test my teleporter? One charge. No express service to ETH.”');panel.hidden=false;onOpen();const button=panel.querySelector('[data-einstein=travel]');button.disabled=travels>=1||!destinations.length;panel.querySelector('[data-einstein=status]').textContent=travels>=1?'Charge empty · resets next run':destinations.length?'':'The machine is out of service.';dialogue.focus();}
 function travel(position){if(travels>=1){openPanel();return true;}const candidates=destinations.filter(p=>Math.hypot(p[0]-position.x,p[1]-position.z)>30);if(!candidates.length)return false;const target=candidates[Math.floor(Math.random()*candidates.length)];close();if(!onTravel(...target))return false;travels++;lastDestination=target;return true;}
 panel.querySelector('[data-einstein=about]').onclick=()=>dialogue.setLine('“Bahnhofbrücke, Central, or lower Leonhardstrasse. The machine chooses, not me.”');
 panel.querySelector('[data-einstein=close]').onclick=close;
 panel.querySelector('[data-einstein=travel]').onclick=()=>travel(actor.position);
 return {actor,portal,approach,destinations,active:()=>!panel.hidden,near:position=>access.canInteract(position,actor.position,gameConfig.npcs.einstein.interactionDistance)?'E: TALK TO ALBERT EINSTEIN':access.canInteract(position,portal.position,gameConfig.npcs.einstein.portalDistance)?(travels>=1?'E: CHECK TELEPORTER · CHARGE EMPTY':'E: USE TELEPORTER · ONE CHARGE'):null,
  interact(position){if(introduced&&access.canInteract(position,portal.position,gameConfig.npcs.einstein.portalDistance))return travel(position);if(access.canInteract(position,actor.position,gameConfig.npcs.einstein.interactionDistance)){introduced=true;openPanel();return true;}if(access.canInteract(position,portal.position,3)){if(!introduced){introduced=true;openPanel();return true;}return travel(position);}return false;},
  keydown(e){return dialogue.keydown(e,close);},
  update(dt){if(!panel.hidden)view.update();clock+=dt;portal.traverse(o=>{if(o.isMesh&&o.material.emissiveIntensity>0)o.material.emissiveIntensity=2.5+Math.sin(clock*2)*.35;});},
  reset(){close();introduced=false;travels=0;lastDestination=null;},state:()=>({introduced,travels,open:!panel.hidden,position:actor.position.toArray(),portal:portal.position.toArray(),approach:approach.toArray(),lastDestination,candidateCount:destinations.length,chargesRemaining:Math.max(0,1-travels),destinations:safeStops.map(stop=>({name:stop.name,point:[...stop.point]})),lastLocation:safeStops.find(stop=>stop.point===lastDestination)?.name??null})};
}
