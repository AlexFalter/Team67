import {readFile,writeFile} from 'node:fs/promises';
const data=JSON.parse(await readFile('public/gameplay/locations.json','utf8')),source=JSON.parse(await readFile('public/maps/zurich/collision.json','utf8'));
if(data.layoutRoute){console.log('Keeping restored classic layout and its walkable guide. Use scripts/restore-classic-layout.mjs to regenerate it.');process.exit(0);}
const path=source.route.map(p=>[p.x,p.z]),route=[];
for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],parts=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/10));if(i===1)route.push(a);for(let j=1;j<=parts;j++)route.push([a[0]+(b[0]-a[0])*j/parts,a[1]+(b[1]-a[1])*j/parts]);}
data.route=route;data.start??=route[0];data.goal=route.at(-1);data.source='Navigation uses the complete upstream map and its supplied walking route and collision grid. OSM annotations only identify geographic interaction zones.';
await writeFile('public/gameplay/locations.json',JSON.stringify(data));console.log('Installed upstream native route:',route.length,'checkpoints');
