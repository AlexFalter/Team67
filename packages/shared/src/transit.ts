import routes from "./transit-routes.json";
import type { GroundPoint } from "./world.ts";
import type { VehicleState } from "./types.ts";

export const TRAM_KIND = 5, POLYBAHN_KIND = 6;
export const TRANSIT_BOARDING_MS = 5000, TRANSIT_DOOR_MS = 900;
export const isRail = (v: Pick<VehicleState, "kind">) => v.kind === TRAM_KIND || v.kind === POLYBAHN_KIND;
export const isPassengerVehicle = (v: Pick<VehicleState, "kind">) => v.kind === 1 || isRail(v);
export const isRideable = (v: Pick<VehicleState, "kind">) => v.kind < 3 || isRail(v);
export const transitName = (v: Pick<VehicleState, "kind">) => v.kind === POLYBAHN_KIND ? "Polybahn" : "Tram";
function path(points: readonly GroundPoint[]) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z));
  return { points, distances, length: distances.at(-1)! };
}
export const tramPath = path(routes.tram), polybahnPath = path(routes.polybahn);
export const polybahnPlatforms: readonly GroundPoint[] = routes.polybahnPlatforms;
export function railPath(v: Pick<VehicleState, "kind">) { return v.kind === TRAM_KIND ? tramPath : polybahnPath; }
export function railFrame(v: Pick<VehicleState, "kind" | "railDistance" | "railLane">, part = 0) {
  const route = railPath(v), d = Math.max(0, Math.min(route.length, v.railDistance - part * 7));
  function sample(distance: number) {
    let lo = 0, hi = route.points.length - 2;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (route.distances[mid] <= distance) lo = mid; else hi = mid - 1;
    }
    const i = lo;
    const a = route.points[i], b = route.points[i + 1];
    const t = Math.max(0, Math.min(1, (distance - route.distances[i]) / (route.distances[i + 1] - route.distances[i])));
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    if (v.kind === POLYBAHN_KIND) {
      const phase = Math.max(0, Math.min(1, (distance / route.length - 0.3) / 0.4));
      const lane = Math.sin(Math.PI * phase) ** 2 * v.railLane, length = Math.hypot(b.x - a.x, b.z - a.z);
      p.x += (b.z - a.z) / length * lane; p.z -= (b.x - a.x) / length * lane;
    }
    return p;
  }
  const p = sample(d), a = sample(Math.max(0, d - 0.8)), b = sample(Math.min(route.length, d + 0.8));
  return { ...p, rotY: Math.atan2(b.x - a.x, b.z - a.z), pitch: -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) };
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
  const s = railSeat(v, seat), f = railFrame(v, s.part);
  const y = s.y * Math.cos(f.pitch) - s.z * Math.sin(f.pitch), z = s.y * Math.sin(f.pitch) + s.z * Math.cos(f.pitch);
  out.x = f.x + s.x * Math.cos(f.rotY) + z * Math.sin(f.rotY);
  out.y = f.y + y; out.z = f.z - s.x * Math.sin(f.rotY) + z * Math.cos(f.rotY);
}
export function passengerYaw(v: VehicleState, seat: number) { return isRail(v) ? railFrame(v, railSeat(v, seat).part).rotY + railSeat(v, seat).yaw : v.rotY; }
export function railBoardingPoint(v: VehicleState) {
  if (v.kind === POLYBAHN_KIND) return polybahnPlatforms[v.railDistance > polybahnPath.length / 2 ? 1 : 0];
  const f = railFrame(v, 1);
  return { x: f.x + Math.cos(f.rotY) * 2.3, y: f.y, z: f.z - Math.sin(f.rotY) * 2.3 };
}
export function railTripDuration(v: Pick<VehicleState, "kind">) {
  const length = railPath(v).length - (v.kind === TRAM_KIND ? 14 : 0), maxSpeed = v.kind === TRAM_KIND ? 12 : 8, acceleration = 2.5;
  const ramp = Math.min(maxSpeed / acceleration, Math.sqrt(length / acceleration));
  return (length / (acceleration * ramp) + ramp) * 1000;
}
export function railMotion(v: VehicleState, now: number) {
  const length = railPath(v).length, low = v.kind === TRAM_KIND ? 14 : 0, travel = length - low;
  const duration = railTripDuration(v) / 1000, ramp = Math.min((v.kind === TRAM_KIND ? 12 : 8) / 2.5, Math.sqrt(travel / 2.5));
  const t = Math.max(0, Math.min(duration, (now - v.tripStartedAt) / 1000));
  const distance = t < ramp ? 1.25 * t * t : t > duration - ramp ? travel - 1.25 * (duration - t) ** 2 : 1.25 * ramp * ramp + 2.5 * ramp * (t - ramp);
  v.railDistance = v.railReverse ? length - distance : low + distance;
  const frame = railFrame(v); Object.assign(v, frame);
  const speed = 2.5 * Math.min(t, ramp, duration - t) * (v.railReverse ? -1 : 1);
  v.vx = Math.sin(frame.rotY) * speed; v.vz = Math.cos(frame.rotY) * speed;
}

// Localised Polybahn tunnel and station access, matching visual passage floors.
export const polybahnPassages = [
  ...routes.polybahn.slice(1).map((b, i) => ({ a: routes.polybahn[i], b, width: 3.6 })),
  ...polybahnPlatforms.map((a, i) => ({ a, b: routes.polybahn[i ? routes.polybahn.length - 1 : 0], width: 2.1 })),
];
export function passageFloor(x: number, z: number) {
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
