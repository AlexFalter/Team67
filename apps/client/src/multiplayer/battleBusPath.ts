import * as THREE from "three";
import { zurichWorld, type MovementWorld } from "@race/shared";

export interface BusPaths { arrival: number[][]; departure: number[][] }

export function battleBusPaths(origin: THREE.Vector3): BusPaths {
  // Translate the authored route to the new landing. Raise the final approach
  // guide by 4 m to clear the nearby obstacle before descending.
  const offset = origin.clone().sub(new THREE.Vector3(-196.4471180610466, 8.022028236713115, 10.75418563663678));
  const translate = (points: number[][]) => points.map(point => new THREE.Vector3(...point).add(offset).toArray());
  return {
    arrival: [...translate([[-147.45, 144.08, 1183.91], [-158.6, 73.73, 511.55], [-121.5, 51.5, 317.71], [-119.68, 39.96, 115.53]]), origin.toArray()],
    departure: [origin.toArray(), ...translate([[-134.84, 80, 10.75], [-85.99, 110.55, -70.22], [163.12, 143.5, -113.51], [681.59, 220, 79.54]])],
  };
}

// A clamped cubic B-spline rounds the guide points without Catmull-Rom's
// overshoot or acceleration jumps at waypoints. Only the endpoints are exact.
class BusCurve extends THREE.Curve<THREE.Vector3> {
  private points: THREE.Vector3[];
  private knots: number[];
  private degree: number;
  constructor(points: number[][]) {
    super();
    this.points = points.map(point => new THREE.Vector3(...point));
    this.degree = Math.min(3, points.length - 1);
    const parameters = [0];
    for (let i = 1; i < points.length; i++) parameters.push(parameters[i - 1] + this.points[i].distanceTo(this.points[i - 1]));
    const length = parameters.at(-1)!;
    parameters.forEach((v, i) => parameters[i] = v / length);
    this.knots = Array(this.degree + 1).fill(0);
    for (let j = 1; j < points.length - this.degree; j++) {
      this.knots.push(parameters.slice(j, j + this.degree).reduce((sum, v) => sum + v, 0) / this.degree);
    }
    this.knots.push(...Array(this.degree + 1).fill(1));
    this.arcLengthDivisions = 1024;
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    const u = THREE.MathUtils.clamp(t, 0, 1), degree = this.degree;
    let span = degree;
    while (span < this.points.length - 1 && u >= this.knots[span + 1]) span++;
    const work = Array.from({ length: degree + 1 }, (_, j) => this.points[span - degree + j].clone());
    for (let r = 1; r <= degree; r++) for (let j = degree; j >= r; j--) {
      const i = span - degree + j;
      const alpha = (u - this.knots[i]) / (this.knots[i + degree - r + 1] - this.knots[i]);
      work[j].lerp(work[j - 1], 1 - alpha);
    }
    return target.copy(work[degree]);
  }
}

export function busCurve(points: number[][]): THREE.Curve<THREE.Vector3> { return new BusCurve(points); }

export function busParkingHeading(paths: BusPaths, fallback: number) {
  const end = new THREE.Vector3(...paths.arrival.at(-1)!);
  // A vertical final segment retains the last meaningful horizontal approach.
  for (let i = paths.arrival.length - 2; i >= 0; i--) {
    const direction = end.clone().sub(new THREE.Vector3(...paths.arrival[i]));
    if (Math.hypot(direction.x, direction.z) > 1) return Math.atan2(-direction.x, -direction.z);
  }
  return fallback;
}

export function busFlightProgress(time: number) { return THREE.MathUtils.smootherstep(time, 0, 1); }

export function busPathPose(curve: THREE.Curve<THREE.Vector3>, progress: number, heading: number, departing = false) {
  const u = THREE.MathUtils.clamp(progress, 0, 1);
  const position = curve.getPointAt(u);
  // Look along a 70 m stretch instead of chasing tiny changes in the tangent.
  const window = Math.min(.12, 35 / Math.max(curve.getLength(), 1));
  const direction = curve.getPointAt(Math.min(1, u + window)).sub(curve.getPointAt(Math.max(0, u - window)));
  const horizontal = Math.hypot(direction.x, direction.z);
  const flight = THREE.MathUtils.smootherstep(horizontal / Math.max(direction.length(), .001), .02, .2);
  const tangentYaw = horizontal > .001 ? Math.atan2(-direction.x, -direction.z) : heading;
  const turn = Math.atan2(Math.sin(tangentYaw - heading), Math.cos(tangentYaw - heading));
  const alignment = departing ? 1 - THREE.MathUtils.smootherstep(u, 0, .6) : THREE.MathUtils.smootherstep(u, .88, 1);
  const yaw = heading + turn * flight * (1 - alignment);
  const pitch = THREE.MathUtils.clamp(Math.atan2(direction.y, horizontal), -.15, .15) * flight * (1 - alignment);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  return { position, quaternion };
}

// Conservative checks against the exported 2 m grid, not an exact mesh collision proof.
export function busPathBlocked(position: THREE.Vector3, quaternion: THREE.Quaternion, world: MovementWorld = zurichWorld) {
  for (const along of [-9, 0, 9]) for (const across of [-1.7, 0, 1.7]) {
    const p = new THREE.Vector3(across, .2, along).applyQuaternion(quaternion).add(position);
    const ground = world.height(p.x, p.z);
    if ((ground !== undefined && p.y < ground - .5) || world.blocked(p.x, p.y, p.z, .8, 3.8)) return true;
  }
  return false;
}
