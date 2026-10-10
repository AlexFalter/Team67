export function catPetEdge(x){const t=Math.max(0,Math.min(1,(x-.32)/.47));return .43-.08*Math.sin(Math.PI*t)+.02*t;}

// Petting judges rhythm, not accuracy: any direction works and one sudden
// movement is forgiven. Only sustained frantic rubbing causes a bite.
export function createCatPetting(tuning,{onBite=()=>{},onComplete=()=>{}}={}){
 let strokes=0,phase='petting',anchor=null,travel=0,direction=0,lastDirection=0,lastStrokeTime=0,roughTime=0;
 return {
  start(x,y,time){if(phase!=='petting')return;anchor={x,y,time};travel=0;direction=0;lastStrokeTime=time;},
  move(x,y,time){
   if(!anchor||phase!=='petting')return;
   const dx=x-anchor.x,dy=y-anchor.y,dt=Math.max(.008,(time-anchor.time)/1000),distance=Math.hypot(dx,dy);anchor={x,y,time};
   const tooFast=distance/dt>tuning.maximumStrokeSpeed;
   roughTime=tooFast?roughTime+Math.min(dt,.08):Math.max(0,roughTime-dt*2);
   if(roughTime>=tuning.roughPetSeconds){phase='bitten';anchor=null;onBite();return;}
   if(distance<.00001)return;
   const next=Math.sign(Math.abs(dx)>=Math.abs(dy)?dx:dy);
   if(next!==direction){travel=0;direction=next;}
   travel+=distance;
   if(travel>=tuning.strokeDistance&&direction!==lastDirection&&!tooFast&&time-lastStrokeTime>=tuning.minimumStrokeSeconds*1000){
    strokes++;lastDirection=direction;travel=0;lastStrokeTime=time;
    if(strokes>=tuning.strokesRequired){phase='happy';anchor=null;onComplete();}
   }
  },
  stop(){anchor=null;travel=0;direction=0;roughTime=0;},
  reset(){strokes=0;phase='petting';anchor=null;travel=direction=lastDirection=lastStrokeTime=roughTime=0;},
  state:()=>({strokes,phase,dragging:!!anchor,roughness:Math.min(1,roughTime/tuning.roughPetSeconds)})
 };
}
