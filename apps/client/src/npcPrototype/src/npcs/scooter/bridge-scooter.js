import {createLimeModel} from '../../vehicles/scooter/lime-model.js';
import {createDialogueAudio} from '../../shared/dialogue/dialogue-audio.js';
import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {featurePlacement,placementPoint,navigatePlacement} from '../../world/placements/feature-placement.js';
import {gameConfig} from '../../config/game-config.js';
import {createVehiclePassengers} from '../../vehicles/passengers/vehicle-passengers.js';
import {updateDialogueVolume} from '../../shared/dialogue/dialogue-distance.js';
import {styleEncounterLine} from '../../shared/dialogue/encounter-ui.js';
import * as THREE from 'three';
import dialogueCues from '../../../assets/audio/frankfurt-dialogue-cues.json';
import {createStudent} from '../../player/student-model.js';
import {createMapNavigation} from '../../world/core/map-navigation.js';

export function createBridgeScooter(scene,world,{horns=gameConfig.npcs.scooter.horns,knifeModel,onCollect=()=>{},placement,parked=false,shortArrival=false,uiRoot=document.body}={}){
 placement=featurePlacement(world,'scooterEncounter',placement);
 const passengers=createVehiclePassengers('gangScooter');for(let i=0;i<3;i++)passengers.board(`rider-${i}`);
 const group=new THREE.Group();group.name='Three riders on a Lime scooter · Bahnhofbrücke';scene.add(group);
 function box(parent,x,y,z,w,h,d,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 function rod(parent,a,b,r,material){const delta=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),material);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());parent.add(mesh);return mesh;}
 function label(text,w,h){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#42d67e';ctx.fillRect(0,0,512,128);ctx.fillStyle='#16372b';ctx.font='bold 74px Arial';ctx.textAlign='center';ctx.fillText(text,256,88);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));}
 const scooter=createLimeModel();group.add(scooter);const wheels=scooter.userData.wheels;
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#baaa82';ctx.fillRect(0,0,256,256);ctx.fillStyle='#655a43';ctx.font='bold 25px Georgia';ctx.textAlign='center';for(let y=20;y<256;y+=44)for(let x=(Math.round(y/44)%2)*22;x<280;x+=44){ctx.fillText('GG',x,y);}
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,2);const outfit=new THREE.MeshStandardMaterial({map,roughness:.85}),gold=new THREE.MeshStandardMaterial({color:'#d4b360',metalness:.65,roughness:.35}),stripe=new THREE.MeshStandardMaterial({color:'#b93035'}),stripeGreen=new THREE.MeshStandardMaterial({color:'#234e38'});
 const riders=[];
 for(let i=0;i<3;i++){
  const rig=createStudent(),actor=rig.player;actor.name=['Front rider · handlebars','Rear rider · carrying friend','Piggyback rider'][i];actor.scale.setScalar(i===2?.82:.9);
  actor.traverse(o=>{if(!o.isMesh)return;const c=o.material.color?.getHexString();if(['cf633d','a9432d'].includes(c)){o.visible=false;return;}if(['f4e7cc','284b60','f0eee5'].includes(c))o.material=outfit;});
  const chain=new THREE.Mesh(new THREE.TorusGeometry(.14,.014,6,20),gold);chain.position.set(0,1.37,-.03);chain.rotation.x=Math.PI/2;actor.add(chain);
  for(const side of [-1,1]){box(actor,side*.246,1.13,0,.012,.50,.17,stripeGreen);box(actor,side*.254,1.13,0,.014,.50,.06,stripe);box(rig.limbs[side<0?1:3],side*.098,-.18,0,.012,.34,.15,stripeGreen);box(rig.limbs[side<0?1:3],side*.105,-.18,0,.014,.34,.045,stripe);}
  const chest=label('GUCCI',.24,.065);chest.material=chest.material.clone();const image=chest.material.map.image,cc=image.getContext('2d');cc.fillStyle='#c4b28b';cc.fillRect(0,0,512,128);cc.fillStyle='#3a4934';cc.fillText('GUCCI',256,88);chest.material.map.needsUpdate=true;chest.position.set(0,1.20,-.16);chest.rotation.y=Math.PI;actor.add(chest);
  const hornGroup=new THREE.Group();hornGroup.name='Optional tall horns';hornGroup.visible=horns;for(const side of [-1,1]){const horn=new THREE.Mesh(new THREE.ConeGeometry(.065,.65,8),gold);horn.position.set(side*.15,2.0,0);horn.rotation.z=-side*.2;hornGroup.add(horn);}actor.add(hornGroup);
  riders.push(rig);
 }
 riders[0].player.position.set(0,.34,-.43);group.add(riders[0].player);riders[1].player.position.set(0,.34,.42);group.add(riders[1].player);
 // The passenger is attached to the carrier's back, with thighs around the waist.
 riders[2].player.position.set(0,.77,.25);riders[1].player.add(riders[2].player);
 for(let i=0;i<2;i++){riders[2].limbs[i*2+1].rotation.x=1.2;riders[2].limbs[i*2+1].rotation.z=i?-.38:.38;riders[2].knees[i].rotation.x=-1.3;riders[2].limbs[i*2].rotation.x=1.25;riders[2].elbows[i].rotation.x=.5;}
 for(let i=0;i<2;i++){riders[0].limbs[i*2].rotation.x=1.1;riders[0].elbows[i].rotation.x=.2;riders[1].limbs[i*2].rotation.x=-.55;riders[1].elbows[i].rotation.x=1.1;}
 // Enter from the void north of the map, then follow a clear street route to the bridge.
 const bounds=world.data.playableBounds,bridge=placement.ridePoints;
 const safe=(x,z)=>!world.isWater(x,z)&&!world.bodyBlocked(x,world.height(x,z)+.15,z,.65,3);
 // Multiplayer uses only the parked bridge pose, so it needs no map-edge arrival.
 const nav=parked||shortArrival?null:createMapNavigation({data:world.data,height:world.height,blocked:(x,z)=>!safe(x,z)},{penetration:()=>0},{step:2});
 let entry=parked||shortArrival?[...bridge[0]]:placement.entrance?placementPoint(placement.entrance,'scooter entrance'):null;
 if(entry&&!safe(...entry))throw Error('Scooter entrance is blocked');
 for(let offset=0;offset<300&&!entry;offset+=2)for(const side of [-1,1]){
  const x=placement.entranceX+side*offset,z=bounds.maxZ-2;
  if(Array.from({length:9},(_,i)=>safe(x,z+i*.25)).every(Boolean)){entry=[x,z];break;}
 }
 if(!entry)throw Error('No safe scooter entrance from the void');
 const approach=parked||shortArrival?[]:navigatePlacement(nav,entry,placement.approachWaypoints,bridge[0]);
 if(approach.length>1&&nav.line(new THREE.Vector3(entry[0],world.height(...entry),entry[1]),new THREE.Vector3(approach[1][0],world.height(...approach[1]),approach[1][1])))approach.shift();
 if(approach.length>1&&nav.line(new THREE.Vector3(approach.at(-2)[0],world.height(...approach.at(-2)),approach.at(-2)[1]),new THREE.Vector3(bridge[0][0],world.height(...bridge[0]),bridge[0][1])))approach.pop();
 const route=parked||shortArrival?bridge:[[entry[0],bounds.maxZ+30],entry,...approach,bridge[0],bridge[1]];
 const nodes=route.map(([x,z],i)=>new THREE.Vector3(x,i===0?world.height(...entry):world.height(x,z),z));
 const spans=[];let length=0;for(let i=1;i<nodes.length;i++){const span=nodes[i].clone().sub(nodes[i-1]);const size=Math.hypot(span.x,span.z);if(size<.001)continue;spans.push({a:nodes[i-1],b:nodes[i],start:length,size});length+=size;}
 const bridgeStart=length-Math.hypot(bridge[1][0]-bridge[0][0],bridge[1][1]-bridge[0][1]);
 function frame(distance){const span=spans.find(s=>distance<=s.start+s.size)??spans.at(-1),t=THREE.MathUtils.clamp((distance-span.start)/span.size,0,1),p=span.a.clone().lerp(span.b,t);if(p.z<=bounds.maxZ)p.y=world.height(p.x,p.z);return {p,heading:Math.atan2(-(span.b.x-span.a.x),-(span.b.z-span.a.z))};}
 function point(distance){return frame(distance).p;}
 for(let d=0;d<=length;d+=.25){const p=point(d);if(p.z<=bounds.maxZ&&!safe(p.x,p.z))throw Error('Scooter arrival route is not clear');}
 const audio=createDialogueAudio('/audio/frankfurt-dialogue.mp3?v=2'),clips=[audio];for(const audio of clips){audio.preload='auto';audio.volume=gameConfig.npcs.scooter.volume;}
 const caption=document.createElement('aside');caption.id='bridge-scooter-caption';caption.hidden=true;caption.setAttribute('aria-live','polite');uiRoot.append(caption);styleEncounterLine(caption);caption.classList.add('encounter-subtitle');
 let distance=0,age=0,used=false,moving=false,playing=false,played=false,failed=false,line=-1,generation=0,cooldown=0,speed=0,heading=0,stopDistance=length,phase='waiting',diverted=false,lastScan=-1;
 let conversation=false,completed=false,greeted=false,conversationAge=0,offerAge=0,shortBraking=false,pendingTalk=false;
 const frozen=new THREE.Vector3();
 const gift=knifeModel?.clone(true)??new THREE.Group();gift.name='Offered Karambit Doppler';gift.visible=false;gift.position.set(0,-.225,-.01);gift.rotation.set(Math.PI/2,0,.3);gift.scale.setScalar(.65);gift.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=o.material.clone();}o.layers.set(0);o.renderOrder=0;});riders[0].elbows[0].add(gift);
 const collect=document.createElement('button');collect.id='scooter-collect-knife';collect.type='button';collect.hidden=true;collect.textContent='E · COLLECT KARAMBIT';collect.style.cssText='position:fixed;z-index:100;transform:translate(-50%,-50%);padding:16px;border:2px solid #d690ff;border-radius:12px;background:#20112bcc;color:white;cursor:pointer';uiRoot.append(collect);
 function offer(){playing=false;audio.pause();caption.hidden=false;caption.textContent=`FRONT RIDER: ${gameConfig.npcs.scooter.giftLine}`;phase='handover';offerAge=0;gift.visible=true;}
 function syncCaption(){if(!playing)return;if(!conversation&&audio.currentTime>=dialogueCues[0].end){audio.pause();playing=false;caption.hidden=true;return;}const index=conversation?dialogueCues.reduce((line,cue,i)=>audio.currentTime>=cue.start?i:line,1):0;line=index;caption.textContent=conversation?`${dialogueCues[index].speaker}: “${dialogueCues[index].caption}”`:`FRONT RIDER: “${gameConfig.npcs.scooter.greeting}”`;caption.hidden=false;}
 function play(){line=0;playing=true;failed=false;const token=++generation;audio.currentTime=0;caption.hidden=false;syncCaption();audio.play().then(()=>{if(token===generation){played=true;syncCaption();}}).catch(()=>{if(token!==generation)return;failed=true;playing=false;if(!conversation)caption.hidden=true;});}
 audio.addEventListener('timeupdate',syncCaption);
 audio.onended=()=>{if(conversation&&phase==='dialogue')offer();else{playing=false;caption.hidden=true;}};
 function collectKnife(){if(!conversation||phase!=='handover'||offerAge<gameConfig.npcs.scooter.handoverSeconds)return false;completed=true;conversation=false;phase='parked';gift.visible=false;collect.hidden=true;caption.hidden=true;onCollect();return true;}
 collect.onclick=collectKnife;
 function pose(dt=0){const f=frame(distance);group.position.copy(f.p);heading=dt?heading+Math.atan2(Math.sin(f.heading-heading),Math.cos(f.heading-heading))*(1-Math.exp(-10*dt)):f.heading;group.rotation.y=heading;group.updateMatrixWorld(true);}
 if(parked){used=true;distance=length;phase='parked';}pose();
 return {dispose(){this.reset();audio.onended=null;audio.removeEventListener('timeupdate',syncCaption);caption.remove();collect.remove();disposeOwnedObject(group);},park(){used=true;moving=false;distance=stopDistance=length;phase='parked';pose();},passengers,group,riders,audio,clips,dialogueCues,point,active:()=>conversation,
  keydown(e){if(e.code!=='KeyE'||e.repeat||e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return false;if(!collectKnife())return false;e.preventDefault();return true;},
  updateConversation(dt,position,camera){if(!conversation)return;position.copy(frozen);conversationAge+=dt;
   if(phase==='dialogue'){syncCaption();if((failed||audio.error||conversationAge>12)&&conversationAge>=dialogueCues.at(-1).end)offer();}
   if(phase==='handover'){offerAge+=dt;const reach=THREE.MathUtils.smoothstep(offerAge,0,gameConfig.npcs.scooter.handoverSeconds);riders[0].limbs[0].rotation.x=1.1+reach*.35;riders[0].limbs[0].rotation.z=-reach*.15;riders[0].elbows[0].rotation.x=.2+reach*.15;collect.hidden=offerAge<gameConfig.npcs.scooter.handoverSeconds;}
   group.updateMatrixWorld(true);const actor=riders[0].player,target=actor.localToWorld(new THREE.Vector3(0,1.15,-.15)),eye=actor.localToWorld(new THREE.Vector3(.6,1.55,-2.25));camera.up.set(0,1,0);camera.position.copy(eye);camera.lookAt(target);camera.updateMatrixWorld(true);
   if(!collect.hidden){const p=gift.getWorldPosition(new THREE.Vector3()).project(camera);collect.style.left=`${(p.x+1)*innerWidth/2}px`;collect.style.top=`${(1-p.y)*innerHeight/2}px`;}
  },
  near(position){return Math.hypot(position.x-group.position.x,position.z-group.position.z)<gameConfig.npcs.scooter.interactionDistance&&Math.abs(position.y-group.position.y)<3;},
  canTalk(position){return !conversation&&!moving&&!completed&&(!shortArrival||phase==='parked')&&this.near(position);},
  interact(position){if(conversation)return true;if(shortArrival&&moving&&!completed&&this.near(position)){pendingTalk=true;if(!shortBraking){shortBraking=true;stopDistance=Math.min(length,distance+speed*speed/8);}return true;}if(!this.canTalk(position))return false;audio.pause();generation++;conversation=true;conversationAge=0;frozen.copy(position);phase='dialogue';play();return true;},
  blocked(x,z,y){if(Math.abs(y-group.position.y)>2)return false;const dx=x-group.position.x,dz=z-group.position.z,lx=Math.cos(heading)*dx-Math.sin(heading)*dz,lz=Math.sin(heading)*dx+Math.cos(heading)*dz;return Math.abs(lx)<.68&&Math.abs(lz)<1.42;},
  update(dt,position,enabled=true,{elapsed}={}){
   updateDialogueVolume(audio,position,group.position,{dt,volume:gameConfig.npcs.scooter.volume,near:gameConfig.npcs.scooter.audioNearDistance,far:gameConfig.npcs.scooter.audioFarDistance});
   if(conversation||!enabled||!Number.isFinite(dt)||dt<=0)return;
   if(shortArrival){
    const waiting=Number.isFinite(elapsed)&&elapsed<0,duration=placement.arrivalSeconds??8,time=Number.isFinite(elapsed)?Math.max(0,elapsed):age+dt;
    if(!waiting&&!shortBraking&&phase!=='parked'){
     let closest=Infinity,projected=length;
     for(let d=distance;d<=length;d+=.25){const p=point(d),gap=Math.hypot(p.x-position.x,p.z-position.z);if(gap<closest&&Math.abs(p.y-position.y)<3){closest=gap;projected=d;}}
     if(closest<3){shortBraking=true;stopDistance=Math.max(distance,projected-Math.sqrt(Math.max(0,Math.min(2.6,gameConfig.npcs.scooter.interactionDistance-.3)**2-closest**2)));}
    }
    let next=distance;
    if(shortBraking){
     const left=Math.max(0,stopDistance-distance);
     speed=Math.min(speed+6*dt,Math.sqrt(8*left));
     next=Math.min(stopDistance,distance+Math.max(.15,speed)*dt);
     moving=stopDistance-next>.01;phase=moving?'braking':'parked';
     if(!moving){next=stopDistance;speed=0;}
    }else if(phase!=='parked'){
     next=length*THREE.MathUtils.smoothstep(time,0,duration);stopDistance=length;
     moving=!waiting&&time<duration;phase=waiting?'waiting':moving?'approaching':'parked';
     speed=moving?length*6*(time/duration)*(1-time/duration)/duration:0;
    }
    used=true;const travel=next-distance;distance=next;
    wheels.forEach(w=>w.rotation.x-=travel/.21);pose();
   }
   for(let remaining=Math.min(dt,10);remaining>0;){
    const step=Math.min(.05,remaining);remaining-=step;age+=step;cooldown=Math.max(0,cooldown-step);
    if(!used){used=true;moving=true;phase='arriving';}
    if(moving&&!shortArrival){
     // Once on the bridge, use a clear short spur if the player is beside the lane.
     if(!diverted&&stopDistance===length&&distance>=bridgeStart&&Math.hypot(position.x-bridge[0][0],position.z-bridge[0][1])<40&&Math.abs(position.y-group.position.y)<3){
      const from=point(distance),toward=from.clone().sub(position);toward.y=0;
      if(toward.length()>4){
       const target=position.clone().addScaledVector(toward.normalize(),3.2);target.y=world.height(target.x,target.z);
       if(safe(target.x,target.z)&&nav.line(from,target)){
        const active=spans.find(s=>distance<s.start+s.size)??spans.at(-1);
        spans.splice(spans.indexOf(active)+1);active.b=from.clone();active.size=distance-active.start;
        const size=Math.hypot(target.x-from.x,target.z-from.z);spans.push({a:from,b:target,start:distance,size});
        length=stopDistance=distance+size;diverted=true;
       }
      }
     }
     // Lock a braking point on the clear route, a few metres short of the player.
     if(stopDistance===length&&distance>bridgeStart-45&&age-lastScan>=.2){
      lastScan=age;
      let closest=Infinity,projected=length;
      for(let d=Math.max(distance,bridgeStart-30);d<=length;d+=.5){const p=point(d),gap=Math.hypot(p.x-position.x,p.z-position.z);if(gap<closest&&Math.abs(p.y-position.y)<3){closest=gap;projected=d;}}
      if(closest<3)stopDistance=Math.max(distance,projected-Math.sqrt(Math.max(0,3.2**2-closest**2)));
     }
     const left=stopDistance-distance,cruise=5+THREE.MathUtils.clamp((bridgeStart-40-distance)*.4,0,13);
     speed=Math.min(cruise,speed+6*step,Math.sqrt(Math.max(0,2*4*left)));
     const next=Math.min(stopDistance,distance+speed*step),p=point(next),gap=Math.hypot(p.x-position.x,p.z-position.z);
     if(gap<2.6&&Math.abs(p.y-position.y)<3){stopDistance=distance;speed=0;}
     else{const travel=next-distance;distance=next;wheels.forEach(w=>w.rotation.x-=travel/.21);pose(step);}
     phase=distance<bridgeStart-30?'arriving':'approaching';
     if(stopDistance-distance<.01){distance=stopDistance;speed=0;moving=false;phase='parked';pose();}
    }
    if(!conversation&&!moving&&phase==='parked'&&pendingTalk){pendingTalk=false;if(this.near(position)){greeted=true;this.interact(position);}}
    if(!conversation&&!moving&&(!shortArrival||phase==='parked')&&!greeted&&this.near(position)){greeted=true;play();}if(!conversation)syncCaption();
    const sway=Math.sin(age*5)*Math.min(1,speed/5);
    riders[0].player.rotation.x=.06*Math.min(1,speed/5);
    riders[1].player.rotation.z=sway*.015;riders[2].player.rotation.z=sway*.035;
   }
  },
  setHorns(enabled){riders.forEach(r=>r.player.getObjectByName('Optional tall horns').visible=enabled);},
  reset(){conversation=completed=greeted=shortBraking=pendingTalk=false;conversationAge=offerAge=0;gift.visible=false;collect.hidden=true;riders[0].limbs[0].rotation.z=0;riders[0].limbs[0].rotation.x=1.1;generation++;clips.forEach(a=>{a.pause();a.currentTime=0;});caption.hidden=true;distance=age=cooldown=speed=0;spans.length=0;length=0;for(let i=1;i<nodes.length;i++){const size=Math.hypot(nodes[i].x-nodes[i-1].x,nodes[i].z-nodes[i-1].z);if(size<.001)continue;spans.push({a:nodes[i-1],b:nodes[i],start:length,size});length+=size;}stopDistance=length;phase='waiting';diverted=false;lastScan=-1;used=moving=playing=played=failed=false;line=-1;wheels.forEach(w=>w.rotation.x=0);riders.forEach(r=>r.player.rotation.set(0,0,0));pose();if(parked)this.park();},
  state:()=>({conversation,completed,greeted,offerAge,giftVisible:gift.visible,collectVisible:!collect.hidden,passengers:passengers.state(),used,moving,playing,played,failed,line,distance,length,speed,phase,diverted,stopDistance,bridgeStart,entry,voidStart:nodes[0].toArray(),route,position:group.position.toArray(),riders:3,piggyback:riders[2].player.parent===riders[1].player,volume:audio.volume,audioTime:audio.currentTime,audioPaused:audio.paused,shortArrival,shortBraking,pendingTalk,horns:riders[0].player.getObjectByName('Optional tall horns').visible})
 };
}
