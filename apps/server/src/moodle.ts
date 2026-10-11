import config from '../../../packages/shared/src/moodle-config.json' with {type:'json'};
import type {RaceState} from './state.ts';
export interface MoodleResult {id:number;passed:boolean;course:string;roundStartedAt:number}
/** One deadline and question for the entire room; answers remain per player. */
export class MoodleEvents {
 private next=0;private eligible=new Set<string>();private answered=new Set<string>();private pending=new Set<string>();private rewarded=false;
 constructor(private state:RaceState,private send:(id:string,result:MoodleResult)=>void,private canSit:(id:string)=>boolean,private random= Math.random){}
 reset(){this.next=0;this.eligible.clear();this.answered.clear();this.pending.clear();this.state.moodleEventId=0;this.state.moodleDeadline=0;for(const p of this.state.players.values())p.moodleSitUntil=0;}
 enabled(value:boolean){if(this.state.moodleEnabled!==value)this.next=0;this.state.moodleEnabled=value;if(!value){this.state.moodleDeadline=0;this.pending.clear();for(const p of this.state.players.values())p.moodleSitUntil=0;}}
 private schedule(now:number){this.next=now+(config.intervalSeconds[0]+this.random()*(config.intervalSeconds[1]-config.intervalSeconds[0]))*1000;}
 tick(now:number){
 if(!this.state.moodleEnabled)return;
 for(const id of this.pending){const p=this.state.players.get(id);if(!p){this.pending.delete(id);continue;}if(!p.vehicleId&&this.canSit(id)){p.moodleSitUntil=now+config.sitOutSeconds*1000;p.vx=p.vy=p.vz=0;this.pending.delete(id);}}
 if(this.state.moodleDeadline&&now>=this.state.moodleDeadline){for(const id of this.eligible)if(!this.answered.has(id))this.resolve(id,false);this.state.moodleDeadline=0;this.schedule(now);}
 if(!this.next)this.schedule(now);
 if(!this.state.moodleDeadline&&now>=this.next){this.eligible=new Set([...this.state.players.keys()].filter(id=>!this.state.members.get(id)?.spectator));if(!this.eligible.size){this.schedule(now);return;}this.answered.clear();this.rewarded=false;this.state.moodleEventId++;this.state.moodleQuestionIndex=Math.floor(this.random()*config.questions.length);this.state.moodleDeadline=now+config.deadlineSeconds*1000;}
 }
 answer(id:string,data:unknown,now:number){if(!data||typeof data!=='object')return false;const d=data as {id?:unknown;answer?:unknown;roundStartedAt?:unknown};if(d.roundStartedAt!==this.state.startedAt||d.id!==this.state.moodleEventId||!this.state.moodleDeadline||now>=this.state.moodleDeadline||!this.state.moodleEnabled||!this.eligible.has(id)||this.answered.has(id)||!Number.isInteger(d.answer)||Number(d.answer)<0||Number(d.answer)>=3)return false;this.resolve(id,d.answer===config.questions[this.state.moodleQuestionIndex].correct);return true;}
 private resolve(id:string,passed:boolean){this.answered.add(id);if(passed){if(!this.rewarded){if(!this.state.adminMode)this.state.endsAt+=config.rewardSeconds*1000;this.rewarded=true;}}else this.pending.add(id);this.send(id,{id:this.state.moodleEventId,passed,course:config.questions[this.state.moodleQuestionIndex].course,roundStartedAt:this.state.startedAt});}
}
