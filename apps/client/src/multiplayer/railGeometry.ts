import * as THREE from 'three';

type RailFrame={x:number;y:number;z:number;rotY:number};
// Shared cross-sections eliminate the overlapping cylinder joints on curved rails.
export function createRailGeometry(sample:(distance:number)=>RailFrame,start:number,end:number,side:number,lift:number){
 const positions:number[]=[],indices:number[]=[];
 const steps=Math.ceil((end-start)/.35),sides=6;
 for(let i=0;i<=steps;i++){
  const f=sample(start+(end-start)*i/steps);
  for(let j=0;j<sides;j++){
   const angle=j*2*Math.PI/sides,across=side+Math.cos(angle)*.035;
   positions.push(f.x+Math.cos(f.rotY)*across,f.y+lift+Math.sin(angle)*.035,f.z-Math.sin(f.rotY)*across);
  }
  if(i>0)for(let j=0;j<sides;j++){
   const a=(i-1)*sides+j,b=(i-1)*sides+(j+1)%sides,c=i*sides+j,d=i*sides+(j+1)%sides;
   indices.push(a,c,b,b,c,d);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
