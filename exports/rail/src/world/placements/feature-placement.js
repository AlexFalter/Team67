// Features consume a host-supplied placement, never import a specific map profile.
export function featurePlacement(world,id,override){
 const value=override??world.placements?.features?.[id];
 if(!value||typeof value!=='object')throw new Error(`Missing placement for ${id}. Supply {placement} or world.placements.features.${id}.`);
 return value;
}
export function placementPoint(value,label='position'){
 if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite))throw new Error(`${label} must be a finite [x,z] coordinate`);
 return [...value];
}
export function placementRoute(value,label='route'){
 if(!value||!Array.isArray(value.points)||value.points.length<2)throw new Error(`${label} needs at least two points`);
 return {...value,points:value.points.map((p,i)=>placementPoint(p,`${label}[${i}]`))};
}

// Waypoints specify intent; the map navigator finds clear ground between them.
export function navigatePlacement(navigation,from,waypoints=[],to){
 const stops=[placementPoint(from),...waypoints.map((p,i)=>placementPoint(p,`waypoint ${i}`)),placementPoint(to)];
 const points=[];
 for(let i=1;i<stops.length;i++){const leg=navigation.path(stops[i-1],stops[i]);points.push(...(i===1?leg:leg.slice(1)));}
 return points;
}
export function placementRoads(roads,existing){
 if(roads?.streets==null)return existing;
 if(!Array.isArray(roads.streets))throw Error('roads.streets must be an array');
 return roads.streets.map((road,i)=>{if(!Number.isFinite(road.width)||road.width<=0)throw Error(`Road ${i} requires positive width`);return placementRoute(road,`road ${i}`);});
}
