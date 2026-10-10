import * as THREE from 'three';
import {pointInPolygon} from '../core/geo-world.js';

// Render the existing mapped water polygons; no new map or collision geometry.
export function createRiverSurface(scene,world){
 const bounds=world.data.playableBounds,polygons=[];
 function clip(input,axis,limit,greater){const output=[];if(!input.length)return output;let a=input.at(-1),insideA=greater?a[axis]>=limit:a[axis]<=limit;for(const b of input){const insideB=greater?b[axis]>=limit:b[axis]<=limit;if(insideA!==insideB){const t=(limit-a[axis])/(b[axis]-a[axis]);output.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}if(insideB)output.push(b);a=b;insideA=insideB;}return output;}
 for(const source of world.data.water.filter(Array.isArray)){
  if(source.length<3)continue;let ring=source.map(p=>[p[0],p[1]]);
  for(const [axis,limit,greater] of [[0,bounds.minX,true],[0,bounds.maxX,false],[1,bounds.minZ,true],[1,bounds.maxZ,false]])ring=clip(ring,axis,limit,greater);
  ring=ring.filter((p,i)=>i===0||Math.hypot(p[0]-ring[i-1][0],p[1]-ring[i-1][1])>.001);
  if(ring.length>2&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<.001)ring.pop();if(ring.length<3)continue;
  const minX=Math.min(...ring.map(p=>p[0])),maxX=Math.max(...ring.map(p=>p[0])),minZ=Math.min(...ring.map(p=>p[1])),maxZ=Math.max(...ring.map(p=>p[1])),samples=[];
  const step=Math.max(2,Math.sqrt((maxX-minX)*(maxZ-minZ)/700));
  for(let x=minX+step/2;x<maxX;x+=step)for(let z=minZ+step/2;z<maxZ;z+=step)if(pointInPolygon(x,z,ring)&&world.isWater(x,z))samples.push(world.ground(x,z));
  if(!samples.length){const p=ring[0];samples.push(world.ground(p[0],p[1]));}samples.sort((a,b)=>a-b);
  // Low samples identify the river bed, excluding raised bridge and bank terrain.
  const level=samples[Math.floor(samples.length*.25)]+.22;
  polygons.push({ring,level,minX,maxX,minZ,maxZ});
 }
 const vertices=[],indices=[];
 for(const {ring,level} of polygons){const offset=vertices.length/3;for(const [x,z] of ring)vertices.push(x,level,z);for(const triangle of THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[]))indices.push(...triangle.map(i=>offset+i));}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const time={value:0},material=new THREE.MeshStandardMaterial({color:'#2d8394',roughness:.37,metalness:.12,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{shader.uniforms.waterTime=time;shader.vertexShader='uniform float waterTime; varying vec2 waterXZ;\n'+shader.vertexShader;shader.fragmentShader='uniform float waterTime; varying vec2 waterXZ;\n'+shader.fragmentShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwaterXZ=position.xz; transformed.y += .018*sin(position.x*.33+waterTime*1.6)+.012*sin(position.z*.46-waterTime);');shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple=sin(waterXZ.x*.7+waterXZ.y*.28-waterTime*1.8)*sin(waterXZ.y*.64+waterTime*.7); diffuseColor.rgb *= .94+.06*ripple; diffuseColor.rgb += vec3(.06,.10,.11)*pow(max(0.0,ripple),12.0);');};
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Limmat water surface';mesh.receiveShadow=true;scene.add(mesh);
 return {mesh,update(dt){time.value+=Math.max(0,dt);},heightAt(x,z){return polygons.find(p=>x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ&&pointInPolygon(x,z,p.ring))?.level??world.ground(x,z)+.15;},state:()=>({visible:mesh.visible,polygons:polygons.length,triangles:indices.length/3,time:time.value,levels:polygons.map(p=>p.level)})};
}
