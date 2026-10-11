// Browser policy can reject voices started by proximity or a server reply.
// Keep that request alive until the next real input, instead of losing the line.
const blocked=new Set();
let listening=false;
const events=['pointerdown','keydown','click'];
function retry(event){if(event.isTrusted)for(const request of [...blocked])request.attempt();}
function syncListeners(){
 const needed=blocked.size>0;if(needed===listening)return;listening=needed;
 for(const event of events)document[needed?'addEventListener':'removeEventListener'](event,retry,true);
}
export function createDialogueAudio(src){
 const base=import.meta.env?.BASE_URL??'/';
 const audio=new Audio(src.startsWith('/')?base+src.slice(1):src);
 audio.preload='auto';
 const nativePlay=audio.play.bind(audio),nativePause=audio.pause.bind(audio);
 let current=null,lastError=null;
 function finish(request,error){
  if(current!==request)return;current=null;blocked.delete(request);syncListeners();
  if(error){lastError=error.name;request.reject(error);}else{lastError=null;request.resolve();}
 }
 audio.play=()=>{
  if(current)return current.promise;
  const request={busy:false,blocked:false};
  request.promise=new Promise((resolve,reject)=>{request.resolve=resolve;request.reject=reject;});
  request.attempt=()=>{
   if(current!==request||request.busy)return;request.busy=true;
   nativePlay().then(()=>finish(request)).catch(error=>{
    if(current!==request)return;request.busy=false;
    if(error.name==='NotAllowedError'){request.blocked=true;blocked.add(request);syncListeners();}
    else finish(request,error);
   });
  };
  current=request;request.attempt();return request.promise;
 };
 audio.pause=()=>{
  if(current)finish(current,new DOMException('Dialogue playback cancelled','AbortError'));
  nativePause();
 };
 audio.dialoguePlaybackState=()=>({pending:!!current,blocked:!!current?.blocked,error:lastError});
 return audio;
}
