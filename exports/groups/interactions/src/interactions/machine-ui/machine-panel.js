import * as THREE from 'three';
// A DOM control panel anchored to a physical rectangular machine surface.
export function createMachinePanel(element,object,{left,right,bottom,top,depth}){
 const corners=[[left,bottom],[left,top],[right,bottom],[right,top]].map(([x,y])=>new THREE.Vector3(x,y,depth));
 return {update(camera){
  const points=corners.map(point=>object.localToWorld(point.clone()).project(camera));
  const xs=points.map(p=>(p.x+1)*innerWidth/2),ys=points.map(p=>(1-p.y)*innerHeight/2);
  const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
  Object.assign(element.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`});
 }};
}
