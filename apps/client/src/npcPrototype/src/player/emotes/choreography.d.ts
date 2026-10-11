export interface DancePose { left:number[];right:number[];body:number[];hips:number[];feet:number[][];head:number[] }
export const choreography:Record<string,{duration:number;poses:DancePose[]}>;
export function sampleDance(id:string,time:number):DancePose;
