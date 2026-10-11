import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const loader=new GLTFLoader();
export async function loadTransitModel(name){
 const {scene}=await loader.loadAsync(`/models/${name}.glb`);
 return ()=>{const model=scene.clone(true);model.name=name;model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;}});return model;};
}

// Detached template for the opening shuttle ride; no spare bus is parked on the map.
export async function loadETHLink(){
 const make=await loadTransitModel('eth-link'),bus=make();
 bus.visible=false;
 return bus;
}
