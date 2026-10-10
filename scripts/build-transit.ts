import { readFileSync, writeFileSync } from "node:fs";
import { Mesh, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { accelerateMapRaycasts } from "../apps/client/src/multiplayer/mapRaycast.ts";
import { zurichWorld, zurichNativeHeight, zurichNativeBlocked } from "../packages/shared/src/world.ts";
import tram from "../packages/shared/src/tram-source.json";
import polybahn from "../packages/shared/src/polybahn-source.json";
const world = { ...zurichWorld, height: zurichNativeHeight, blocked: zurichNativeBlocked };

// Resolve prototype coordinates against the shipped map, once, offline.
const bytes = readFileSync("apps/client/public/maps/zurich/zurich.glb");
const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
scene.updateMatrixWorld(true);
const dispose = accelerateMapRaycasts(scene);
const ground: Mesh[] = [];
scene.traverse(o => { if (o instanceof Mesh && /ground/i.test(o.name + o.parent?.name)) ground.push(o); });
const ray = new Raycaster(); ray.firstHitOnly = true;
function height(x: number, z: number) {
  ray.set(new Vector3(x, 300, z), new Vector3(0, -1, 0));
  let y = ray.intersectObjects(ground)[0]?.point.y ?? world.height(x, z);
  // Exported terrain has holes below building footprints. Interpolate the
  // closest surrounding native terrain for the funicular passage floor.
  for (let r = 2; y === undefined && r <= 60; r += 2) {
    const values: number[] = [];
    for (let a = 0; a < 32; a++) {
      const px = x + Math.cos(a * Math.PI / 16) * r, pz = z + Math.sin(a * Math.PI / 16) * r;
      const h = world.height(px, pz); if (h !== undefined) values.push(h);
    }
    if (values.length) y = values.reduce((sum, h) => sum + h, 0) / values.length;
  }
  if (y === undefined) throw Error(`Missing transit ground at ${x},${z}`);
  return Math.round(y * 1000) / 1000;
}
const point = (p: number[]) => ({ x: p[0], y: height(p[0], p[1]), z: p[1] });
function clear(x: number, z: number, radius: number) {
  const y = world.height(x, z);
  return y !== undefined && !world.blocked(x, y, z, radius, 3.4);
}
function nearest(p: number[], radius: number) {
  for (let r = 0; r <= 60; r += 2) for (let a = 0; a < 16; a++) {
    const x = Math.round((p[0] + Math.cos(a * Math.PI / 8) * r) / 2) * 2;
    const z = Math.round((p[1] + Math.sin(a * Math.PI / 8) * r) / 2) * 2;
    if (clear(x, z, radius)) return { x, y: height(x, z), z };
  }
  throw Error("No clear transit stop");
}
// Four-neighbour breadth-first routing uses the same ground and obstacle mask
// as multiplayer movement. Each car follows this path rather than cutting corners.
const start = nearest(tram.points[0], 2.0), end = nearest(tram.points.at(-1)!, 2.0);
const key = (x: number, z: number) => `${x},${z}`;
const previous = new Map<string, string | null>([[key(start.x, start.z), null]]);
const queue = [start]; let found = false;
for (let i = 0; i < queue.length; i++) {
  const p = queue[i];
  if (p.x === end.x && p.z === end.z) { found = true; break; }
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
    const x = p.x + dx, z = p.z + dz, k = key(x, z), y = world.height(x, z);
    if (previous.has(k) || !clear(x, z, 2.0) || y === undefined || Math.abs(y - p.y) > 1.2) continue;
    previous.set(k, key(p.x, p.z)); queue.push({ x, y, z });
  }
}
if (!found) throw Error("No clear tram route");
const route = []; let k: string | null = key(end.x, end.z);
while (k) { const [x, z] = k.split(",").map(Number); route.unshift({ x, y: height(x, z), z }); k = previous.get(k)!; }
function lineClear(a: typeof start, b: typeof start) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2);
  let previousY = a.y;
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const y = world.height(x, z);
    if (!clear(x, z, 2.0) || y === undefined || Math.abs(y - previousY) > 0.7) return false;
    previousY = y;
  }
  return true;
}
// String-pull the grid path, then round its meaningful bends. Validate the
// complete curve, so smoothing cannot push the tram through a building.
const corners = [route[0]];
for (let i = 0; i < route.length - 1;) {
  let next = i + 1;
  for (let j = route.length - 1; j > next; j--) if (lineClear(route[i], route[j])) { next = j; break; }
  corners.push(route[next]); i = next;
}
const smooth = [corners[0]];
for (let i = 1; i < corners.length - 1; i++) {
  const a = corners[i - 1], b = corners[i], c = corners[i + 1];
  const before = Math.hypot(b.x - a.x, b.z - a.z), after = Math.hypot(c.x - b.x, c.z - b.z);
  let rounded = false;
  for (const radius of [8, 4, 2, 1]) {
    const r = Math.min(radius, before * 0.4, after * 0.4);
    const entry = { x: b.x + (a.x - b.x) * r / before, z: b.z + (a.z - b.z) * r / before };
    const exit = { x: b.x + (c.x - b.x) * r / after, z: b.z + (c.z - b.z) * r / after };
    const samples = Array.from({ length: Math.ceil(r * 4) + 1 }, (_, j) => j);
    const curve = samples.map((_, j) => {
      const t = j / (samples.length - 1), u = 1 - t;
      const x = u * u * entry.x + 2 * u * t * b.x + t * t * exit.x;
      const z = u * u * entry.z + 2 * u * t * b.z + t * t * exit.z;
      return { x, y: world.height(x, z) ?? NaN, z };
    });
    if (curve.every(p => Number.isFinite(p.y) && clear(p.x, p.z, 2.0)) && lineClear(smooth.at(-1)!, curve[0])) {
      smooth.push(...curve); rounded = true; break;
    }
  }
  if (!rounded) smooth.push(b);
}
smooth.push(corners.at(-1)!);
const tramRoute = [smooth[0]];
for (let i = 1; i < smooth.length; i++) {
  const a = smooth[i - 1], b = smooth[i], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2);
  for (let j = 1; j <= steps; j++) {
    const x = a.x + (b.x - a.x) * j / steps, z = a.z + (b.z - a.z) * j / steps;
    const y = world.height(x, z); if (y === undefined) throw Error("Smoothed tram left terrain");
    tramRoute.push({ x, y, z });
  }
}
const polybahnRoute = polybahn.points.map(point);
const platforms = [nearest(polybahn.points[0], 1.2), nearest(polybahn.points.at(-1)!, 1.2)];
writeFileSync("packages/shared/src/transit-routes.json", JSON.stringify({ tram: tramRoute, polybahn: polybahnRoute, polybahnPlatforms: platforms }, null, 2) + "\n");
dispose();
console.log(`Tram: ${route.length} grid samples -> ${corners.length} corners -> ${tramRoute.length} smooth samples; Polybahn: ${polybahnRoute.length} nodes; station access: ${JSON.stringify(platforms)}`);

