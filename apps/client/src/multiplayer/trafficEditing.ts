import { validateTrafficNetwork, type TrafficNetwork, type TrafficPoint, type RoadNode } from '@race/shared';
const distance=(a:TrafficPoint,b:TrafficPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
export function removeTrafficRoads(network: TrafficNetwork, selected: ReadonlySet<string>): TrafficNetwork {
  const endpoints = new Set(network.roads.filter(r=>selected.has(r.id)).flatMap(r=>[r.from,r.to]));
  const roads = network.roads.filter(r=>!selected.has(r.id)), retained = new Set(roads.flatMap(r=>[r.from,r.to]));
  return {...network,roads,nodes:network.nodes.filter(n=>!endpoints.has(n.id)||retained.has(n.id))};
}
/** Convert a surface-snapped stroke into ordinary roads; joins and crossings share nodes. */
export function addTrafficStroke(source:TrafficNetwork, stroke:TrafficPoint[], id:()=>string):TrafficNetwork {
  if(stroke.length<2) throw new Error('Drag along at least 15 metres of street.');
  const network=structuredClone(source), points=[stroke[0]];
  for(let i=1;i<stroke.length-1;i++) if(distance(points.at(-1)!,stroke[i])>=25) points.push(stroke[i]);
  const end=stroke.at(-1)!;
  if(points.length>1 && distance(points.at(-1)!,end)<15) points.pop();
  if(distance(points.at(-1)!,end)>=15) points.push(end);
  if(points.length<2) throw new Error('Drag along at least 15 metres of street.');
  const node=(p:TrafficPoint):RoadNode=> {
    const existing=network.nodes.filter(n=>Math.abs(n.y-p.y)<2.5&&distance(n,p)<9).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(existing) return existing;
    // Landing on a road splits it, allowing a T junction without manually placing nodes.
    for(const road of [...network.roads]) {
      const a=network.nodes.find(n=>n.id===road.from)!,b=network.nodes.find(n=>n.id===road.to)!;
      const dx=b.x-a.x,dz=b.z-a.z,t=((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz);
      if(t<=0 || t>=1) continue;
      const q={x:a.x+dx*t,y:a.y+(b.y-a.y)*t,z:a.z+dz*t};
      if(distance(p,q)>6 || Math.abs(p.y-q.y)>2.5 || distance(a,q)<15 || distance(b,q)<15) continue;
      const n={...q,id:`draw-${id()}`}; network.nodes.push(n);
      network.roads=network.roads.filter(r=>r!==road);
      network.roads.push({...road,to:n.id},{...road,id:`road-${id()}`,from:n.id}); return n;
    }
    const n={...p,id:`draw-${id()}`};network.nodes.push(n);return n;
  };
  const nodes=points.map(node);
  for(let i=1;i<nodes.length;i++) {
    let a=nodes[i-1]; const b=nodes[i];
    if(a.id===b.id || distance(a,b)<15 || network.roads.some(r=>(r.from===a.id&&r.to===b.id)||(r.from===b.id&&r.to===a.id))) continue;
    const crossings:{t:number;n:RoadNode}[]=[];
    for(const road of [...network.roads]) {
      const c=network.nodes.find(n=>n.id===road.from)!,d=network.nodes.find(n=>n.id===road.to)!;
      if([a.id,b.id].includes(c.id)||[a.id,b.id].includes(d.id)) continue;
      const dx=b.x-a.x,dz=b.z-a.z,ex=d.x-c.x,ez=d.z-c.z,den=dx*ez-dz*ex;
      if(Math.abs(den)<0.001) continue;
      const t=((c.x-a.x)*ez-(c.z-a.z)*ex)/den,u=((c.x-a.x)*dz-(c.z-a.z)*dx)/den;
      if(t<=0||t>=1||u<=0||u>=1) continue;
      const p={x:a.x+dx*t,y:a.y+(b.y-a.y)*t,z:a.z+dz*t};
      if(Math.abs(p.y-(c.y+(d.y-c.y)*u))>2.5 || [a,b,c,d].some(n=>distance(n,p)<15)) continue;
      crossings.push({t,n:node(p)});
    }
    for(const next of [...crossings.sort((x,y)=>x.t-y.t).map(c=>c.n),b]) {
      if(distance(a,next)<15) continue;
      network.roads.push({id:`road-${id()}`,from:a.id,to:next.id,lanes:1,speed:8});a=next;
    }
  }
  const used=new Set(network.roads.flatMap(r=>[r.from,r.to]));
  network.nodes=network.nodes.filter(n=>used.has(n.id)||source.nodes.some(old=>old.id===n.id));
  for(const n of network.nodes) {
    const degree=network.roads.filter(r=>r.from===n.id||r.to===n.id).length;
    if(n.id.startsWith('draw-')) {n.spawn=degree===1;n.despawn=degree===1;}
    else if(degree>1 && nodes.some(p=>p.id===n.id)) n.despawn=false;
  }
  if(network.roads.length===source.roads.length) throw new Error('No new road added. Draw a longer stroke or start farther from an existing node.');
  return validateTrafficNetwork(network);
}
