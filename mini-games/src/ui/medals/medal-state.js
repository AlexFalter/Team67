export const MEDALS=Object.freeze({
 bagged:{title:'Bagged',detail:'Ersti-bag special delivery',icon:'bag'},
 revenge:{title:'Revenge',detail:'Karambit acquired',icon:'knife'},
 frankfurtDelivery:{title:'Frankfurt Delivery',detail:'One very sharp souvenir',icon:'knife'},
 publicMenace:{title:'Public Menace',detail:'No bell. Just vibes.',icon:'wheel'},
 bikeLaneJustice:{title:'Bike Lane Justice',detail:'Right of way? Right of bonk.',icon:'skull'},
 bloodthirsty:{title:'Bloodthirsty',detail:'PubliBike run-over',icon:'skull'},
});
// Stable display instances keep multiplier updates from replaying the entry animation.
export function createMedalState({definitions=MEDALS,duration=2.4,gap=.25}={}){
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(gap)||gap<0)throw Error('Medal duration must be positive and gap nonnegative');
 const seen=new Set(),earned=[],queue=[];
 let current=null,remaining=0,delay=0,nextInstance=0,nextBatch=0,clock=0;
 function awardOne(id,eventKey,group,batch){
  const event=JSON.stringify([id,eventKey]);
  if(!definitions[id]||seen.has(event))return false;
  seen.add(event);
  const existing=earned.find(item=>item.id===id&&item.batch===batch);
  if(existing){existing.count++;if(current===existing)remaining=duration;return true;}
  const item={id,...definitions[id],group,batch,instance:++nextInstance,count:1};
  earned.push(item);queue.push(item);return true;
 }
 function awardMany(ids,eventKey){
  const group=[...new Set(ids)].sort().join('|');
  const pending=[current,...queue].find(item=>item?.group===group);
  const batch=pending?.batch??++nextBatch;
  return ids.reduce((count,id)=>count+Number(awardOne(id,eventKey,group,batch)),0);
 }
 return {
  awardMany,
  award(id,eventKey=id){return !!awardMany([id],eventKey);},
  update(dt,paused=false){
   if(paused||!Number.isFinite(dt)||dt<0)return;
   let budget=Math.min(dt,10);
   do{
    if(current){const untilNext=queue.length?Math.min(remaining,Math.max(0,.38-(duration-remaining))):remaining;const used=Math.min(untilNext,budget);remaining-=used;budget-=used;clock+=used;if(remaining<=0||(queue.length&&used>=untilNext)){current=null;delay=queue.length?0:gap;}else break;}
    if(delay>0){const used=Math.min(delay,budget);delay-=used;budget-=used;clock+=used;if(delay>0)break;}
    if(!current&&queue.length){current=queue.shift();current.startedAt=clock;remaining=duration;}else if(!current){clock+=budget;break;}
   }while(budget>0);
  },
  reset(){seen.clear();earned.length=queue.length=0;current=null;remaining=delay=nextInstance=nextBatch=clock=0;},
  state:()=>({clock,duration,current:current?{...current}:null,remaining,earned:earned.map(x=>({...x})),queued:queue.map(x=>({...x}))}),
 };
}
