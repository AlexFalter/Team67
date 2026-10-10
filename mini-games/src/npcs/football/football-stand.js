import * as THREE from 'three';
import {createStudent} from '../../player/student-model.js';
import {createRPGDialogue} from '../shared/rpg-dialogue.js';
import {createFeatureLifecycle,disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {featurePlacement,placementPoint} from '../../world/placements/feature-placement.js';
import {createFootballVoice} from './football-voice.js';
import {gameConfig} from '../../config/game-config.js';

export function createFootballStand(scene,world,{camera,placement,uiRoot=document.body,assetUrl=p=>p,onClose=()=>{},onReward=()=>{},avoid=[]}={}){
 const spec=featurePlacement(world,'football',placement),life=createFeatureLifecycle();
 const group=new THREE.Group();group.name='Tim Gio · football stand';
 const heading=spec.heading??0;if(!Number.isFinite(heading))throw Error('Invalid football heading');group.rotation.y=heading;
 const turn=(x,z)=>[x*Math.cos(heading)+z*Math.sin(heading),-x*Math.sin(heading)+z*Math.cos(heading)];
 function clear(x,z){const y=world.height(x,z);if(!Number.isFinite(y)||avoid.some(p=>Math.hypot(x-p.x,z-p.z)<9))return false;
  for(let lx=-2.8;lx<=2.8;lx+=.7)for(let lz=-4.8;lz<=4.8;lz+=.8){const [dx,dz]=turn(lx,lz);if(world.blocked(x+dx,z+dz)||world.isWater?.(x+dx,z+dz)||Math.abs(world.height(x+dx,z+dz)-y)>.45)return false;}return true;}
 let point=spec.position&&placementPoint(spec.position);
 if(point&&!clear(...point))throw Error('Football stand needs a clear, level 6 × 10 m placement');
 if(!point)outer:for(const anchor of spec.searchAnchors??[]){const [x,z]=placementPoint(anchor);for(let r=0;r<=32;r+=2)for(let i=0;i<(r?24:1);i++){const a=i/24*Math.PI*2,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;if(clear(px,pz)){point=[px,pz];break outer;}}}
 if(!point)throw Error('No clear placement for football stand');
 group.position.set(point[0],world.height(...point),point[1]);scene.add(group);
 const materials=new Map(),mat=c=>{if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.8}));return materials.get(c);};
 const box=(parent,c,x,y,z,w,h,d)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);parent.add(m);return m;};
 // A compact fan stand faces the player; the penalty lane sits next to the TV.
 box(group,'#323537',-1.75,.62,1.6,1.25,1.2,.7);box(group,'#dab96a',-1.75,1.25,1.6,1.5,.12,.9);
 for(const x of [-2.35,-1.15])box(group,'#e7e7dd',x,1.6,1.7,.065,3.1,.065);
 box(group,'#191919',-1.75,3.2,1.7,1.5,.18,1.1);box(group,'#cf3037',-1.75,3.08,1.07,1.5,.14,.12);box(group,'#f1c13c',-1.75,2.94,1.07,1.5,.14,.12);
 box(group,'#15191c',-1.75,2.1,1.6,1.6,1.02,.16);
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.45,.86),new THREE.MeshBasicMaterial({map:texture}));screen.rotation.y=Math.PI;screen.position.set(-1.75,2.1,1.505);group.add(screen);
 const rig=createStudent(),actor=rig.player;actor.name='Tim Gio';actor.position.set(-1.8,0,.15);actor.scale.set(1.22,1.04,1.13);group.add(actor);
 actor.traverse(o=>{if(!o.isMesh)return;const c=o.material.color?.getHexString();if(['cf633d','a9432d'].includes(c)){o.visible=false;return;}if(c==='f4e7cc')o.material.color.set('#25282a');if(c==='284b60')o.material.color.set('#25282a');if(c==='bd8869')o.material.color.set('#dfb293');if(c==='302e2a')o.material.color.set('#493a2e');});
 // Wider hoodie silhouette, short hair, over-ear headphones and Germany garland.
 box(actor,'#25282a',0,1.2,.12,.58,.58,.36);
 for(const side of [-1,1])box(actor,'#111417',side*.188,1.61,-.01,.09,.23,.23);
 const band=new THREE.Mesh(new THREE.TorusGeometry(.20,.024,6,16,Math.PI),mat('#111417'));band.position.set(0,1.61,-.01);actor.add(band);
 for(let i=0;i<10;i++){const side=i<5?-1:1,n=i%5,y=1.38-n*.105,x=side*(.12+n*.032),c=['#141414','#db3340','#e4be35'][i%3];const flower=new THREE.Mesh(new THREE.SphereGeometry(.065,6,4),mat(c));flower.scale.set(1.2,.5,.6);flower.position.set(x,y,-.215);flower.rotation.z=side*.4;actor.add(flower);}
 const mouth=box(actor,'#743e35',0,1.51,-.16,.12,.03,.025);
 // Hand-attached, torso-sized mug. Keep it upright as he raises his arm.
 const mug=new THREE.Group();mug.name='Absurdly oversized Germany mug';mug.position.set(0,-.225,-.01);rig.elbows[0].add(mug);
 const ceramic=new THREE.MeshStandardMaterial({color:'#faf3df',roughness:.28,side:THREE.DoubleSide});
 const mugPart=(geometry,material,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mug.add(mesh);return mesh;};
 mugPart(new THREE.CylinderGeometry(.48,.43,1,24,1,true),ceramic,-.72,0,0);
 mugPart(new THREE.CylinderGeometry(.415,.385,.93,24,1,true),ceramic,-.72,.025,0);
 mugPart(new THREE.CylinderGeometry(.43,.43,.05,24),ceramic,-.72,-.475,0);
 const rim=mugPart(new THREE.TorusGeometry(.447,.034,8,24),ceramic,-.72,.5,0);rim.rotation.x=Math.PI/2;
 const handle=mugPart(new THREE.TorusGeometry(.27,.075,8,20),ceramic,-.19,0,0);handle.scale.x=.85;
 const coffee=mugPart(new THREE.CircleGeometry(.412,24),mat('#482b1b'),-.72,.415,0);coffee.rotation.x=-Math.PI/2;
 for(const [i,color] of ['#191919','#c83236','#e3bb32'].entries())mugPart(new THREE.CylinderGeometry(.475-i*.005,.471-i*.005,.10,24,1,true),mat(color),-.72,.25-i*.10,0);
 const handQuaternion=new THREE.Quaternion(),actorQuaternion=new THREE.Quaternion();
 function poseMug(shouting=false){rig.limbs[0].rotation.set(shouting?-.75:-.3,0,-.4);rig.elbows[0].rotation.x=-1.05;rig.elbows[0].getWorldQuaternion(handQuaternion);actor.getWorldQuaternion(actorQuaternion);mug.quaternion.copy(handQuaternion.invert().multiply(actorQuaternion));}
 poseMug();
 const voice=createFootballVoice({assetUrl,settings:gameConfig.npcs.football});life.own(()=>voice.dispose());
 const dialogue=createRPGDialogue({id:'football-dialogue',speaker:'TIM GIO · FOOTBALL CORNER',compact:true,lines:['Deutschland!'],choices:[{text:'Hol ihn raus'},{text:'Go away'}],uiRoot});life.own(()=>dialogue.dispose());
 let active=false,rewarded=false,age=0,savedCamera=null,paintAge=0;
 function close(keepVoice=false){active=false;dialogue.panel.hidden=true;if(!keepVoice)voice.stop();if(savedCamera){camera.position.copy(savedCamera.position);camera.quaternion.copy(savedCamera.quaternion);camera.up.copy(savedCamera.up);camera.fov=savedCamera.fov;camera.updateProjectionMatrix();savedCamera=null;}onClose();}
 [...dialogue.panel.querySelectorAll('button')].forEach((b,i)=>life.listen(b,'click',()=>{if(!active)return;if(i===0){if(!rewarded){rewarded=true;onReward('tim-gio-football');}voice.reply();close(true);}else close();}));
 function paint(){ctx.fillStyle='#132124';ctx.fillRect(0,0,640,360);ctx.fillStyle='#37854c';ctx.fillRect(25,80,590,250);ctx.strokeStyle='#dcecd7';ctx.lineWidth=3;ctx.strokeRect(42,95,556,220);ctx.beginPath();ctx.moveTo(320,95);ctx.lineTo(320,315);ctx.stroke();ctx.beginPath();ctx.arc(320,205,42,0,Math.PI*2);ctx.stroke();ctx.font='bold 25px Arial';ctx.fillStyle='white';ctx.textAlign='center';ctx.fillText('DEUTSCHLAND 7 : 1 CURAÇAO',320,42);for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#e6bd39':'#e7e7e2';ctx.beginPath();ctx.arc(80+i*65,165+Math.sin(age*.9+i)*65,7,0,Math.PI*2);ctx.fill();}ctx.fillStyle='white';ctx.beginPath();ctx.arc(320+Math.sin(age)*120,230+Math.cos(age)*35,4,0,Math.PI*2);ctx.fill();ctx.font='bold 15px Arial';ctx.fillText('TIM GIO · FAN ZONE',320,350);texture.needsUpdate=true;}
 paint();life.own(()=>{close();disposeOwnedObject(group);});
 return {group,actor,rig,audio:voice.audio,voice,active:()=>active,
  near(p){const a=actor.getWorldPosition(new THREE.Vector3());return Math.abs(p.y-a.y)<2&&p.distanceTo(a)<3.3;},
  interact(p){if(life.disposed||active||!this.near(p))return false;if(camera)savedCamera={position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),fov:camera.fov};active=true;dialogue.panel.hidden=false;voice.stop();dialogue.status.textContent=rewarded?'You already have his football.':'';dialogue.focus();return true;},
  blocked(x,z,y){if(Math.abs(y-group.position.y)>3)return false;const p=group.worldToLocal(new THREE.Vector3(x,group.position.y,z));return Math.abs(p.x+1.75)<1.1&&Math.abs(p.z-1.6)<.85;},
  keydown:e=>active?dialogue.keydown(e,close):false,
  update(dt,{listener,muted=false,paused=false,enabled=true}={}){if(life.disposed)return;const speaker=actor.getWorldPosition(new THREE.Vector3());voice.update(dt,listener,speaker,{muted,paused,talking:active,enabled});if(paused)return;age+=Math.max(0,dt);paintAge+=dt;if(paintAge>.12){paint();paintAge=0;}
   const shouting=voice.state().speaking;mouth.scale.y=shouting?.7+Math.abs(Math.sin(age*16))*2:1;rig.limbs[2].rotation.x=shouting?-2.4:0;poseMug(shouting);
   if(camera&&savedCamera){camera.position.copy(group.localToWorld(new THREE.Vector3(-1.8,1.65,-3)));camera.up.set(0,1,0);camera.lookAt(group.localToWorld(new THREE.Vector3(-1.8,1.35,.15)));}
  },
  reset(){close();voice.reset();rewarded=false;age=0;poseMug();paint();},dispose:()=>life.dispose(),
  state:()=>({active,rewarded,voice:voice.state(),position:group.position.toArray(),actorPosition:actor.getWorldPosition(new THREE.Vector3()).toArray()}),
 };
}
