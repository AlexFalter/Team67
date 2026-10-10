import * as THREE from 'three';
// Visual reference: Whgler, Polybahn Wagen.jpg (Wikimedia Commons, 2019).
// Compact prototype cabin: varnished slats, cream lining, brass globe lamps.
export function addPolybahnInterior(car){
 const group=new THREE.Group();group.name='Zurich Polybahn cabin interior';car.add(group);
 const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#a1804b';ctx.fillRect(0,0,256,64);for(let i=0;i<45;i++){ctx.strokeStyle=i%3?'#987141':'#b49560';ctx.lineWidth=i%4===0?2:1;ctx.beginPath();ctx.moveTo(0,(i*13)%64);ctx.bezierCurveTo(80,(i*13+9)%64,180,(i*13+3)%64,256,(i*13)%64);ctx.stroke();}const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 const wood=new THREE.MeshStandardMaterial({map:texture,roughness:.58}),cream=new THREE.MeshStandardMaterial({color:'#ece6ce',roughness:.65}),brass=new THREE.MeshStandardMaterial({color:'#88734b',metalness:.6,roughness:.35}),lamp=new THREE.MeshStandardMaterial({color:'#fff0d2',emissive:'#fff0d2',emissiveIntensity:.6,roughness:.5});
 function box(x,y,z,w,h,d,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);group.add(mesh);return mesh;}
 for(const side of [-1,1]){for(let i=0;i<4;i++)box(side*(.51+i*.125),.985,0,.115,.032,3.86,wood);for(let i=0;i<4;i++)box(side*1.015,1.02+i*.09,0,.032,.075,3.86,wood);box(side*.96,1.43,0,.075,.055,3.9,cream);box(side*1.03,2.17,0,.08,.14,4.55,cream);}
 for(const z of [-1.65,0,1.65]){box(0,2.24,z,.06,.08,.06,brass);const shade=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),lamp);shade.scale.set(1,.65,1);shade.position.set(0,2.19,z);group.add(shade);}
 const sign=document.createElement('canvas');sign.width=512;sign.height=128;const sc=sign.getContext('2d');sc.fillStyle='#ece6ce';sc.fillRect(0,0,512,128);sc.fillStyle='#a82130';sc.textAlign='center';sc.font='bold 39px Arial';sc.fillText('UBS POLYBAHN',256,51);sc.fillStyle='#263d37';sc.font='23px Arial';sc.fillText('CENTRAL ↔ ETH · ZÜRICH',256,88);const map=new THREE.CanvasTexture(sign);map.colorSpace=THREE.SRGBColorSpace;for(const z of [-2.32,2.32]){const board=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.3),new THREE.MeshBasicMaterial({map}));board.position.set(0,2.08,z);if(z>0)board.rotation.y=Math.PI;group.add(board);}
 return group;
}
