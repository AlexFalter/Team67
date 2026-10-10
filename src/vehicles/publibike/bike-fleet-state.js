import {rollFailure} from '../../config/failure-roll.js';

// Host-side state: no DOM, scene, map, or network transport dependency.
export function createBikeFleetState({snapshot,fleetId=snapshot?.fleetId??'publibike',count=snapshot?.count??8,batterySeconds=snapshot?.batterySeconds??15,failurePercent=50,random=()=>Math.random()}={}){
 if(typeof fleetId!=='string'||!fleetId||!Number.isInteger(count)||count<1||!Number.isFinite(batterySeconds)||batterySeconds<=0||!Number.isFinite(failurePercent)||failurePercent<0||failurePercent>100)throw Error('Invalid bike fleet configuration');
 let records=[],revision=0;
 const get=id=>records.find(b=>b.id===id);
 const playerValid=id=>typeof id==='string'&&id.length>0;
 function reset({workingIds}={}){
  if(workingIds&&(!Array.isArray(workingIds)||new Set(workingIds).size!==workingIds.length||workingIds.some(id=>!Number.isInteger(id)||id<1||id>count)))throw Error('Invalid working bike IDs');
  records=Array.from({length:count},(_,i)=>{const working=workingIds?workingIds.includes(i+1):!rollFailure(failurePercent,random);return {id:i+1,entityId:`${fleetId}:bike-${i+1}`,working,broken:!working,reason:working?null:'OUT OF SERVICE: This PubliBike cannot unlock. Choose another bike.',scanAttempts:0,rideTime:0,dock:i,ownerId:null,destroyed:false,position:null,yaw:0};});revision++;
 }
 function restore(value){
  if(value?.version!==1||value.fleetId!==fleetId||value.count!==count||value.batterySeconds!==batterySeconds||!Number.isInteger(value.revision)||value.revision<0||!Array.isArray(value.bikes)||value.bikes.length!==count)throw Error('Invalid bike fleet snapshot');
  const owners=new Set(),docks=new Set();
  const next=value.bikes.map((b,i)=>{
   if(!(b.position===null||Array.isArray(b.position)&&b.position.length===3&&b.position.every(Number.isFinite))||!Number.isFinite(b.yaw)||b.id!==i+1||b.entityId!==`${fleetId}:bike-${i+1}`||typeof b.working!=='boolean'||typeof b.broken!=='boolean'||typeof b.destroyed!=='boolean'||!(b.reason===null||typeof b.reason==='string')||!Number.isInteger(b.scanAttempts)||b.scanAttempts<0||!Number.isFinite(b.rideTime)||b.rideTime<0||b.rideTime>batterySeconds||!(b.dock===null||Number.isInteger(b.dock)&&b.dock>=0&&b.dock<count)||!(b.ownerId===null||playerValid(b.ownerId))||(!b.working&&!b.broken)||(!b.broken&&b.rideTime>=batterySeconds)||(b.destroyed&&(!b.broken||b.ownerId!==null||b.dock!==null))||(b.ownerId!==null&&(b.dock!==null||owners.has(b.ownerId)))||(b.dock!==null&&docks.has(b.dock)))throw Error('Invalid bike fleet record');
   if(b.ownerId!==null)owners.add(b.ownerId);if(b.dock!==null)docks.add(b.dock);
   return Object.fromEntries(['id','entityId','working','broken','reason','scanAttempts','rideTime','dock','ownerId','destroyed','position','yaw'].map(key=>[key,key==='position'&&b[key]?[...b[key]]:b[key]]));
  });records=next;revision=value.revision;
 }
 if(snapshot)restore(snapshot);else reset();
 return {
  reset,restore,
  applySnapshot(value){if(Number.isInteger(value?.revision)&&value.revision<revision)return false;restore(value);return true;},
  bike(id){const b=get(id);return b?{...b,position:b.position?[...b.position]:null}:null;},
  snapshot:()=>({version:1,fleetId,count,batterySeconds,revision,bikes:records.map(b=>({...b,position:b.position?[...b.position]:null}))}),
  setPose(id,position,yaw,playerId=null){const b=get(id);if(!b||b.ownerId!==playerId||!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite)||!Number.isFinite(yaw))return false;b.position=[...position];b.yaw=yaw;revision++;return true;},
  scan(id){const b=get(id);if(!b)return {ok:false,error:'Unknown bike'};b.scanAttempts++;revision++;return b.broken||b.destroyed||b.ownerId!==null?{ok:false,permanent:b.broken,error:b.reason??'Bike is occupied'}:{ok:true};},
  claim(id,playerId){const b=get(id);if(!playerValid(playerId)||!b||b.broken||b.destroyed||b.ownerId!==null||records.some(other=>other.ownerId===playerId))return false;b.ownerId=playerId;b.dock=null;revision++;return true;},
  park(id,playerId,dock=null){const b=get(id);if(!b||b.ownerId!==playerId||!playerValid(playerId)||!(dock===null||Number.isInteger(dock)&&dock>=0&&dock<count)||dock!==null&&records.some(other=>other.id!==id&&other.dock===dock))return false;b.ownerId=null;b.dock=dock;revision++;return true;},
  destroy(id,playerId,reason='Exploded in the Limmat'){const b=get(id);if(!b||!playerValid(playerId)||b.ownerId!==playerId)return false;b.broken=true;b.reason=String(reason);b.destroyed=true;b.ownerId=null;b.dock=null;revision++;return true;},
  tick(dt){if(!Number.isFinite(dt)||dt<=0)return [];const depleted=[];for(const b of records)if(b.ownerId!==null&&!b.broken){b.rideTime=Math.min(batterySeconds,b.rideTime+dt);revision++;if(b.rideTime>=batterySeconds){b.broken=true;b.reason=`BATTERY EMPTY · Your ${batterySeconds}-second ride is over. Choose another PubliBike.`;depleted.push(b.id);}}return depleted;}
 };
}
