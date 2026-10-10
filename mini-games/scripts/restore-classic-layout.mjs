import {readFile,writeFile} from 'node:fs/promises';
import {physicsHarness} from '../physics-harness.mjs';
import {createMapNavigation} from '../map-navigation.js';
const filename=new URL('../public/gameplay/locations.json',import.meta.url),legacy=JSON.parse(await readFile(new URL('../public/gameplay/classic-layout.json',import.meta.url),'utf8')),data=JSON.parse(await readFile(filename,'utf8'));
const dx=legacy.origin[0]-data.origin[0],dz=data.origin[1]-legacy.origin[1];
data.layoutRoute=legacy.route.map(([x,z])=>[Math.round((x+dx)*1000)/1000,Math.round((z+dz)*1000)/1000]);
data.start=data.layoutRoute[0];data.goal=data.layoutRoute.at(-1);data.startLocation='Bahnhofbrücke';const a=data.layoutRoute[0],b=data.layoutRoute[5];data.startHeading=Math.atan2(-(b[0]-a[0]),-(b[1]-a[1]));
data.layoutSource='Original Bahnhofbrücke gameplay route, translated to the native map origin; interaction anchors remain relative to this route.';
const {world,solver}=await physicsHarness({worldOnly:true}),navigation=createMapNavigation(world,solver,{clearance:2}),route=[];
const indices=[0,6,7,12,24,28,38,50,60,70,data.layoutRoute.length-1];
for(let i=1;i<indices.length;i++){
 const path=navigation.path(data.layoutRoute[indices[i-1]],data.layoutRoute[indices[i]]);
 for(const point of path)if(!route.length||Math.hypot(point[0]-route.at(-1)[0],point[1]-route.at(-1)[1])>.01)route.push(point);
}
data.route=route;data.source='Original gameplay ordering and geographic locations, with walking directions fitted to the complete native map collision grid.';
await writeFile(filename,JSON.stringify(data));console.log(`Restored ${data.layoutRoute.length} original layout anchors and ${route.length} walkable guide points.`);
