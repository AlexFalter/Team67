// Translate a host map's queries into the contract used by exported features.
// This module never loads a map, modifies meshes, or creates a player controller.
export function createWorldAdapter({height,blocked,isWater=()=>false,bridgeAt=()=>null,bounds,placements,data={},penetration,solve,radius=.42,addStationPassages,bodyBlocked,vehicleWallBlocked,navigationFactory}={}){
 for(const [name,value] of Object.entries({height,blocked,isWater,bridgeAt,penetration,solve}))if(typeof value!=='function')throw Error(`World adapter requires ${name}()`);
 if(!bounds||['minX','maxX','minZ','maxZ'].some(k=>!Number.isFinite(bounds[k]))||bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)throw Error('World adapter requires finite ordered bounds');
 if(!Number.isFinite(radius)||radius<=0)throw Error('World adapter requires a positive body radius');
 const world={height,ground:height,blocked,isWater,bridgeAt,placements,data:{...data,playableBounds:{...bounds},encounterBounds:data.encounterBounds??{...bounds}}};
 for(const [key,value] of Object.entries({bodyBlocked,vehicleWallBlocked,navigationFactory})){if(value!==undefined){if(typeof value!=='function')throw Error(`World adapter ${key} must be a function`);world[key]=value;}}
 if(addStationPassages)world.addStationPassages=addStationPassages;
 return {world,solver:{penetration,solve,radius}};
}
