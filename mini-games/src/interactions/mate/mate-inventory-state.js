// Player-owned item/boost state; grant IDs make replayed reward events harmless.
export function createMateInventoryState({duration=15,multiplier=1.35,snapshot}={}){
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(multiplier)||multiplier<=0)throw Error('Invalid Mate boost configuration');
 let count=0,remaining=0,grants=new Set();
 function reset(){count=0;remaining=0;grants.clear();}
 function restore(value){if(value?.version!==1||!Number.isInteger(value.count)||value.count<0||!Number.isFinite(value.remaining)||value.remaining<0||value.remaining>duration||!Array.isArray(value.grants)||value.grants.some(id=>typeof id!=='string'||!id)||new Set(value.grants).size!==value.grants.length)throw Error('Invalid Mate inventory snapshot');count=value.count;remaining=value.remaining;grants=new Set(value.grants);}
 if(snapshot)restore(snapshot);
 return {reset,restore,duration,multiplierValue:multiplier,snapshot:()=>({version:1,count,remaining,grants:[...grants]}),
  add(grantId){if(grantId!==undefined){if(typeof grantId!=='string'||!grantId)throw Error('Invalid reward grant ID');if(grants.has(grantId))return false;grants.add(grantId);}count++;return true;},
  use(){if(count===0||remaining>0)return false;count--;remaining=duration;return true;},
  tick(dt,{walking=false}={}){if(walking&&Number.isFinite(dt)&&dt>0)remaining=Math.max(0,remaining-dt);},
  multiplier:()=>remaining>0?multiplier:1
 };
}
