import * as THREE from 'three';
export function createFoamDart(){
 const group=new THREE.Group();group.name='Blue foam dart with orange suction tip';
 const foam=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,.2,8).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:'#258eff',roughness:1}));group.add(foam);
 const tip=new THREE.Mesh(new THREE.CylinderGeometry(.041,.03,.028,10).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:'#ff7625',roughness:.7}));tip.position.z=.112;group.add(tip);return group;
}
