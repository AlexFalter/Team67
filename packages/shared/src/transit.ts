import {VEHICLE_BOARD_DISTANCE} from "./constants.ts";
import {createRailCurve,smoothRailPoints,smoothRailOffsets,passingLoopProgress} from "./rail-curve.ts";
import routes from "./transit-routes.json";
import tramHull from "./tram-hull.json";
import { zurichNativeHeight, type GroundPoint } from "./world.ts";
import type { VehicleState } from "./types.ts";

export const TRAM_KIND = 5, POLYBAHN_KIND = 6;
export const TRAM_CARRIAGE_SPACING = 8.5;
export const TRAM_START_DISTANCE = 2 * TRAM_CARRIAGE_SPACING;
// The Polybahn route starts inside the Central hall, ~2.5 m above its floor; the modelled track deck
// (sleepers, rails) begins 2.75 m up the line. The Central stop is far enough up that the whole cabin
// (±2.5 m along the track) stands on the deck instead of hanging over the hall.
export const POLYBAHN_TRACK_START = 2.75, POLYBAHN_START_DISTANCE = 5.5;
export const railStart = (v: Pick<VehicleState, "kind">) => v.kind === TRAM_KIND ? TRAM_START_DISTANCE : POLYBAHN_START_DISTANCE;
export const TRANSIT_BOARDING_MS = 5000, TRANSIT_DOOR_MS = 900;
export const TRAM_BOARDING_MS = 15000;
export const isRail = (v: Pick<VehicleState, "kind">) => v.kind === TRAM_KIND || v.kind === POLYBAHN_KIND;
export const isPassengerVehicle = (v: Pick<VehicleState, "kind">) => v.kind === 1 || isRail(v);
export const isRideable = (v: Pick<VehicleState, "kind">) => v.kind < 3 || v.kind === 7 || isRail(v);
export const transitName = (v: Pick<VehicleState, "kind">) => v.kind === POLYBAHN_KIND ? "Polybahn" : "Tram";
function path(points: readonly GroundPoint[]) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z));
  return { points, distances, length: distances.at(-1)! };
}
export const tramPath = path(routes.tram), polybahnPath = path(routes.polybahn);
const loopPeak = Math.max(...routes.polybahnOffsets);
const loopIndices = routes.polybahnOffsets.map((offset, i) => offset >= loopPeak - .2 ? i : -1).filter(i => i >= 0);
export const polybahnMeetingDistance = polybahnPath.distances[loopIndices[Math.floor(loopIndices.length / 2)]];
// Walk-up boarding belongs to the lobby floor, not the elevated cabin centre.
// These points are inside the authored Central and Polyterrasse station halls.
export const polybahnPlatforms: readonly GroundPoint[] = routes.polybahnPlatforms;
const tramCurve = createRailCurve(smoothRailPoints(tramPath.points,tramPath.distances), tramPath.distances);
const smoothOffsets=smoothRailOffsets(routes.polybahnOffsets);
const polybahnCurves=new Map<number,ReturnType<typeof createRailCurve>>();
function polybahnCurve(lane:number){
 let curve=polybahnCurves.get(lane);if(curve)return curve;
 const points=polybahnPath.points.map((p,i)=>{
  const a=polybahnPath.points[Math.max(0,i-3)],b=polybahnPath.points[Math.min(polybahnPath.points.length-1,i+3)];
  const length=Math.hypot(b.x-a.x,b.z-a.z),offset=smoothOffsets[i]*lane/1.25;
  return {x:p.x+(b.z-a.z)/length*offset,y:p.y,z:p.z-(b.x-a.x)/length*offset};
 });
 curve=createRailCurve(smoothRailPoints(points,polybahnPath.distances),polybahnPath.distances);polybahnCurves.set(lane,curve);return curve;
}
export function railPath(v: Pick<VehicleState, "kind">) { return v.kind === TRAM_KIND ? tramPath : polybahnPath; }
export function railFrame(v: Pick<VehicleState, "kind" | "railDistance" | "railLane">, part = 0) {
  const route = railPath(v), d = Math.max(0, Math.min(route.length, v.railDistance - part * TRAM_CARRIAGE_SPACING));
  function sample(distance: number) {
    if(v.kind===POLYBAHN_KIND)return polybahnCurve(v.railLane)(distance);
    return tramCurve(distance);
  }
  const p = sample(d), a = sample(Math.max(0, d - (v.kind === TRAM_KIND ? 2 : .8))), b = sample(Math.min(route.length, d + (v.kind === TRAM_KIND ? 2 : .8)));
  // Fit the funicular incline over its actual axle spacing, including bends.
  const span = v.kind === POLYBAHN_KIND ? 1.6422 : 2;
  const front = sample(Math.max(0, d - span)), rear = sample(Math.min(route.length, d + span));
  return { ...p, rotY: Math.atan2(b.x - a.x, b.z - a.z), pitch: -Math.atan2(rear.y - front.y, Math.hypot(rear.x - front.x, rear.z - front.z)) };
}
// Locate the first substantial bend from route headings, rather than map coordinates.
export const tramFirstCorner = (() => {
 const v={kind:TRAM_KIND,railLane:0,railDistance:TRAM_START_DISTANCE};
 const initial=railFrame(v).rotY;
 for(let d=TRAM_START_DISTANCE+4;d<tramPath.length;d+=1){
  v.railDistance=d;const heading=railFrame(v).rotY;
  if(Math.abs(Math.atan2(Math.sin(heading-initial),Math.cos(heading-initial)))>.45)return d;
 }
 return Infinity;
})();
type CrashFrame=ReturnType<typeof railFrame>&{roll:number;grounded:boolean;landedAt:number};
const crashTrajectories=new Map<string,(age:number)=>CrashFrame>();
export function tramDerailFrame(v:VehicleState,part=0):CrashFrame{
 const f=railFrame(v,part);
 if(v.kind!==TRAM_KIND||!v.derailStartedAt)return {...f,roll:0,grounded:false,landedAt:Infinity};
 const key=[v.railDistance,v.railLane,v.vx,v.vz,part].join(':');
 let trajectory=crashTrajectories.get(key);
 if(!trajectory){
  const incoming=railFrame({kind:v.kind,railLane:v.railLane,railDistance:tramFirstCorner-8},part);
  const speed=Math.hypot(v.vx,v.vz)||TRAM_DERAIL_SPEED;
  const heading=Math.atan2(v.vx||Math.sin(incoming.rotY)*speed,v.vz||Math.cos(incoming.rotY)*speed);
  const turn=Math.sign(Math.atan2(Math.sin(f.rotY-incoming.rotY),Math.cos(f.rotY-incoming.rotY)))||1;
  const yawDelta=Math.atan2(Math.sin(incoming.rotY-f.rotY),Math.cos(incoming.rotY-f.rotY))-turn*(.25+part*.12);
  const airborne=(age:number)=>{
   const progress=1-Math.exp(-age*2),slide=speed*(1-Math.exp(-1.6*age))/1.6;
   const roll=turn*progress*Math.PI/2,pitch=f.pitch*(1-progress);
   // Gravity acts on the centre of mass, rather than holding the model origin aloft.
   return {x:f.x+Math.sin(heading)*slide-Math.cos(heading)*turn*progress*(1.2+part*.3),
    y:f.y+1.62*Math.cos(f.pitch)+6*age-4.905*age*age-1.62*Math.cos(roll)*Math.cos(pitch),
    z:f.z+Math.cos(heading)*slide+Math.sin(heading)*turn*progress*(1.2+part*.3),
    rotY:f.rotY+progress*yawDelta,pitch,roll};
  };
  const support=(pose:ReturnType<typeof airborne>)=>{
   const cr=Math.cos(pose.roll),sr=Math.sin(pose.roll),cp=Math.cos(pose.pitch),sp=Math.sin(pose.pitch);
   const cy=Math.cos(pose.rotY+Math.PI),sy=Math.sin(pose.rotY+Math.PI);let floor=-Infinity;
   for(const [x,y,z] of tramHull){
    const rx=x*cr-y*sr,ry=x*sr+y*cr,dy=ry*cp+z*sp,rz=-ry*sp+z*cp;
    const ground=zurichNativeHeight(pose.x+rx*cy+rz*sy,pose.z-rx*sy+rz*cy)??f.y;
    floor=Math.max(floor,ground-dy);
   }
   return floor+.025;
  };
  // Find the first downward contact at a fixed physics step, shared by all clients.
  let landedAt=3;
  for(let age=.2;age<=3;age+=1/120){const pose=airborne(age);if(pose.y<=support(pose)){landedAt=age;break;}}
  const impact=airborne(landedAt),impactSpeed=speed*Math.exp(-1.6*landedAt),friction=10;
  trajectory=(age:number)=>{
   if(age<landedAt){const pose=airborne(age);if(age>0)pose.y=Math.max(pose.y,support(pose));return {...pose,grounded:false,landedAt};}
   const elapsed=age-landedAt,slideTime=Math.min(elapsed,impactSpeed/friction);
   const slide=impactSpeed*slideTime-.5*friction*slideTime*slideTime;
   const settle=Math.min(1,elapsed/.65),blend=settle*settle*(3-2*settle);
   const x=impact.x+Math.sin(heading)*slide,z=impact.z+Math.cos(heading)*slide;
   const yaw=impact.rotY+Math.PI,sy=Math.sin(yaw),cy=Math.cos(yaw);
   const height=(dx:number,dz:number)=>zurichNativeHeight(x+dx,z+dz)??f.y;
   const groundPitch=Math.atan2(height(sy*3,cy*3)-height(-sy*3,-cy*3),6);
   const groundRoll=Math.atan2(height(cy,-sy)-height(-cy,sy),2);
   const pose={...impact,x,z,
    roll:impact.roll+(turn*Math.PI/2+groundRoll-impact.roll)*blend,
    pitch:impact.pitch+(groundPitch-impact.pitch)*blend};
   // Once in contact, follow the actual lower hull until friction brings it to rest.
   pose.y=support(pose);
   return {...pose,grounded:true,landedAt};
  };
  if(crashTrajectories.size>=24)crashTrajectories.delete(crashTrajectories.keys().next().value!);
  crashTrajectories.set(key,trajectory);
 }
 return trajectory(Math.max(0,v.derailAge));
}

