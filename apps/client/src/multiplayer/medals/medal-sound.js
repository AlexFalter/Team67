// Original BO3 medal-earned recording; provenance is in public/audio/CREDITS.md.
export function createMedalSound({audioUrl='/audio/bo3-medal-earned.mp3'}={}){
 let context=null,bufferPromise=null,generation=0,destroyed=false,played=0,error=null;
 const voices=new Set();
 const bytes=fetch(audioUrl).then(response=>{
  if(!response.ok)throw new Error(`Medal audio: HTTP ${response.status}`);
  return response.arrayBuffer();
 });
 // Record preload failures even when no medal is earned.
 bytes.catch(cause=>{error=String(cause.message??cause);});
 function prepare(){
  const AudioContext=globalThis.AudioContext??globalThis.webkitAudioContext;
  if(!AudioContext)throw new Error('Web Audio is unavailable');
  context??=new AudioContext();
  bufferPromise??=bytes.then(data=>context.decodeAudioData(data));
  bufferPromise.catch(cause=>{error=String(cause.message??cause);});
  return context;
 }
 function unlock(){
  if(destroyed)return;
  try{prepare().resume().catch(cause=>{error=String(cause.message??cause);});}
  catch(cause){error=String(cause.message??cause);}
 }
 // Resume in a real input event, before the render loop awards a medal.
 globalThis.addEventListener?.('pointerdown',unlock,{capture:true});
 globalThis.addEventListener?.('keydown',unlock,{capture:true});
 function stop(){generation++;for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
 return {
  async play(){
   const requestedGeneration=generation;
   try{
    if(destroyed)return;
    const audio=prepare();
    await audio.resume();
    const buffer=await bufferPromise;
    if(destroyed||requestedGeneration!==generation)return;
    if(audio.state!=='running')throw new Error(`Medal audio context is ${audio.state}`);
    const source=audio.createBufferSource(),gain=audio.createGain();
    source.buffer=buffer;gain.gain.value=.32;
    source.connect(gain);gain.connect(audio.destination);voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};
    source.start();played++;error=null;
   }catch(cause){error=String(cause.message??cause);}
  },
  stop,
  state:()=>({url:audioUrl,context:context?.state??'uninitialized',played,activeVoices:voices.size,error}),
  destroy(){destroyed=true;stop();globalThis.removeEventListener?.('pointerdown',unlock,{capture:true});globalThis.removeEventListener?.('keydown',unlock,{capture:true});context?.close().catch(()=>{});},
 };
}
