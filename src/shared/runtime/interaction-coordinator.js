// Policies concern the local player's input/camera. They never pause host simulation.
export function createInteractionCoordinator(){
 const entries=new Map();
 function register(id,{active,blocks=['movement','camera','worldInteraction','items','phone','map'],keydown}={}){
  if(entries.has(id)||typeof active!=='function')throw Error(`Invalid interaction registration: ${id}`);
  const entry={id,active,blocks:new Set(blocks),keydown};entries.set(id,entry);
  return ()=>entries.delete(id);
 }
 return {register,
  active:()=>[...entries.values()].filter(e=>e.active()).map(e=>e.id),
  blocks(capability,{except=[]}={}){return [...entries.values()].some(e=>!except.includes(e.id)&&e.blocks.has(capability)&&e.active());},
  keydown(event){for(const e of entries.values())if(e.active()&&e.keydown?.(event))return true;return false;},
  dispose(){entries.clear();}
 };
}