export function railSeat(v: VehicleState, seat: number) {
  if (v.kind === TRAM_KIND) {
    const part = [1, 0, 2][Math.floor(seat / 6)], row = Math.floor(seat % 6 / 2);
    return { part, x: seat % 2 ? -0.76 : 0.76, y: 1.065 - 0.7875, z: -[-2.5, -1.3, 2.5][row], yaw: 0 };
  }
  const left = seat < 6;
  return { part: 0, x: left ? 0.88 : -0.88, y: 1.001 - 0.7875, z: -(left ? -1.65 + seat * 0.57 : -1.35 + (seat - 6) * 0.57), yaw: left ? -Math.PI / 2 : Math.PI / 2 };
}
export function railSeatPosition(v: VehicleState, seat: number, out: GroundPoint) {
  const s = railSeat(v, seat), f = tramDerailFrame(v, s.part);
  const x=s.x*Math.cos(f.roll)+s.y*Math.sin(f.roll),sy=-s.x*Math.sin(f.roll)+s.y*Math.cos(f.roll);
  const y = sy * Math.cos(f.pitch) - s.z * Math.sin(f.pitch), z = sy * Math.sin(f.pitch) + s.z * Math.cos(f.pitch);
  out.x = f.x + x * Math.cos(f.rotY) + z * Math.sin(f.rotY);
  out.y = f.y + y; out.z = f.z - x * Math.sin(f.rotY) + z * Math.cos(f.rotY);
}
export function passengerYaw(v: VehicleState, seat: number) { return isRail(v) ? tramDerailFrame(v, railSeat(v, seat).part).rotY + railSeat(v, seat).yaw : v.rotY; }
export const railBoardingDistance = (v: Pick<VehicleState,"kind">) => v.kind === POLYBAHN_KIND ? 1 : VEHICLE_BOARD_DISTANCE;
export function railBoardingPoint(v: VehicleState) {
  if (v.kind === POLYBAHN_KIND) {
    return { ...polybahnPlatforms[v.railDistance < polybahnPath.length / 2 ? 0 : 1] };
  }
  const f = railFrame(v, 1);
  return { x: f.x + Math.cos(f.rotY) * 2.3, y: f.y, z: f.z - Math.sin(f.rotY) * 2.3 };
}
export function railTripDuration(v: Pick<VehicleState, "kind">) {
  const length = railPath(v).length - railStart(v), maxSpeed = v.kind === TRAM_KIND ? 12 : 8, acceleration = 2.5;
  const ramp = Math.min(maxSpeed / acceleration, Math.sqrt(length / acceleration));
  return (length / (acceleration * ramp) + ramp) * 1000;
}
export const TRAM_DERAIL_SPEED = 48;
// Reach the same crash speed gradually across the entire departure straight.
export const TRAM_DERAIL_ACCELERATION = TRAM_DERAIL_SPEED**2/(2*(tramFirstCorner-TRAM_START_DISTANCE));
export const TRAM_TRACK_ADHESION = 18;
export function tramTurnLoad(v:VehicleState){
 const a=railFrame({kind:v.kind,railLane:v.railLane,railDistance:v.railDistance-3}),b=railFrame({kind:v.kind,railLane:v.railLane,railDistance:v.railDistance+3});
 const curvature=Math.abs(Math.atan2(Math.sin(b.rotY-a.rotY),Math.cos(b.rotY-a.rotY)))/6;
 return (v.vx*v.vx+v.vz*v.vz)*curvature;
}
export function railMotion(v: VehicleState, now: number, reckless = false) {
  if(v.derailStartedAt)return;
  const length = railPath(v).length, low = railStart(v), travel = length - low;
  const duration = railTripDuration(v) / 1000, ramp = Math.min((v.kind === TRAM_KIND ? 12 : 8) / 2.5, Math.sqrt(travel / 2.5));
  const t = Math.max(0, Math.min(duration, (now - v.tripStartedAt) / 1000));
  let distance = t < ramp ? 1.25 * t * t : t > duration - ramp ? travel - 1.25 * (duration - t) ** 2 : 1.25 * ramp * ramp + 2.5 * ramp * (t - ramp);
  let approachSpeed=0;
  if(reckless&&v.kind===TRAM_KIND&&!v.railReverse){
    const cornerTravel=tramFirstCorner-low;
    const approachTime=TRAM_DERAIL_SPEED/TRAM_DERAIL_ACCELERATION;
    const elapsed=Math.min(t,approachTime);
    distance=Math.min(cornerTravel,.5*TRAM_DERAIL_ACCELERATION*elapsed**2);
    approachSpeed=TRAM_DERAIL_ACCELERATION*elapsed;
  }
  let speedScale=1;
  if (v.kind === POLYBAHN_KIND) {
    // Both cabins meet at the authored passing loop, which is off-centre.
    const meeting = polybahnMeetingDistance;
    const progress = distance / travel;
    const mapping=passingLoopProgress(v.railReverse ? 1-progress : progress,(meeting-low)/travel);
    v.railDistance=low+travel*mapping.position;speedScale=mapping.speed;
  } else v.railDistance = v.railReverse ? length - distance : low + distance;
  const frame = railFrame(v); Object.assign(v, frame);
  const speed = (approachSpeed || 2.5 * Math.min(t, ramp, duration - t)) * (v.railReverse ? -1 : 1) * speedScale;
  v.vx = Math.sin(frame.rotY) * speed; v.vz = Math.cos(frame.rotY) * speed;
}

