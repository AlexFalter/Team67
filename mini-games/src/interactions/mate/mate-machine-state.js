// Pure rules. A multiplayer host supplies the one working flavor; each player
// keeps their own attempts/payment/collection state unless the host chooses otherwise.
export function createMateMachineState({flavorCount=4,loadingSeconds=1.4,retrySeconds=[1,2],dropSeconds=.95,random=()=>Math.random(),workingFlavor,snapshot}={}){
 if(!Number.isInteger(flavorCount)||flavorCount<1||!Number.isFinite(loadingSeconds)||loadingSeconds<0||!Number.isFinite(dropSeconds)||dropSeconds<0||!Array.isArray(retrySeconds)||!retrySeconds.length||retrySeconds.some(n=>!Number.isFinite(n)||n<0))throw Error('Invalid Mate configuration');
 let state;
 function reset(options={}){const winner=options.workingFlavor??workingFlavor??Math.floor(random()*flavorCount);if(!Number.isInteger(winner)||winner<0||winner>=flavorCount)throw Error('Invalid working flavor');state={version:1,workingFlavor:winner,selected:0,tried:[],attempts:0,payments:0,cooldown:0,won:false,phase:'idle',loading:0,dropAge:0};}
 function restore(value){
  const phases=['idle','payment','loading','failure','dropping','collect','success'];
  if(value?.version!==1||!Number.isInteger(value.workingFlavor)||value.workingFlavor<0||value.workingFlavor>=flavorCount||!Number.isInteger(value.selected)||value.selected<0||value.selected>=flavorCount||!Array.isArray(value.tried)||new Set(value.tried).size!==value.tried.length||value.tried.some(i=>!Number.isInteger(i)||i<0||i>=flavorCount)||!Number.isInteger(value.attempts)||value.attempts!==value.tried.length||value.payments!==value.attempts||typeof value.won!=='boolean'||!phases.includes(value.phase)||['cooldown','loading','dropAge'].some(k=>!Number.isFinite(value[k])||value[k]<0)||value.won!==(value.phase==='success')||['dropping','collect','success'].includes(value.phase)&&value.selected!==value.workingFlavor)throw Error('Invalid Mate snapshot');
  const paid=value.tried.includes(value.selected);
  if(['loading','failure','dropping','collect','success'].includes(value.phase)&&!paid||value.phase==='payment'&&paid||value.phase==='failure'&&value.selected===value.workingFlavor||value.phase!=='loading'&&value.loading!==0||value.loading>loadingSeconds||value.phase==='collect'&&value.dropAge<dropSeconds)throw Error('Inconsistent Mate snapshot');
  state=Object.fromEntries(['version','workingFlavor','selected','tried','attempts','payments','cooldown','won','phase','loading','dropAge'].map(k=>[k,k==='tried'?[...value.tried]:value[k]]));
 }
 if(snapshot)restore(snapshot);else reset();
 return {reset,restore,loadingSeconds,snapshot:()=>({...state,tried:[...state.tried]}),
  select(index){if(!Number.isInteger(index)||index<0||index>=flavorCount||['payment','loading','dropping','collect','success'].includes(state.phase)||state.cooldown>0||state.tried.includes(index))return false;state.selected=index;state.phase='payment';return true;},
  cancelPayment(){if(state.phase==='payment')state.phase='idle';},
  pay(){if(state.phase!=='payment')return false;state.tried.push(state.selected);state.attempts++;state.payments++;state.phase='loading';state.loading=loadingSeconds;return true;},
  collect(){if(state.phase!=='collect'||state.won)return false;state.won=true;state.phase='success';return true;},
  tick(dt){
   if(!Number.isFinite(dt)||dt<0)return;
   let elapsed=dt;
   if(state.phase==='loading'){
    const consumed=Math.min(elapsed,state.loading);state.loading=Math.max(0,state.loading-consumed);elapsed-=consumed;
    if(state.loading>0)return;
    if(state.selected===state.workingFlavor){state.phase='dropping';state.dropAge=0;}
    else{state.phase='failure';state.cooldown=retrySeconds[(state.attempts+1)%retrySeconds.length];}
   }
   state.cooldown=Math.max(0,state.cooldown-elapsed);
   if(state.phase==='dropping'){state.dropAge+=elapsed;if(state.dropAge>=dropSeconds)state.phase='collect';}
  }
 };
}
