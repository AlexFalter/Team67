import {updateDialogueVolume,dialogueVolume} from '../../shared/dialogue/dialogue-distance.js';
import {createFeatureLifecycle} from '../../shared/runtime/feature-lifecycle.js';
// Complete goal sections from the user-provided video; one channel with quiet falloff and gaps.
const clips=['/audio/timgio-goal-1.mp3','/audio/timgio-curacao.mp3','/audio/timgio-goal-2.mp3','/audio/timgio-goal-3.mp3','/audio/timgio-goal-4.mp3','/audio/timgio-goal-5.mp3','/audio/timgio-goal-6.mp3','/audio/timgio-goal-7.mp3'];
export function createFootballVoice({assetUrl=p=>p,settings={voiceVolume:.38,audioNearDistance:3,audioFarDistance:28,celebrationGapSeconds:[7,12]},random=Math.random}={}){
 const life=createFeatureLifecycle(),audio=[...clips,'/audio/timgio-hol-ihn-raus.mp3'].map(p=>new Audio(assetUrl(p)));audio.forEach(a=>{a.preload='auto';a.volume=0;});
 let unlocked=false,index=0,current=null,gap=2,generation=0,played=0,failed=false,suspended=false;
 const nextGap=()=>{const [lo,hi]=settings.celebrationGapSeconds;return lo+random()*(hi-lo);};
 function stop(){generation++;if(current){current.pause();current.currentTime=0;}current=null;}
 function finish(a){if(current!==a)return;stop();gap=nextGap();}
 audio.forEach(a=>life.listen(a,'ended',()=>finish(a)));
 function start(a){stop();current=a;const token=generation;a.currentTime=0;a.play().then(()=>{if(token===generation&&!life.disposed){played++;if(suspended)a.pause();}}).catch(()=>{if(token===generation&&!life.disposed){failed=true;finish(a);}});}
 function unlock(){unlocked=true;}
 life.listen(window,'pointerdown',unlock);life.listen(window,'keydown',unlock);
 life.own(stop);
 return {audio,unlock,
  reply(){if(life.disposed)return;unlocked=true;start(audio[8]);},
  update(dt,listener,speaker,{muted=false,paused=false,talking=false,enabled=true}={}){
   if(life.disposed)return;const options={volume:settings.voiceVolume,near:settings.audioNearDistance,far:settings.audioFarDistance};
   suspended=paused||muted||!enabled||dialogueVolume(listener,speaker,options)<=0;
   for(const a of audio)updateDialogueVolume(a,listener,speaker,{...options,dt,muted:suspended});
   if(suspended){current?.pause();return;}
   if(current){if(current.paused&&!current.ended&&unlocked){const a=current,token=generation;a.play().catch(()=>{if(token===generation){failed=true;finish(a);}});}return;}
   if(talking||!unlocked)return;gap=Math.max(0,gap-Math.max(0,dt));if(gap===0){const a=audio[index];index=(index+1)%clips.length;start(a);}
  },
  reset(){stop();index=0;gap=2;played=0;failed=false;},stop,dispose:()=>life.dispose(),
  state:()=>({index,current:current?audio.indexOf(current):null,gap,played,failed,suspended,volume:current?.volume??0,speaking:!!current&&!current.paused,clipCount:clips.length}),
 };
}
