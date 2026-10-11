import {gameConfig} from '../../config/game-config.js';
// Event clock kept separate from UI so opening a phone cannot pause a deadline.
export function createMoodleEvent({random=Math.random,onStart=()=>{},onResolve=()=>{}}={}){
 let wait=0,remaining=0,active=false,sequence=0;
 const schedule=()=>{wait=gameConfig.moodle.intervalSeconds[0]+random()*(gameConfig.moodle.intervalSeconds[1]-gameConfig.moodle.intervalSeconds[0]);};schedule();
 function resolve(passed){if(!active)return false;active=false;remaining=0;onResolve(passed);schedule();return true;}
 return {
  update(dt,{enabled=true,playing=true,canStart=true}={}){
   if(!enabled){active=false;remaining=0;schedule();return;}if(!playing)return;
   dt=Math.max(0,Number.isFinite(dt)?dt:0);
   if(active){remaining=Math.max(0,remaining-dt);if(remaining<=0)resolve(false);}
   else if(canStart){wait-=dt;if(wait<=0){active=true;remaining=gameConfig.moodle.deadlineSeconds;onStart(++sequence);}}
  },answer:resolve,
  reset(){active=false;remaining=0;sequence=0;schedule();},
  state:()=>({active,remaining,wait,sequence})
 };
}
