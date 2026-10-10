// Both maps share the same world positions; moving actors update every frame.
export function drawEncounterMarkers(ctx,markers,sx,sz,{size=12,width=ctx.canvas.width,height=ctx.canvas.height}={}){
 ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${size*2.05}px "Arial Black", Arial, sans-serif`;ctx.lineJoin='round';
 for(const marker of markers){const x=sx(marker.x),y=sz(marker.z);if(x<-size||y<-size||x>width+size||y>height+size)continue;ctx.strokeStyle='#101510';ctx.lineWidth=Math.max(2.5,size*.24);ctx.strokeText('?',x,y);ctx.fillStyle='#70df69';ctx.fillText('?',x,y);}

 ctx.restore();
}
export function encounterMapMarkers({tikiPerformer,benchCat,football,einstein,bridgeScooter,mateMachine,financeGuy,interviewLimo,sixSevenKid,ticketChecker,touristPhoto,polybahn,bikeStation,transport}){
 const markers=[],add=(id,label,p)=>{if(!p)return;const x=p.x??p[0],z=p.z??p[2]??p[1];if(Number.isFinite(x)&&Number.isFinite(z))markers.push({id,label,x,z});};
 if(tikiPerformer)add('tiki-performer','Tiki Tiki · music box',tikiPerformer.group.position);
 if(benchCat)add('cat','Bench cat · pet gently',benchCat.group.position);
 if(football)add('football','Tim Gio · football TV and penalty goal',football.group.position);
 if(einstein){add('einstein','Albert Einstein',einstein.actor.position);if(einstein.state().introduced)add('einstein-portal','Random teleporter',einstein.portal.position);}
 if(bridgeScooter&&!bridgeScooter.state().playing)add('bridge-trio','Three riders · Lime scooter',bridgeScooter.group.position);
 // A question mark promises an available interaction, never a future spawn.
 if(!mateMachine.state().won)add('mate','El Tony Mate machine',mateMachine.machine.position);
 if(!financeGuy.state().used)add('finance','Finance Guy',financeGuy.actor.position);
 const limo=interviewLimo.state();
 if(!limo.solved)add('interview','Laptop',interviewLimo.laptop.position);
 if(limo.phase==='waiting')add('butler','Chauffeur',limo.pickup);
 const kid=sixSevenKid.actor,kidState=sixSevenKid.state();
 if(kidState.aboard&&!kidState.enraged)add('kid','6–7 kid · Polybahn',kid.getWorldPosition(kid.position.clone()));
 if(touristPhoto.group.visible&&(!touristPhoto.state().used||touristPhoto.state().active))add('tourists','Tourist photos · Polyterrasse',touristPhoto.state().meetingPoint);
 const rail=polybahn.state();
 if(!rail.ticketCount)for(const [i,p] of polybahn.ticketPoints.entries())add(`ticket-${i}`,'Polybahn ticket machine',p);
 if(rail.phase==='idle'&&!rail.moving)add('polybahn','Polybahn boarding',rail.distance>rail.length/2?rail.end:rail.start);
 const bikes=bikeStation.state().bikes;
 if(bikes.some(b=>b.available&&b.dock!==null))add('bikes','PubliBike station',bikeStation.center);
 for(const b of bikes)if(b.available&&b.dock===null)add(`bike-${b.id}`,'Parked PubliBike',b);
 if(transport.scooterPickup.visible)add('scooter','E-scooter',transport.scooterPoint);
 const tram=transport.state();
 if(!tram.derailed&&(!tram.departed||tram.arrived))add('tram','Tram boarding',transport.cars[0].position);
 return markers;
}
