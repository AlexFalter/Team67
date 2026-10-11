import {TRAM_KIND,POLYBAHN_KIND,LIME_KIND} from '@race/shared';
export type VehicleMapIcon='polybahn'|'tram'|'bus'|'car'|'bike'|'scooter';
const styles:Record<VehicleMapIcon,{label:string;color:string;path:string}>={
 polybahn:{label:'Polybahn',color:'#e76673',path:'M3 6L21 2M12 4V8M5 8H19V17L5 20ZM5 13H19M10 8V13M15 8V13M7 20V22M17 18V20'},
 tram:{label:'Tram',color:'#559ce6',path:'M7 5H17Q19 5 19 7V17Q19 19 17 19H7Q5 19 5 17V7Q5 5 7 5ZM5 13H19M12 5V13M9 2H15M12 2V5M8 19L6 22M16 19L18 22M8 16H9M15 16H16'},
 bus:{label:'Bus',color:'#e6b958',path:'M6 3H18Q20 3 20 5V18H4V5Q4 3 6 3ZM4 12H20M12 3V12M7 15H9M15 15H17M6 18V21H9V18M15 18V21H18V18'},
 car:{label:'Car',color:'#8ac6da',path:'M5 10L7 5H17L19 10M3 10H21V18H3ZM7 13H8M16 13H17M5 18V21M19 18V21'},
 bike:{label:'PubliBike',color:'#a3ce68',path:'M8 17A4 4 0 1 1 0 17A4 4 0 1 1 8 17M24 17A4 4 0 1 1 16 17A4 4 0 1 1 24 17M4 17L9 8L14 17H4M9 8H17L14 17M20 17L16 5H20M7 5H11M9 5V8'},
 scooter:{label:'Lime scooter',color:'#67d795',path:'M6 19A2 2 0 1 1 2 19A2 2 0 1 1 6 19M22 19A2 2 0 1 1 18 19A2 2 0 1 1 22 19M4 17H16L18 15L16 4H12M16 4H20M18 15L20 17'},
};
export function vehicleMapIcon(kind:number):VehicleMapIcon{
 return kind===POLYBAHN_KIND?'polybahn':kind===TRAM_KIND?'tram':kind===1?'bus':kind===2?'bike':kind===LIME_KIND?'scooter':'car';
}
export function vehicleMapLabel(kind:number){return styles[vehicleMapIcon(kind)].label;}
const paths=new Map<VehicleMapIcon,Path2D>();
export function drawVehicleMapIcon(ctx:CanvasRenderingContext2D,icon:VehicleMapIcon,x:number,y:number,size:number){
 const style=styles[icon];let path=paths.get(icon);if(!path){path=new Path2D(style.path);paths.set(icon,path);}
 ctx.save();ctx.translate(x,y);
 ctx.beginPath();ctx.arc(0,0,size*.65,0,Math.PI*2);ctx.fillStyle='#142331';ctx.fill();ctx.strokeStyle=style.color;ctx.lineWidth=1.5;ctx.stroke();
 ctx.scale(size/24,size/24);ctx.translate(-12,-12);ctx.strokeStyle='#fff';ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(path);ctx.restore();
}