// Localised Polybahn tunnel and station access, matching visual passage floors.
export const polybahnPassages = [
  ...routes.polybahn.slice(1).map((b, i) => ({ a: routes.polybahn[i], b, width: 3.6 })),
  ...polybahnPlatforms.map((a, i) => ({ a, b: routes.polybahn[i ? routes.polybahn.length - 1 : 0], width: 2.1 })),
];
export function passageFloor(x: number, z: number) {
  // The 2 m obstacle grid seals the facade and its exterior approach. Extend
  // only the doorway corridor far enough for the full capsule to cross it.
  // A flared street approach avoids an invisible rectangular choke point.
  // It narrows to the authored 5.6 m doorway at the facade (x=9.5).
  if (x >= 2 && x <= 9.5) {
    const t = Math.max(0, Math.min(1, (x - 2) / 7.5));
    const width = 6 - 3.2 * t * t * (3 - 2 * t);
    if (Math.abs(z - 112.5) <= width) return 8.625;
  }
  // Interior lobby slabs take precedence over the old rail-access ramp.
  if (x >= 9.5 && x <= 15.5 && z >= 108.5 && z <= 117) return 8.625;
  // Upper hall follows the final track heading; its lobby is at terrace height.
  const u = (x - 185) * .903 - (z - 75) * .430;
  const across = (x - 185) * .430 + (z - 75) * .903;
  if (u >= 4.5 && u <= 11) {
    const t = Math.max(0, Math.min(1, (u - 5.5) / 5.5));
    const width = 1.5 + 3 * t * t * (3 - 2 * t);
    // Exported doorway is offset 1.1 m from the rail/lobby reference axis.
    if (Math.abs(across + 1.1) <= width) return 48.875;
  }
  if (u >= -3 && u <= 5.5 && across >= -2.5 && across <= 2.5) return 48.875;
  let floor = 0, weight = 0;
  for (const s of polybahnPassages) {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, length = Math.hypot(dx, dz);
    const along = ((x - s.a.x) * dx + (z - s.a.z) * dz) / length;
    const across = Math.abs((-(x - s.a.x) * dz + (z - s.a.z) * dx) / length);
    if (along < -0.2 || along > length + 0.2 || across > s.width) continue;
    const w = Math.max(0.001, 1 - (across / s.width) ** 2);
    floor += (s.a.y + (s.b.y - s.a.y) * Math.max(0, Math.min(1, along / length))) * w; weight += w;
  }
  return weight ? floor / weight : undefined;
}
