import {zurichWorld,zurichNativeHeight,zurichNativeBlocked,einsteinDestination,examPortalPosition,CAPSULE_RADIUS,CAPSULE_HEIGHT} from '@race/shared';
import {createMapNavigation} from '../../npcPrototype/src/world/core/map-navigation.js';
const world={data:{playableBounds:zurichWorld.bounds},height:zurichNativeHeight,blocked:(x,z)=>{const y=zurichNativeHeight(x,z);return y===undefined||zurichNativeBlocked(x,y,z,CAPSULE_RADIUS+.1,CAPSULE_HEIGHT)||zurichWorld.blocked(x,y,z,CAPSULE_RADIUS+.1,CAPSULE_HEIGHT);}};
const navigation=createMapNavigation(world,{penetration:()=>0});
self.onmessage=({data})=>{
 try{
  const landing=einsteinDestination(zurichWorld),cat=landing?[landing.x,landing.z]:null;
  const from=[data.from.x,data.from.z],goal=[examPortalPosition.x,examPortalPosition.z];
  const first=navigation.path(from,data.viaCat&&cat?cat:goal);
  const route=data.viaCat&&cat?[...first,...navigation.path(cat,goal).slice(1)]:first;
  const points=route.map(([x,z])=>({x,z}));self.postMessage({id:data.id,points});
 }
 catch{self.postMessage({id:data.id,points:[]});}
};
