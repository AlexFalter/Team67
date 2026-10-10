import { readFileSync, writeFileSync } from "node:fs";
import { Mesh, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { accelerateMapRaycasts } from "../apps/client/src/multiplayer/mapRaycast.ts";
import { zurichWorld, zurichNativeHeight, zurichNativeBlocked } from "../packages/shared/src/world.ts";
import tram from "../packages/shared/src/tram-source.json";
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
// Follow the actual street corridor, not a shortest path across open ground.
const road = (x: number, z: number) => {
  ray.set(new Vector3(x, 300, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObjects(ground)[0];
  if (!hit) return false;
  const mesh = hit.object as Mesh, materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return /G_(Road|Rail)$/.test((materials[hit.face!.materialIndex] ?? materials[0]).name);
};
const route: { x: number; y: number; z: number }[] = [];
for (let i = 1; i < tram.points.length; i++) {
  const a = tram.points[i - 1], b = tram.points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / length, nz = (b[0] - a[0]) / length;
  for (let j = i === 1 ? 0 : 1; j <= Math.ceil(length); j++) {
    const t = j / Math.ceil(length), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    let seed = 0;
    if (!road(x, z)) {
      const candidates = Array.from({ length: 81 }, (_, k) => (k - 40) * .25).sort((a, b) => Math.abs(a) - Math.abs(b));
      const found = candidates.find(offset => road(x + nx * offset, z + nz * offset));
      if (found === undefined) throw Error(`Tram source misses road at ${x},${z}`);
      seed = found;
    }
    let left = seed, right = seed;
    while (left > -24 && road(x + nx * (left - .25), z + nz * (left - .25))) left -= .25;
    while (right < 24 && road(x + nx * (right + .25), z + nz * (right + .25))) right += .25;
    // Wide junctions have no unique street centre; keep the mapped rail alignment.
    const offset = right - left <= 22 ? (left + right) / 2 : seed;
    route.push(point([x + nx * offset, z + nz * offset]));
  }
}
// Smooth in metres over repeated passes, including the first departure bend.
// Validate each candidate against the existing street and building clearance.
let smooth = route;
for (let pass = 0; pass < 3; pass++) {
  smooth = smooth.map((p, i, points) => {
    if (i === 0 || i === points.length - 1) return p;
    let x = 0, z = 0, weight = 0;
    for (let j = Math.max(0, i - 12); j <= Math.min(points.length - 1, i + 12); j++) {
      const q = points[j], distance = Math.hypot(q.x - p.x, q.z - p.z);
      const w = Math.exp(-distance * distance / 32);
      x += q.x * w; z += q.z * w; weight += w;
    }
    x /= weight; z /= weight;
    return road(x, z) && clear(x, z, 1.5) ? point([x, z]) : p;
  });
}
const tramRoute = [smooth[0]];
for (let i = 1; i < smooth.length; i++) {
  const a = smooth[i - 1], b = smooth[i], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2);
  for (let j = 1; j <= steps; j++) {
    const x = a.x + (b.x - a.x) * j / steps, z = a.z + (b.z - a.z) * j / steps;
    const y = height(x, z);
    tramRoute.push({ x, y, z });
  }
}
// Recover the rail tops from the authored map. Ground raycasts under the
// elevated bridge put cabins below the rails; the old OSM curve also misses its loop.
const bins = new Map<number, { z: number; y: number }[]>();
scene.traverse(o => {
  if (!(o instanceof Mesh)) return;
  const materials = Array.isArray(o.material) ? o.material : [o.material];
  const g = o.geometry, positions = g.attributes.position, index = g.index;
  for (const group of g.groups.length ? g.groups : [{ start: 0, count: index?.count ?? positions.count, materialIndex: 0 }]) {
    if ((materials[group.materialIndex ?? 0] ?? materials[0]).name !== "G_Metal") continue;
    for (let i = group.start; i < group.start + group.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(o.matrixWorld);
      if (p.x < 15 || p.x > 178 || p.z < 73 || p.z > 116 || p.y > 46) continue;
      const k = Math.round(p.x), values = bins.get(k) ?? [];
      values.push({ z: p.z, y: p.y }); bins.set(k, values);
    }
  }
});
const polybahnOffsets: number[] = [];
const rawPolybahnRoute = Array.from({ length: 155 }, (_, i) => {
  const x = i + 20, values = bins.get(x) ?? bins.get(x - 1) ?? bins.get(x + 1);
  if (!values?.length) throw Error(`Missing authored Polybahn rails at x=${x}`);
  const low = Math.min(...values.map(p => p.z)), high = Math.max(...values.map(p => p.z));
  polybahnOffsets.push(Math.max(0, (high - low - 1.07) / 2));
  return { x, y: Math.max(...values.map(p => p.y)), z: (low + high) / 2 };
});
// Quantised rail vertices need a short smoothing window for stable cabin pitch.
const polybahnRoute = rawPolybahnRoute.map((p, i) => {
  // Preserve endpoint slope: a truncated average lifts the lower stop and flattens its pitch.
  if (i < 2 || i >= rawPolybahnRoute.length - 2) return p;
  const window = rawPolybahnRoute.slice(i - 2, i + 3);
  return { x: p.x, y: window.reduce((n, q) => n + q.y, 0) / window.length, z: window.reduce((n, q) => n + q.z, 0) / window.length };
});
// Dock the entire cabin inside each hall, rather than at its exterior threshold.
// The lower hall's exported rails stop at the facade; scenery supplies this short continuation.
const first = polybahnRoute[0], next = polybahnRoute[5];
for (let x = 19; x >= 16; x--) {
  const t = (x - first.x) / (next.x - first.x);
  polybahnRoute.unshift({x, y: first.y + (next.y - first.y) * t, z: first.z + (next.z - first.z) * t});
  polybahnOffsets.unshift(0);
}
const last = polybahnRoute.at(-1)!, previous = polybahnRoute.at(-6)!;
for (let x = 175; x <= 177; x++) {
  const t = (x - last.x) / (last.x - previous.x);
  polybahnRoute.push({x, y: last.y + (last.y - previous.y) * t, z: last.z + (last.z - previous.z) * t});
  polybahnOffsets.push(0);
}
// Interior lobby slabs measured from G_StationFloor in the shipped GLB.
const platforms = [{x:12.5,y:8.625,z:114},{x:185,y:48.875,z:75}];
writeFileSync("packages/shared/src/transit-routes.json", JSON.stringify({ tram: tramRoute, polybahn: polybahnRoute, polybahnOffsets, polybahnPlatforms: platforms }, null, 2) + "\n");
dispose();
console.log(`Tram: ${route.length} road samples -> street-centred -> ${tramRoute.length} smooth samples; Polybahn: ${polybahnRoute.length} nodes; station access: ${JSON.stringify(platforms)}`);

