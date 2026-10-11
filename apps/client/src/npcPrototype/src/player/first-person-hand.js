import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
let template;
export async function makeFirstPersonHand(pose="knife"){
 template??=new GLTFLoader().loadAsync('/models/first-person-hand.glb');
 const {scene}=await template;const hand=scene.clone(true);
 hand.traverse(o=>{if(o.name.replaceAll("_"," ")==="Knife hand")o.visible=pose==="knife";if(o.name.replaceAll("_"," ")==="Walking hand")o.visible=pose==="walking";if(o.isMesh){o.geometry=o.geometry.clone();o.material=o.material.clone();o.material.depthTest=true;o.material.depthWrite=true;o.layers.set(0);o.renderOrder=2200;o.frustumCulled=false;}});
 return hand;
}
