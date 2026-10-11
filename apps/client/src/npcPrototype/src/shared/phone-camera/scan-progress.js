
// A continuous hold: losing the target or moving too fast starts it over.
export function createScanProgress({duration=1.4,settle=0.2}={}){
 let held=0;
 return {reset(){held=0;},update(dt,valid,steady){held=valid&&steady?held+Math.min(.1,Math.max(0,dt||0)):0;return Math.min(1,Math.max(0,(held-settle)/duration));}};
}
