import {gameConfig} from '../../config/game-config.js';
// A continuous hold: losing the target or moving too fast starts it over.
export function createScanProgress({duration=gameConfig.scanning.ticketHoldSeconds,settle=gameConfig.scanning.ticketSettleSeconds}={}){
 let held=0;
 return {reset(){held=0;},update(dt,valid,steady){held=valid&&steady?held+Math.min(.1,Math.max(0,dt||0)):0;return Math.min(1,Math.max(0,(held-settle)/duration));}};
}
