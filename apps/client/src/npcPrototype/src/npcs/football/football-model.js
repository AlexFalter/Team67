import * as THREE from 'three';
export function createFootballModel(){
 const materials=new Map(),mat=c=>{if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.8}));return materials.get(c);};
 const football=new THREE.Group();football.name='Tim Gio football';
 const shell=new THREE.Mesh(new THREE.SphereGeometry(.22,24,16),mat('#f5f2e9'));shell.castShadow=true;shell.receiveShadow=true;football.add(shell);
 // Twelve black pentagonal panels follow an icosahedron's vertex directions.
 const panelDirections=new THREE.IcosahedronGeometry(1,0),seen=new Set(),points=panelDirections.attributes.position;
 for(let i=0;i<points.count;i++){
  const normal=new THREE.Vector3().fromBufferAttribute(points,i).normalize(),key=normal.toArray().map(v=>v.toFixed(4)).join(',');if(seen.has(key))continue;seen.add(key);
  const tangent=new THREE.Vector3(0,1,0);if(Math.abs(normal.y)>.9)tangent.set(1,0,0);tangent.cross(normal).normalize();const bitangent=new THREE.Vector3().crossVectors(normal,tangent),vertices=[];
  const ring=Array.from({length:5},(_,n)=>normal.clone().multiplyScalar(Math.cos(.32)).addScaledVector(tangent,Math.sin(.32)*Math.cos(n*Math.PI*2/5)).addScaledVector(bitangent,Math.sin(.32)*Math.sin(n*Math.PI*2/5)).multiplyScalar(.223));
  const center=normal.clone().multiplyScalar(.223);
  for(let n=0;n<5;n++){
   const point=(u,v)=>center.clone().multiplyScalar(1-u-v).addScaledVector(ring[n],u).addScaledVector(ring[(n+1)%5],v).normalize().multiplyScalar(.223);
   for(let u=0;u<4;u++)for(let v=0;v<4-u;v++){
    vertices.push(...point(u/4,v/4).toArray(),...point((u+1)/4,v/4).toArray(),...point(u/4,(v+1)/4).toArray());
    if(u+v<3)vertices.push(...point((u+1)/4,v/4).toArray(),...point((u+1)/4,(v+1)/4).toArray(),...point(u/4,(v+1)/4).toArray());
   }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();football.add(new THREE.Mesh(geometry,mat('#171b20')));
 }
 panelDirections.dispose();
 return football;
}
