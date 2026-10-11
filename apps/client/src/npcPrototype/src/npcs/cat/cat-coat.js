import * as THREE from 'three';

// Planar fur UVs keep the stripes continuous across the resting cat's back.
export function applyTabbyCoat(mesh){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#b4a48b';ctx.fillRect(0,0,512,512);
 let seed=137;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<13;i++){
  ctx.beginPath();const z=i*44-20;
  for(let x=0;x<=512;x+=4){const y=z+Math.sin(x*.014+i*.7)*17+Math.sin(x*.037+i)*6;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.strokeStyle='#776955';ctx.shadowColor='#776955';ctx.shadowBlur=3;ctx.lineWidth=5+random()*6;ctx.stroke();
 }
 ctx.shadowBlur=0;
 for(let i=0;i<24000;i++){
  const x=random()*512,y=random()*512;ctx.strokeStyle=random()>.5?'rgba(236,222,195,.15)':'rgba(49,43,35,.13)';ctx.lineWidth=.65;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+random()*3,y+random()*2);ctx.stroke();
 }
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
 const geometry=mesh.geometry;geometry.computeBoundingBox();const box=geometry.boundingBox,size=box.getSize(new THREE.Vector3()),position=geometry.attributes.position;
 const uv=new Float32Array(position.count*2);
 for(let i=0;i<position.count;i++){uv[i*2]=(position.getX(i)-box.min.x)/size.x;uv[i*2+1]=(position.getZ(i)-box.min.z)/size.z;}
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
 const old=mesh.material;mesh.material=new THREE.MeshStandardMaterial({map,color:'#ffffff',roughness:.96});
 // This imported asset owns its materials; keep old ones for the host disposer.
 mesh.userData.replacedCoat=old;
 return old;
}
