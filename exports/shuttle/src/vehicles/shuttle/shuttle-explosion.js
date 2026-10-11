import * as THREE from 'three';

export function createShuttleExplosion(scene){
 const group=new THREE.Group();scene.add(group);group.visible=false;
 function spriteTexture(smoke){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,smoke?'rgba(48,51,57,.8)':'rgba(255,255,210,1)');g.addColorStop(.35,smoke?'rgba(56,59,65,.7)':'rgba(255,174,25,.95)');g.addColorStop(.7,smoke?'rgba(65,68,74,.45)':'rgba(244,55,6,.65)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
 const fireTex=spriteTexture(false),smokeTex=spriteTexture(true),particles=[];
 for(let i=0;i<54;i++){const smoke=i>=22,a=i*2.39996,r=2+(i%7)*.65;const mat=new THREE.SpriteMaterial({map:smoke?smokeTex:fireTex,transparent:true,depthWrite:false,blending:smoke?THREE.NormalBlending:THREE.AdditiveBlending});const mesh=new THREE.Sprite(mat);group.add(mesh);particles.push({mesh,smoke,v:new THREE.Vector3(Math.cos(a)*r,smoke?5+i%5:3+i%6,Math.sin(a)*r),size:smoke?7+i%4:4+i%5});}
 const spray=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.18,0),new THREE.MeshBasicMaterial({color:'#ccf9ff',transparent:true,opacity:.85}),60);group.add(spray);const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(.7,2.5,.7),p=new THREE.Vector3();
 const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.11,6,80),new THREE.MeshBasicMaterial({color:'#e0faff',transparent:true,opacity:.9,depthWrite:false}));ring.rotation.x=-Math.PI/2;group.add(ring);
 const light=new THREE.PointLight('#ff8b25',0,80,2);group.add(light);
 let age=-1,audio;
 return {
  prime(){try{audio??=new AudioContext();audio.resume();}catch{}},
  reset(){age=-1;group.visible=false;light.intensity=0;},
  trigger(position){age=0;group.position.copy(position);group.visible=true;try{if(audio){const length=Math.floor(audio.sampleRate*1.7),buffer=audio.createBuffer(1,length,audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/length*5);const noise=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();noise.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(850,audio.currentTime);filter.frequency.exponentialRampToValueAtTime(65,audio.currentTime+1.5);gain.gain.value=.2;noise.connect(filter);filter.connect(gain);gain.connect(audio.destination);noise.start();}}catch{}},
  age:()=>age,
  update(dt){if(age<0)return;age+=dt;if(age>6){group.visible=false;light.intensity=0;return;}for(const part of particles){const t=age,fade=part.smoke?Math.min(.65,Math.max(0,t-.7)*.5)*Math.max(0,1-(t-2)/4):Math.max(0,1-t/3.2);part.mesh.material.opacity=fade;part.mesh.position.copy(part.v).multiplyScalar(part.smoke?t*.65:Math.min(t,.9));part.mesh.position.y+=part.smoke?t*t*.6:2;part.mesh.scale.setScalar(part.size*(part.smoke?1+t*.45:1+Math.min(t,1.5)*1.3));}
   light.intensity=650*Math.max(0,1-age/.65);ring.scale.setScalar(1+age*16);ring.material.opacity=Math.max(0,1-age/2);ring.position.y=.2;
   spray.visible=age<2.5;for(let i=0;i<60;i++){const a=i*2.39996,s=4+i%9;p.set(Math.cos(a)*s*age,(10+i%8)*age-7*age*age,Math.sin(a)*s*age);matrix.compose(p,q,scale);spray.setMatrixAt(i,matrix);}spray.instanceMatrix.needsUpdate=true;
  }
 };
}
