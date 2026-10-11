// Normalized attack time; a slow wind-up, quick downward strike and recovery.
// The shared punch clock drives this pose for the owner and remote players.
export function sahurSwing(time:number){
 const keys=[
  [0,0,-.15,-.2,-.08,0,0],
  [.24,1,-2.4,-.9,0,-.32,-.08],
  [.5,1,-1.3,-.25,1.05,.38,.12],
  [.68,.9,-.8,-.35,1.35,.5,.18],
  [1,0,-.15,-.2,-.08,0,0],
 ];
 const t=Math.max(0,Math.min(1,time));const end=keys.findIndex(k=>k[0]>=t);const b=keys[Math.max(1,end)],a=keys[Math.max(1,end)-1];
 const phase=(t-a[0])/(b[0]-a[0]);
 const blend=phase*phase*(3-2*phase);
 const values=a.map((v,i)=>v+(b[i]-v)*blend);
 return {weight:values[1],shoulder:values[2],elbow:values[3],wrist:values[4],twist:values[5],lean:values[6]};
}
