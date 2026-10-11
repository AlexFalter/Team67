import {BAG_GRAVITY,type BagState} from '@race/shared';
interface Frame {t:number;x:number;y:number;z:number;vx:number;vy:number;vz:number;pitch:number;roll:number;flying:boolean;owner:string}
export interface BagPose {x:number;y:number;z:number;pitch:number;roll:number}
/** Render between server snapshots; never predicts collision results or ownership. */
export class BagFlight {
 private frames:Frame[]=[];
 private result:BagPose={x:0,y:0,z:0,pitch:0,roll:0};
 push(b:BagState,t:number){
  t=Math.max(t,b.flying?b.releasedAt:0);
  const last=this.frames.at(-1);
  if(last?.t===t){if(last.owner===b.owner&&last.flying===b.flying)return;this.frames.pop();}
  if(last&&(last.owner!==b.owner||b.releasedAt>last.t))this.frames=[];
  this.frames.push({t,x:b.x,y:b.y,z:b.z,vx:b.vx,vy:b.vy,vz:b.vz,pitch:b.flying?b.spin:0,roll:b.flying?b.spin*.37:0,flying:b.flying,owner:b.owner});
  while(this.frames.length>6)this.frames.shift();
 }
 sample(t:number):BagPose{
  const frames=this.frames,last=frames.at(-1)!;
  let a=frames[0],b=a;
  for(let i=1;i<frames.length;i++){b=frames[i];if(b.t>=t)break;a=b;}
  if(t>last.t){
   const dt=last.flying?Math.min(.075,(t-last.t)/1000):0;
   return Object.assign(this.result,{x:last.x+last.vx*dt,y:last.y+last.vy*dt-.5*BAG_GRAVITY*dt*dt,z:last.z+last.vz*dt,pitch:last.pitch+dt*3.5,roll:last.roll+dt*3.5*.37});
  }
  const u=b.t>a.t?Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t))):0;
  for(const key of ['x','y','z','pitch','roll'] as const)this.result[key]=a[key]+(b[key]-a[key])*u;
  return this.result;
 }
}
