import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Authored through Blender MCP; +Z is rear, Y is up, wheel axle is X.
export async function loadPubliBike(){
  const {scene:template}=await new GLTFLoader().loadAsync('/models/publibike.glb');
  return function makeBicycle(){
    const bike=template.clone(true);
    const wheels=['RearWheel','FrontWheel'].map(name=>bike.getObjectByName(name));
    if(wheels.some(w=>!w)) throw new Error('PubliBike model is missing wheel pivots');
    bike.traverse(object=>{
      if(object.isMesh){object.castShadow=true;object.receiveShadow=false;}
    });
    bike.userData.wheels=wheels;
    return bike;
  };
}
