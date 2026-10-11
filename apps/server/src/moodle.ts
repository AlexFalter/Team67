import config from '../../../packages/shared/src/moodle-config.json' with {type:'json'};
import type {RaceState} from './state.ts';
export interface MoodleResult {id:number;passed:boolean;course:string;roundStartedAt:number}
/** One deadline and question for the entire room; answers remain per player. */
export class MoodleEvents {
 private next=0;private eligible=new Set<string>();private answered=new Set<string>();private rewards=new Map<string,number>();
 constructor(private state:RaceState,private send:(id:string,result:MoodleResult)=>void,private random= Math.random){}
 reset(){this.next=0;this.eligible.clear();this.answered.clear();this.rewards.clear();this.state.moodleEventId=0;this.state.moodleDeadline=0;for(const p of this.state.players.values()){p.moodleSitUntil=0;p.moodleBoostUntil=0;}}
 enabled(value:boolean){if(this.state.moodleEnabled!==value)this.next=0;this.state.moodleEnabled=value;if(!value){this.state.moodleDeadline=0;for(const p of this.state.players.values())p.moodleSitUntil=0;}}
 private schedule(now:number){this.next=now+(config.intervalSeconds[0]+this.random()*(config.intervalSeconds[1]-config.intervalSeconds[0]))*1000;}
 tick(now:number){
 if(!this.state.moodleEnabled)return;
 if(this.state.moodleDeadline&&now>=this.state.moodleDeadline){for(const id of this.eligible)if(!this.answered.has(id))this.resolve(id,false);this.state.moodleDeadline=0;this.schedule(now);}
 if(!this.next)this.schedule(now);
 if(!this.state.moodleDeadline&&now>=this.next){this.eligible=new Set([...this.state.players.keys()].filter(id=>!this.state.members.get(id)?.spectator));if(!this.eligible.size){this.schedule(now);return;}this.answered.clear();this.state.moodleEventId++;this.state.moodleQuestionIndex=Math.floor(this.random()*config.questions.length);this.state.moodleDeadline=now+config.deadlineSeconds*1000;}
 }
 answer(id:string,data:unknown,now:number){if(!data||typeof data!=='object')return false;const d=data as {id?:unknown;answer?:unknown;roundStartedAt?:unknown};if(d.roundStartedAt!==this.state.startedAt||d.id!==this.state.moodleEventId||!this.state.moodleDeadline||now>=this.state.moodleDeadline||!this.state.moodleEnabled||!this.eligible.has(id)||this.answered.has(id)||!Number.isInteger(d.answer)||Number(d.answer)<0||Number(d.answer)>=3)return false;this.resolve(id,d.answer===config.questions[this.state.moodleQuestionIndex].correct);return true;}
 claim(id:string,data:unknown,now:number){if(!data||typeof data!=='object')return false;const d=data as {id?:unknown;roundStartedAt?:unknown},player=this.state.players.get(id);if(!player||this.state.members.get(id)?.spectator||d.roundStartedAt!==this.state.startedAt||this.rewards.get(id)!==d.id||!this.rewards.has(id))return false;this.rewards.delete(id);player.moodleBoostUntil=now+config.boostSeconds*1000;return true;}
 private resolve(id:string,passed:boolean){this.answered.add(id);if(passed&&this.state.players.has(id))this.rewards.set(id,this.state.moodleEventId);this.send(id,{id:this.state.moodleEventId,passed,course:config.questions[this.state.moodleQuestionIndex].course,roundStartedAt:this.state.startedAt});}
}
