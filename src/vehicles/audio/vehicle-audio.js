// Recorded vehicle beds. Samples are decoded once and loop without MP3 padding.
const SAMPLES={bus:'bus-engine',car:'car-engine',tram:'rail-running',polybahn:'rail-running'};
export function createVehicleAudio(){
 let context,master,noiseBuffer,unlocked=false,enabled=true,paused=false,events=0,stepAge=0,stepSide=0,contact=false;
 const effectCounts={};
 const voices=new Map(),previous=new Map(),buffers=new Map(),loads=new Map(),failures=new Set(),shots=new Set(),cooldowns=new Map();
 function load(name){
  if(!loads.has(name))loads.set(name,fetch(`/audio/${name}.mp3`).then(r=>{if(!r.ok)throw Error(r.status);return r.arrayBuffer();}).then(a=>context.decodeAudioData(a)).then(b=>buffers.set(name,b)).catch(()=>failures.add(name)));
 }
 function unlock(){
  if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.65;master.connect(context.destination);
   noiseBuffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate);const a=noiseBuffer.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
   for(const name of new Set([...Object.values(SAMPLES),'vehicle-door','footstep-left','footstep-right','collision-thud']))load(name);
  }
  context.resume().catch(()=>{});unlocked=true;
 }
 function voice(key){
  if(!voices.has(key)){const gain=context.createGain();gain.gain.value=0;gain.connect(master);voices.set(key,{gain,source:null,target:0,starts:0});}
  return voices.get(key);
 }
 function stop(v,immediate=false){
  v.target=0;const now=context.currentTime;v.gain.gain.cancelScheduledValues(now);v.gain.gain.setTargetAtTime(0,now,.035);
  if(v.source){const source=v.source;v.source=null;source.stop(immediate?now:now+.18);source.onended=()=>source.disconnect();}
 }
 function recordedEffect(name,level,{cooldown=.6,rate=1,kind=name}={}){
  const buffer=buffers.get(name);if(!buffer)return;
  const now=context.currentTime;if(now-(cooldowns.get(name)??-Infinity)<cooldown)return;cooldowns.set(name,now);
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=level;source.connect(gain);gain.connect(master);shots.add(source);source.onended=()=>{shots.delete(source);source.disconnect();gain.disconnect();};source.start();events++;effectCounts[kind]=(effectCounts[kind]||0)+1;
 }
 function effect(kind,intensity=1){
  if(!context||!enabled||paused||document.hidden)return;
  if(kind==='canDrop'){
   events++;effectCounts[kind]=(effectCounts[kind]||0)+1;
   const now=context.currentTime;
   // Short aluminium clack with a quieter second contact as the can settles.
   for(const [delay,level]of [[0,.13],[.075,.045]]){
    const g=context.createGain();g.connect(master);g.gain.setValueAtTime(level,now+delay);g.gain.exponentialRampToValueAtTime(.0001,now+delay+.18);
    const n=context.createBufferSource(),f=context.createBiquadFilter();n.buffer=noiseBuffer;f.type='highpass';f.frequency.value=900;n.connect(f);f.connect(g);shots.add(n);n.onended=()=>{shots.delete(n);n.disconnect();f.disconnect();};n.start(now+delay);n.stop(now+delay+.025);
    for(const frequency of [730,1430,2870]){const o=context.createOscillator();o.type='triangle';o.frequency.value=frequency;o.connect(g);shots.add(o);o.onended=()=>{shots.delete(o);o.disconnect();};o.start(now+delay);o.stop(now+delay+.19);}
    setTimeout(()=>g.disconnect(),350);
   }
   return;
  }
  if(kind==='step'){recordedEffect(stepSide++%2?'footstep-right':'footstep-left',intensity,{cooldown:.08,kind:'step'});return;}
  if(['collision','land'].includes(kind)){recordedEffect('collision-thud',Math.min(.65,intensity),{cooldown:.3,kind});return;}
  if(kind==='jump'){recordedEffect('footstep-left',.12,{cooldown:.15,kind});return;}
  // No artificial revs, descending brake whistles or repeated arrival tones.
  if(kind==='door'){recordedEffect('vehicle-door',.18);return;}
  if(['start','brake','bell'].includes(kind))return;
  events++;effectCounts[kind]=(effectCounts[kind]||0)+1;const now=context.currentTime,g=context.createGain(),duration=kind==='step'?.12:kind==='shutter'?.09:.45;g.connect(master);g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(kind==='step'?.025:.09,now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+duration);
  const n=context.createBufferSource(),f=context.createBiquadFilter();n.buffer=noiseBuffer;f.type='bandpass';f.frequency.value=kind==='crash'?180:kind==='splash'?1200:kind==='step'?250:2200;f.Q.value=1;n.connect(f);f.connect(g);shots.add(n);n.onended=()=>{shots.delete(n);n.disconnect();f.disconnect();g.disconnect();};n.start();n.stop(now+duration+.02);
 }
 function update(dt,states,listener,options={}){
  if(!context)return;paused=!!options.paused||document.hidden;
  if(paused)for(const shot of shots){try{shot.stop();}catch{}}
  const now=context.currentTime;
  // Missing states must not leave an old loop running.
  for(const [key,v] of voices)if(!(key in states))stop(v);
  for(const [key,s] of Object.entries(states)){
   const v=voice(key),old=previous.get(key),speed=Math.abs(s.speed||0),distance=s.position?Math.hypot(listener.x-s.position.x,listener.z-s.position.z):0;
   const proximity=s.aboard?1:Math.max(0,1-distance/30)**2;
   const audible=enabled&&!paused&&s.active&&!s.crashed;
   const motor=['bus','car'].includes(key),level=motor?(speed>.1?.23:.12):speed>.1?.17:0;
   const target=SAMPLES[key]&&audible?proximity*(options.duck?.3:1)*level:0;
   if(target>.001){
    v.target=target;
    if(!v.source&&buffers.has(SAMPLES[key])){const source=context.createBufferSource();source.buffer=buffers.get(SAMPLES[key]);source.loop=true;source.connect(v.gain);v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(0,now);source.start();v.source=source;v.starts++;}
    v.gain.gain.setTargetAtTime(target,now,.15);
   }else stop(v);
   // Do not replay transitions accumulated while paused or muted.
   if(audible&&proximity>.1&&old&&old.audible&&s.door!==undefined&&s.door!==old.door)recordedEffect('vehicle-door',.18*proximity*(options.duck?.3:1));
   if(s.crashed&&!old?.crashed&&enabled&&!paused&&proximity>.1)effect('crash');
   previous.set(key,{...s,audible});
  }
 }
 function reset(){previous.clear();stepAge=0;stepSide=0;contact=false;cooldowns.clear();if(context){for(const v of voices.values())stop(v,true);for(const s of shots){try{s.stop();}catch{}}shots.clear();}}
 return {unlock,update,effect,reset,footsteps(dt,speed,walking){if(!walking||Math.abs(speed)<.5||!enabled||paused){stepAge=0;return;}const pace=Math.abs(speed),stride=pace>8?3:2.3;stepAge+=Math.max(0,dt)*pace;if(stepAge>=stride){stepAge%=stride;effect('step',pace>8?.42:.30);}},collision(touching,speed){if(touching&&!contact&&speed>1.5)effect('collision',.2+Math.min(speed/35,.4));contact=!!touching;},landing(speed){if(speed>3){stepAge=0;effect('land',.2+Math.min(speed/30,.35));}},setEnabled(value){enabled=!!value;if(!enabled)reset();},state:()=>({unlocked,enabled,events,effectCounts:{...effectCounts},context:context?.state??'locked',loaded:[...buffers.keys()],failures:[...failures],oneShots:shots.size,voices:[...voices.entries()].map(([key,v])=>({key,volume:v.gain.gain.value,target:v.target,playing:!!v.source,starts:v.starts,sample:SAMPLES[key]??null,rate:v.source?.playbackRate.value??1}))})};
}
