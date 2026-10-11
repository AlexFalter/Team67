import {POLYBAHN_KIND, type TrafficCarState} from '@race/shared';
import type {LoopSource} from './gameAudio.ts';

/** Reuse recorded engines, with a stable timbre for each rendered model. */
export function trafficEngineSource(car:TrafficCarState):LoopSource{
 const speed=Math.max(0,Math.min(30,Math.abs(car.speed)));
 const tractor=car.kind===2,sports=car.kind===1;
 return {sample:tractor?'bus-engine':'car-engine',motor:true,active:true,speed:car.speed,
  x:car.x,y:car.y,z:car.z,aboard:false,range:38,
  rate:(tractor?.72:sports?1.12:.88)+speed*(tractor?.009:.012),
  volume:tractor?1.05:sports?1:.85};
}

export function railSoundProfile(kind:number,speed:number):Pick<LoopSource,'sample'|'rate'|'range'|'volume'|'departureChime'>{
 const polybahn=kind===POLYBAHN_KIND;
 return {sample:polybahn?'polybahn-running':'rail-running',
  rate:polybahn?.85+Math.min(10,Math.abs(speed))*.035:.95+Math.min(25,Math.abs(speed))*.008,
  range:50,volume:polybahn?1.4:1.3,departureChime:polybahn?'polybahn-chime':'tram-chime'};
}
