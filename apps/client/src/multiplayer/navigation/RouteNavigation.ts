import {einsteinDestination,zurichWorld} from "@race/shared";
import type {MapPoint} from '../raceHudModel.ts';
import {remainingRoute,routeDistance} from './routeModel.ts';
/** Route searches run off the render thread and reuse the map navigation grid. */
export class RouteNavigation {
 private passedCat=false;
 private worker=new Worker(new URL('./route.worker.js',import.meta.url),{type:'module'});
 private id=0;private pending=false;private last?:MapPoint;private age=Infinity;private route:MapPoint[]=[];private failed=false;
 status:'searching'|'ready'|'unavailable'='searching';
 points:MapPoint[]=[];distance=0;
 constructor(){
  this.worker.onmessage=({data}:{data:{id:number;points:MapPoint[]}})=>{if(data.id!==this.id)return;this.pending=false;this.route=data.points;this.status=data.points.length?'ready':'unavailable';};
  this.worker.onerror=()=>{this.pending=false;this.failed=true;this.route=[];this.status='unavailable';};
 }
 update(dt:number,position:MapPoint){
  this.age+=dt;
  const cat=einsteinDestination(zurichWorld);
  if(!cat||Math.hypot(position.x-cat.x,position.z-cat.z)<8)this.passedCat=true;
  const remaining=remainingRoute(this.route,position);
  const deviation=remaining.length?Math.hypot(position.x-remaining[0].x,position.z-remaining[0].z):Infinity;
  const moved=!this.last||Math.hypot(position.x-this.last.x,position.z-this.last.z)>=6;
  if(!this.pending&&!this.failed&&(!this.last||this.age>=1.5&&moved&&deviation>6)){
   this.last={x:position.x,z:position.z};this.age=0;this.pending=true;if(!this.route.length)this.status='searching';this.worker.postMessage({id:++this.id,from:this.last,viaCat:!this.passedCat});
  }
  if(deviation>30){this.points=[];if(this.pending)this.status='searching';}
  else {this.points=remaining;this.route=remaining;if(this.points.length)this.status='ready';}
  this.distance=routeDistance(this.points)+(Number.isFinite(deviation)&&this.points.length?deviation:0);
 }
 reset(){this.passedCat=false;this.id++;this.pending=false;this.last=undefined;this.route=[];this.points=[];this.distance=0;this.age=Infinity;this.status='searching';}
 dispose(){this.worker.terminate();this.reset();}
}
