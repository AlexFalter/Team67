import * as THREE from 'three';
// Find pedestrian routes on the supplied geometry; never alter the map to fit a route.
export function createMapNavigation(world,solver,{step=2,clearance=0}={}){
 const bounds=world.data.playableBounds,width=Math.floor((bounds.maxX-bounds.minX)/step)+1,depth=Math.floor((bounds.maxZ-bounds.minZ)/step)+1;
 const heights=new Float32Array(width*depth),tested=new Uint8Array(width*depth),valid=new Uint8Array(width*depth),p=new THREE.Vector3();
 const point=index=>new THREE.Vector3(bounds.minX+(index%width)*step,heights[index],bounds.minZ+Math.floor(index/width)*step);
 const index=(x,z)=>Math.max(0,Math.min(depth-1,Math.round((z-bounds.minZ)/step)))*width+Math.max(0,Math.min(width-1,Math.round((x-bounds.minX)/step)));
 function safePoint(p){if(world.blocked(p.x,p.z)||solver.penetration(p)>.005)return false;if(clearance)for(const [dx,dz] of [[clearance,0],[-clearance,0],[0,clearance],[0,-clearance]]){const x=p.x+dx,z=p.z+dz;if(world.blocked(x,z))return false;}return true;}
 function clear(i){if(tested[i])return valid[i];tested[i]=1;p.set(bounds.minX+(i%width)*step,0,bounds.minZ+Math.floor(i/width)*step);p.y=world.height(p.x,p.z);heights[i]=p.y;valid[i]=safePoint(p);return valid[i];}
 function line(a,b){const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.25));let previous=a.y;
  for(let i=0;i<=steps;i++){const t=i/steps;p.set(THREE.MathUtils.lerp(a.x,b.x,t),0,THREE.MathUtils.lerp(a.z,b.z,t));p.y=world.height(p.x,p.z);if(!safePoint(p)||Math.abs(p.y-previous)>.55)return false;previous=p.y;}return true;}
 function nearest(location){const base=index(location[0],location[1]);for(let radius=0;radius<24;radius++)for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++){if(Math.max(Math.abs(x),Math.abs(z))!==radius)continue;const gx=base%width+x,gz=Math.floor(base/width)+z;if(gx<0||gz<0||gx>=width||gz>=depth)continue;const i=gz*width+gx;if(clear(i))return i;}throw Error('No accessible map point near '+location);}
 function path(from,to){const start=nearest(from),end=nearest(to),target=point(end),cost=new Float64Array(width*depth).fill(Infinity),parent=new Int32Array(width*depth).fill(-1),closed=new Uint8Array(width*depth),heap=[];cost[start]=0;
  function push(i,score){heap.push({i,score});let k=heap.length-1;while(k){const u=(k-1)>>1;if(heap[u].score<=score)break;heap[k]=heap[u];k=u;}heap[k]={i,score};}
  function pop(){const first=heap[0],last=heap.pop();if(heap.length){let k=0;while(2*k+1<heap.length){let j=2*k+1;if(j+1<heap.length&&heap[j+1].score<heap[j].score)j++;if(last.score<=heap[j].score)break;heap[k]=heap[j];k=j;}heap[k]=last;}return first.i;}
  push(start,0);let visits=0;
  while(heap.length){const i=pop();if(closed[i])continue;closed[i]=1;if(i===end){const chain=[];for(let k=end;k!==-1;k=parent[k])chain.push(point(k));chain.reverse();const simplified=[chain[0]];let cursor=0;while(cursor<chain.length-1){let next=cursor+1;for(let j=cursor+2;j<Math.min(chain.length,cursor+30);j++){if(!line(chain[cursor],chain[j]))break;next=j;}simplified.push(chain[next]);cursor=next;}return simplified.map(p=>[p.x,p.z]);}
   if(++visits>160000)break;const a=point(i),gx=i%width,gz=Math.floor(i/width);
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=gx+dx,z=gz+dz;if(x<0||x>=width||z<0||z>=depth)continue;const j=z*width+x;if(closed[j]||!clear(j))continue;const b=point(j);const next=cost[i]+a.distanceTo(b);if(next>=cost[j]||!line(a,b))continue;cost[j]=next;parent[j]=i;push(j,next+Math.hypot(b.x-target.x,b.z-target.z));}
  }
  throw Error(`No walkable path on native map from ${from} to ${to} (${visits} cells)`);
 }
 return {path,nearest:location=>{const i=nearest(location);return point(i);},line};
}
