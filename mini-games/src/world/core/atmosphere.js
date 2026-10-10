import {gameConfig} from '../../config/game-config.js';
import * as THREE from 'three';

// Match Team67's MapViewer lighting and renderer. The map stays unmodified.
export function addAtmosphere(scene,renderer){
 scene.background=new THREE.Color(gameConfig.visuals.skyColor);scene.fog=null;
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;
 renderer.setPixelRatio(Math.min(devicePixelRatio,gameConfig.visuals.maximumPixelRatio));
 renderer.shadowMap.enabled=gameConfig.visuals.shadows;renderer.shadowMap.type=THREE.PCFShadowMap;
 renderer.shadowMap.autoUpdate=true;
 const hemisphere=new THREE.HemisphereLight(gameConfig.visuals.hemisphereSkyColor,gameConfig.visuals.hemisphereGroundColor,gameConfig.visuals.hemisphereIntensity);
 const sun=new THREE.DirectionalLight(gameConfig.visuals.sunColor,gameConfig.visuals.sunIntensity);
 sun.position.set(-300,700,500);sun.castShadow=true;sun.shadow.mapSize.set(gameConfig.visuals.shadowMapSize,gameConfig.visuals.shadowMapSize);
 Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:120});
 sun.shadow.bias=-.0005;
 scene.add(hemisphere,sun,sun.target);
 return {sun,hemisphere,update(focus){sun.position.set(focus.x-20,focus.y+40,focus.z+20);sun.target.position.copy(focus);sun.target.updateMatrixWorld();}};
}
