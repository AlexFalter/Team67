import * as THREE from 'three';

// Keep the playable story close to its route, without cropping the native map
// used by transit arrivals, terrain queries and vehicle navigation.
export function createMapBoundary(scene,world,{extraPoints=[]}={}){
 const points=[...(world.data.layoutRoute??world.data.route),...world.data.route,world.data.start,world.data.goal,...extraPoints],native=world.data.playableBounds,padding=55;
 const bounds={minX:Math.max(native.minX,Math.min(...points.map(p=>p[0]))-padding),maxX:Math.min(native.maxX,Math.max(...points.map(p=>p[0]))+padding),minZ:Math.max(native.minZ,Math.min(...points.map(p=>p[1]))-padding),maxZ:Math.min(native.maxZ,Math.max(...points.map(p=>p[1]))+padding)};
 world.data.encounterBounds=bounds;
 const margin=12,corners=[[bounds.minX+margin,bounds.minZ+margin],[bounds.maxX-margin,bounds.minZ+margin],[bounds.maxX-margin,bounds.maxZ-margin],[bounds.minX+margin,bounds.maxZ-margin]];
 const group=new THREE.Group();group.name='Visible private-property boundary';scene.add(group);
 const vertices=[],posts=[],color='#ed774b',ray=new THREE.Raycaster();
 // Boundary markers are outdoor geometry. Buildings close off their own part
 // of the perimeter; don't run a rail through their walls or over a roof.
 function clearMarker(x,z){
  const y=world.height(x,z);
  if(world.isWater(x,z)||world.bodyBlocked(x,y+.05,z,.25,1.4))return false;
  ray.set(new THREE.Vector3(x,y+1000,z),new THREE.Vector3(0,-1,0));ray.far=1001;
  return !ray.intersectObjects(world.buildings,false).length;
 }
 function clearRail(a,b){
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from),length=delta.length();
  ray.set(from,delta.normalize());ray.near=.001;ray.far=length;
  const clear=!ray.intersectObjects([world.collider,world.groundMesh],false).length;ray.near=0;
  return clear;
 }
 for(let edge=0;edge<4;edge++){
  const a=corners[edge],b=corners[(edge+1)%4],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/.5);
  let previous=null;
  for(let i=0;i<=steps;i++){
   const t=i/steps,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t),y=world.height(x,z)+.8,p=[x,y,z];
   if(!clearMarker(x,z)){previous=null;continue;}
   if(previous&&clearRail(previous,p))vertices.push(...previous,...p);previous=p;
   if(i%12===0)posts.push(x,y-.8,z,x,y+.45,z);
  }
 }
 for(const [values,opacity] of [[vertices,.95],[posts,.85]]){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));group.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity})));
 }
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#23313a';ctx.fillRect(0,0,512,128);ctx.strokeStyle=color;ctx.lineWidth=10;ctx.strokeRect(5,5,502,118);ctx.fillStyle='#ffbc8e';ctx.textAlign='center';ctx.font='bold 36px Arial';ctx.fillText('PRIVATE PROPERTY',256,57);ctx.font='23px Arial';ctx.fillText('MAP BOUNDARY',256,96);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 for(let edge=0;edge<4;edge++){
  const a=corners[edge],b=corners[(edge+1)%4],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/55);
  for(let i=0;i<count;i++){const t=(i+.5)/count,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);if(![-3.5,-1.75,0,1.75,3.5].every(offset=>clearMarker(x+(edge%2?0:offset),z+(edge%2?offset:0))))continue;const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:texture}));sign.position.set(x,world.height(x,z)+2.4,z);sign.scale.set(7,1.75,1);group.add(sign);}
 }
 return {bounds,corners,group};
}

export function drawMapBoundary(ctx,bounds,sx,sz){
 if(!bounds)return;ctx.save();ctx.strokeStyle='#c94f2e';ctx.lineWidth=3;ctx.setLineDash([9,6]);ctx.strokeRect(sx(bounds.minX+12),sz(bounds.minZ+12),sx(bounds.maxX-12)-sx(bounds.minX+12),sz(bounds.maxZ-12)-sz(bounds.minZ+12));ctx.restore();
}
