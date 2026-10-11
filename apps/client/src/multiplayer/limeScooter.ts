import * as THREE from 'three';
import {createLimeModel} from '../npcPrototype/src/vehicles/scooter/lime-model.js';

export function createLimeScooter(){
 const root=new THREE.Group(),model=createLimeModel();root.name='Lime scooter';
 // The NPC model faces -Z; multiplayer vehicles face +Z.
 model.rotation.y=Math.PI;root.add(model);return root;
}
