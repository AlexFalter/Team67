import * as THREE from 'three';
// Ticket cabinet from mini-games-2; the current map owns the stations and rails.
export function createTicketProps(scene,ticketPoints){
 function box(g,x,y,z,w,h,d,m){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);}
 const gold=new THREE.MeshStandardMaterial({color:'#ffd174',roughness:.5}),navy=new THREE.MeshStandardMaterial({color:'#183847',roughness:.6});
 const silver=new THREE.MeshStandardMaterial({color:'#bdc6cd',metalness:.65,roughness:.35}),red=new THREE.MeshStandardMaterial({color:'#d62935'}),dark=new THREE.MeshStandardMaterial({color:'#09151c'});
 const ticketProps=ticketPoints.map((point,i)=>{
  const g=new THREE.Group();g.name=`Polybahn ticket machine ${i+1}`;g.position.copy(point);
  box(g,0,.12,0,.88,.24,.64,silver);box(g,0,1.37,0,.82,1.22,.56,silver);box(g,0,1.94,0,.82,.12,.56,red);
  box(g,-.37,.50,0,.08,.52,.56,silver);box(g,.37,.50,0,.08,.52,.56,silver);box(g,0,.50,.20,.66,.52,.12,silver);
  box(g,0,1.46,-.29,.65,.58,.025,dark);box(g,0,1.46,-.31,.55,.46,.025,navy);
  box(g,.20,.96,-.30,.21,.16,.06,dark);box(g,.20,.96,-.34,.16,.025,.015,gold);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)box(g,-.22+col*.06,1.04-row*.06,-.30,.045,.04,.035,dark);
  box(g,0,.32,-.36,.68,.035,.34,silver);box(g,0,.72,-.29,.68,.06,.08,dark);
  const slot=new THREE.Mesh(new THREE.BoxGeometry(.65,.34,.025),dark);slot.name='Ticket collection box';slot.position.set(0,.52,-.265);g.add(slot);
  const paper=document.createElement('canvas');paper.width=512;paper.height=256;const pc=paper.getContext('2d');pc.fillStyle='#fff8e5';pc.fillRect(0,0,512,256);pc.fillStyle='#cd2635';pc.fillRect(0,0,512,40);pc.fillStyle='#172b38';pc.font='bold 44px Arial';pc.fillText('POLYBAHN',28,100);pc.font='28px Arial';pc.fillText('1 JOURNEY · CHF 1.20',28,150);for(let n=0;n<65;n++)pc.fillRect(28+n*7,180,n%3===0?4:2,48);
  const texture=new THREE.CanvasTexture(paper);texture.colorSpace=THREE.SRGBColorSpace;
  const ticket=new THREE.Mesh(new THREE.PlaneGeometry(.44,.22),new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide}));ticket.rotation.x=-Math.PI/2;ticket.rotation.z=Math.PI;ticket.position.set(0,.51,-.30);ticket.visible=false;ticket.name='Printed Polybahn ticket';g.add(ticket);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#122c38';ctx.fillRect(0,0,512,256);ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.font='bold 54px Arial';ctx.fillText('POLYBAHN',256,75);ctx.font='36px Arial';ctx.fillText('Tickets / Billette',256,140);ctx.fillStyle='#ffd174';ctx.fillText('E · CHF 1.20',256,210);const screenTexture=new THREE.CanvasTexture(canvas);screenTexture.colorSpace=THREE.SRGBColorSpace;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(.54,.45),new THREE.MeshBasicMaterial({map:screenTexture}));screen.rotation.y=Math.PI;screen.position.set(0,1.46,-.33);g.add(screen);
  scene.add(g);return {group:g,ticket,slot,screen};
 });

 return ticketProps;
}
