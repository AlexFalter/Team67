import * as THREE from 'three';
import {createLimeModel} from '../npcPrototype/src/vehicles/scooter/lime-model.js';

export function createLimeScooter(){
 const root=new THREE.Group(),model=createLimeModel();root.name='Lime scooter';
 const deck=new THREE.Group();deck.name='Lime tailwhip deck';deck.position.z=-.75;
 for(const part of [...model.children])if(part.name.startsWith('Tailwhip ')){
  part.position.z+=.75;deck.add(part);
 }
 model.add(deck);
 // The NPC model faces -Z; multiplayer vehicles face +Z.
 model.rotation.y=Math.PI;root.add(model);return root;
}
