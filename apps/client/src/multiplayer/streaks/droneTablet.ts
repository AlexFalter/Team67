import * as THREE from 'three';
import {DRONE_CALL_MS} from '@race/shared';
export function createDroneTablet(){
 const root=new THREE.Group();root.name='Drone call-in tablet';
 const skin=new THREE.MeshStandardMaterial({color:'#c99573',roughness:.8}),caseMaterial=new THREE.MeshStandardMaterial({color:'#17252d',roughness:.65});
 const box=(size:number[],p:number[],material:THREE.Material,name:string,parent:THREE.Object3D=root)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),material);mesh.name=name;mesh.position.set(...p as [number,number,number]);parent.add(mesh);return mesh;};
 box([.57,.38,.035],[0,0,0],caseMaterial,'Rubberized tablet');
 for(const x of [-.278,.278])box([.035,.42,.055],[x,0,0],caseMaterial,'Protective grip');
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(.49,.3),new THREE.MeshBasicMaterial({map:texture}));screen.position.z=.019;root.add(screen);
 box([.085,.13,.075],[-.26,-.09,.035],skin,'Left palm');box([.08,.36,.075],[-.26,-.33,.025],skin,'Left forearm');
 for(let i=0;i<4;i++)box([.016,.09,.023],[-.285+i*.018,-.06,.065],skin,'Left fingers');
 const hand=new THREE.Group();hand.name='Tablet tapping hand';root.add(hand);box([.075,.09,.065],[0,0,0],skin,'Right palm',hand);box([.022,.09,.027],[-.018,.075,-.022],skin,'Tapping index finger',hand);box([.075,.32,.065],[.025,-.21,.015],skin,'Right forearm',hand);
 return {root,hand,canvas,texture};
}
const ease=(n:number)=>{n=THREE.MathUtils.clamp(n,0,1);return n*n*(3-2*n);};
export function poseDroneTablet(tablet:ReturnType<typeof createDroneTablet>,elapsed:number){
 const t=THREE.MathUtils.clamp(elapsed/(DRONE_CALL_MS/1000),0,1),lift=ease(t/.2),lower=ease((t-.82)/.18),height=lift*(1-lower);
 tablet.root.position.set(.02,-.85+height*.65,-.45-height*.22);tablet.root.rotation.set(-.5*height,.06,-.04*height);
 const tapCenters=[.34,.52,.7],index=t<.43?0:t<.61?1:2,press=Math.max(0,1-Math.abs(t-tapCenters[index])/.055);
 tablet.hand.position.set(-.14+.14*ease((t-.39)/.08)+.14*ease((t-.57)/.08),-.21,.14-press*.11);tablet.hand.rotation.x=-.1+press*.12;
 return {t,index,press};
}
export function drawDroneTablet(tablet:ReturnType<typeof createDroneTablet>,elapsed:number){
 const {index,press,t}=poseDroneTablet(tablet,elapsed),ctx=tablet.canvas.getContext('2d')!;ctx.fillStyle='#071e23';ctx.fillRect(0,0,640,400);
 ctx.strokeStyle='#21645f';ctx.lineWidth=2;for(let i=0;i<9;i++){ctx.beginPath();ctx.moveTo(i*80,50);ctx.lineTo(i*80,290);ctx.moveTo(0,50+i*30);ctx.lineTo(640,50+i*30);ctx.stroke();}
 ctx.fillStyle='#80f1c7';ctx.font='bold 24px monospace';ctx.fillText('UAV / RECON DRONE',24,35);ctx.font='18px monospace';ctx.fillText(t>.72?'UPLINK CONFIRMED':t>.45?'AUTHORIZE SWEEP':'ESTABLISH UPLINK',24,278);
 const angle=elapsed*3;ctx.strokeStyle='#79ffd0';ctx.beginPath();ctx.arc(320,155,86,0,Math.PI*2);ctx.moveTo(320,155);ctx.lineTo(320+Math.cos(angle)*86,155+Math.sin(angle)*86);ctx.stroke();
 for(let i=0;i<3;i++){ctx.fillStyle=i===index&&press>0?'#9fffcd':'#14433d';ctx.fillRect(78+i*180,304,140,54);ctx.fillStyle='#d9fff1';ctx.font='bold 17px monospace';ctx.fillText(['LINK','SCAN','LAUNCH'][i],100+i*180,337);}
 tablet.texture.needsUpdate=true;
}
