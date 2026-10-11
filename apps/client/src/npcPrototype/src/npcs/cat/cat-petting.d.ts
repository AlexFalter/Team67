export interface CatPettingTuning {
 strokeDistance:number;
 maximumStrokeSpeed:number;
 roughPetSeconds:number;
 minimumStrokeSeconds:number;
 strokesRequired:number;
}
export function catPetEdge(x:number):number;
export function createCatPetting(tuning:CatPettingTuning,callbacks?:{onBite?:()=>void;onComplete?:()=>void}):{
 start(x:number,y:number,time:number):void;
 move(x:number,y:number,time:number):void;
 stop():void;
 reset():void;
 state():{strokes:number;phase:'petting'|'bitten'|'happy';dragging:boolean;roughness:number};
};
