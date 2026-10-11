// These UI sounds are 2D: walking away from an NPC never lowers their volume.
export function createPhoneSounds({baseUrl=import.meta.env.BASE_URL,volume=.9}={}){
 const files={notification:'gta-phone-notification.mp3',open:'gta-phone-open.wav',select:'gta-phone-select.wav',back:'gta-phone-back.wav',close:'gta-phone-close.wav'};
 let context=null,destroyed=false,generation=0,error=null;
 const buffers=new Map(),voices=new Set(),played={notification:0,open:0,select:0,back:0,close:0};
 const bytes=new Map(Object.entries(files).map(([kind,file])=>{
  const promise=fetch(`${baseUrl}audio/${file}`).then(response=>{if(!response.ok)throw Error(`Phone ${kind} audio: HTTP ${response.status}`);return response.arrayBuffer();});
  promise.catch(cause=>{error=String(cause.message??cause);});return [kind,promise];
 }));
 function prepare(){
  const AudioContext=globalThis.AudioContext??globalThis.webkitAudioContext;
  if(!AudioContext)throw Error('Web Audio is unavailable');
  context??=new AudioContext();
  for(const [kind,data] of bytes)if(!buffers.has(kind)){
   const promise=data.then(value=>context.decodeAudioData(value));buffers.set(kind,promise);
   promise.catch(cause=>{error=String(cause.message??cause);});
  }
  return context;
 }
 function unlock(){if(destroyed)return;try{void prepare().resume().catch(cause=>{error=String(cause.message??cause);});}catch(cause){error=String(cause.message??cause);}}
 // Async server notifications arrive outside a trusted browser input event.
 // Unlock beforehand so those alerts can use an already-running context.
 globalThis.addEventListener('pointerdown',unlock,{capture:true});
 globalThis.addEventListener('keydown',unlock,{capture:true});
 function stop(){generation++;for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
 return {
  unlock,
  async play(kind='notification'){
   if(destroyed||!files[kind])return false;
   const requestedGeneration=generation;
   try{
    const audio=prepare();await audio.resume();const buffer=await buffers.get(kind);
    if(destroyed||generation!==requestedGeneration)return false;
    if(audio.state!=='running')throw Error(`Phone audio context is ${audio.state}`);
    const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;gain.gain.value=volume;
    source.connect(gain);gain.connect(audio.destination);voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};
    source.start();played[kind]++;error=null;return true;
   }catch(cause){error=String(cause.message??cause);return false;}
  },
  stop,
  state:()=>({context:context?.state??'uninitialized',played:{...played},activeVoices:voices.size,error}),
  dispose(){destroyed=true;stop();globalThis.removeEventListener('pointerdown',unlock,{capture:true});globalThis.removeEventListener('keydown',unlock,{capture:true});void context?.close().catch(()=>{});},
 };
}
