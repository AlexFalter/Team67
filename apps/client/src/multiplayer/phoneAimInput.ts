// Relative aiming starts at the viewfinder centre, independently of where the
// browser restores the physical cursor after leaving pointer lock.
export class PhoneAimInput {
 private previous?:{x:number;y:number};
 private edge={x:0,y:0};
 reset(){this.previous=undefined;this.edge={x:0,y:0};}
 move(x:number,y:number,bounds:{left:number;top:number;width:number;height:number},touch=false){
  const old=this.previous;this.previous={x,y};
  if(!old){this.edge={x:0,y:0};return {x:0,y:0};}
  const dx=x-old.x,dy=y-old.y;
  if(Math.abs(dx)>bounds.width*.45||Math.abs(dy)>bounds.height*.45){this.edge={x:0,y:0};return {x:0,y:0};}
  const edge=(n:number,size:number)=>n<20?-Math.min(1,(20-n)/20):n>size-20?Math.min(1,(n-size+20)/20):0;
  const xEdge=edge(x-bounds.left,bounds.width),yEdge=edge(y-bounds.top,bounds.height);
  this.edge=touch?{x:0,y:0}:{
   x:dx===0?(xEdge?this.edge.x:0):dx*xEdge>0?xEdge:0,
   y:dy===0?(yEdge?this.edge.y:0):dy*yEdge>0?yEdge:0,
  };
  return {x:dx,y:dy};
 }
 edgeMovement(dt:number){return {x:this.edge.x*.45*dt,y:this.edge.y*.35*dt};}
}
