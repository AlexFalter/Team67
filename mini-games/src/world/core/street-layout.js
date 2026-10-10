// Hand-shaped station forecourt; narrow source footpaths here are one paved space.
export const streetPlazas=[{name:'Bahnhofplatz forecourt',ring:[[-294,0],[-281,-4],[-266,-4],[-255,-7],[-259,-17],[-278,-23],[-292,-16]]}];
const motorTypes=new Set(['primary','secondary','tertiary','residential','unclassified','service','busway','living_street']);
export function streetLayout(data){
 const roads=data.streets.filter(s=>motorTypes.has(s.type)).map(s=>({...s,width:s.name==='Bahnhofquai'?Math.max(6,s.width):s.width,points:cleanPoints(s.points)}));
 const paths=data.streets.filter(s=>['pedestrian','footway','path'].includes(s.type)).map(s=>({...s,points:cleanPoints(s.points)}));
 const ends=roads.flatMap(s=>[s.points[0],s.points.at(-1)]);
 const junctions=ends.filter((p,i)=>ends.some((q,j)=>j!==i&&Math.hypot(p[0]-q[0],p[1]-q[1])<1));
 return {roads,paths,junctions,plazas:streetPlazas};
}
function cleanPoints(points){const result=[];for(const p of points){if(!result.length||Math.hypot(p[0]-result.at(-1)[0],p[1]-result.at(-1)[1])>.4)result.push(p);}return result.length>1?result:points;}
