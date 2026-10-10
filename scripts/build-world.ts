import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

// Preprocess the checked-in map. No network requests or runtime GLB parsing on Node.
const mapPath = new URL(
  "../apps/client/public/maps/zurich/hb-eth.glb",
  import.meta.url,
);
const area = JSON.parse(
  readFileSync(
    new URL("../apps/client/src/maps/zurich/area.json", import.meta.url),
    "utf8",
  ),
);
const bytes = readFileSync(mapPath),
  jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
const bin = bytes.subarray(28 + jsonLength);
const step = 2,
  minX = area.boundsLV95[0] - area.originLV95[0],
  maxX = area.boundsLV95[2] - area.originLV95[0];
const minZ = area.originLV95[1] - area.boundsLV95[3],
  maxZ = area.originLV95[1] - area.boundsLV95[1];
const width = Math.round((maxX - minX) / step) + 1,
  depth = Math.round((maxZ - minZ) / step) + 1;
const ground = new Float32Array(width * depth).fill(-Infinity),
  roof = new Float32Array(width * depth).fill(-Infinity);
function accessor(index: number) {
  const a = gltf.accessors[index],
    v = gltf.bufferViews[a.bufferView],
    offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const elements = a.count * (a.type === "VEC3" ? 3 : 1),
    data = bin.subarray(offset, offset + elements * 4);
  return a.componentType === 5126
    ? new Float32Array(data.buffer, data.byteOffset, elements)
    : new Uint32Array(data.buffer, data.byteOffset, elements);
}
for (const mesh of gltf.meshes) {
  const target = mesh.name === "Terrain" ? ground : roof;
  for (const primitive of mesh.primitives) {
    const positions = accessor(primitive.attributes.POSITION),
      indices = accessor(primitive.indices);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const ax = positions[a],
        ay = positions[a + 1],
        az = positions[a + 2],
        bx = positions[b],
        by = positions[b + 1],
        bz = positions[b + 2],
        cx = positions[c],
        cy = positions[c + 1],
        cz = positions[c + 2];
      const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(determinant) < 1e-8) continue;
      const x0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - minX) / step)),
        x1 = Math.min(
          width - 1,
          Math.floor((Math.max(ax, bx, cx) - minX) / step),
        );
      const z0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - minZ) / step)),
        z1 = Math.min(
          depth - 1,
          Math.floor((Math.max(az, bz, cz) - minZ) / step),
        );
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const px = minX + x * step,
            pz = minZ + z * step;
          const u =
              ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / determinant,
            v = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / determinant;
          if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) {
            const y = u * ay + v * by + (1 - u - v) * cy,
              index = z * width + x;
            if (y > target[index]) target[index] = y;
          }
        }
    }
  }
}
function point(index: number) {
  return {
    x: minX + (index % width) * step,
    z: minZ + Math.floor(index / width) * step,
    y: ground[index],
  };
}
function clear(index: number, radius = 2) {
  const x = index % width,
    z = Math.floor(index / width),
    cells = Math.ceil(radius / step);
  for (let dz = -cells; dz <= cells; dz++)
    for (let dx = -cells; dx <= cells; dx++) {
      const nx = x + dx,
        nz = z + dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= depth) return false;
      const i = nz * width + nx;
      if (!Number.isFinite(ground[i]) || roof[i] > ground[i] + 1.5)
        return false;
    }
  return true;
}
function closest(x: number, z: number, radius: number) {
  let best = -1,
    distance = Infinity;
  for (let i = 0; i < ground.length; i++) {
    const p = point(i),
      d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < distance && clear(i, radius)) {
      distance = d;
      best = i;
    }
  }
  if (best < 0) throw new Error("No clear ground found");
  return best;
}
const hb = area.landmarks["Zurich HB"],
  eth = area.landmarks["ETH Zentrum"];
const spawnIndex = closest(
  hb[0] - area.originLV95[0],
  area.originLV95[1] - hb[1],
  7,
);
const spawn = point(spawnIndex),
  start = closest(spawn.x + 8, spawn.z + 4, 3),
  end = closest(eth[0] - area.originLV95[0], area.originLV95[1] - eth[1], 3);
const walkable = new Uint8Array(ground.length);
for (let i = 0; i < ground.length; i++) walkable[i] = clear(i, 1.5) ? 1 : 0;
// Uniform-cost grid search: preserves clearance at corners and stays on terrain.
const queue = new Int32Array(ground.length),
  previous = new Int32Array(ground.length).fill(-1);
let head = 0,
  tail = 0;
queue[tail++] = start;
previous[start] = start;
while (head < tail && previous[end] === -1) {
  const current = queue[head++],
    x = current % width,
    z = Math.floor(current / width);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx,
      nz = z + dz;
    if (nx < 0 || nx >= width || nz < 0 || nz >= depth) continue;
    const next = nz * width + nx;
    if (
      previous[next] !== -1 ||
      !walkable[next] ||
      Math.abs(ground[next] - ground[current]) > 2.5
    )
      continue;
    previous[next] = current;
    queue[tail++] = next;
  }
}
if (previous[end] === -1)
  throw new Error(
    "No clear shuttle route between selected stops. Adjust the stop search.",
  );
const indices: number[] = [];
for (let i = end; ; i = previous[i]) {
  indices.push(i);
  if (i === start) break;
}
indices.reverse();
const route = indices
  .filter(
    (_, i) =>
      i === 0 ||
      i === indices.length - 1 ||
      indices[i] - indices[i - 1] !== indices[i + 1] - indices[i],
  )
  .map(point);
const carts = [
  [-6, 0],
  [0, -6],
  [6, 0],
].map(([dx, dz]) => point(closest(spawn.x + dx, spawn.z + dz, 2)));
function encode(values: Float32Array) {
  const buffer = Buffer.alloc(values.length * 2);
  for (let i = 0; i < values.length; i++)
    buffer.writeUInt16LE(
      Number.isFinite(values[i])
        ? Math.max(0, Math.min(65534, Math.round(values[i] * 100)))
        : 65535,
      i * 2,
    );
  return buffer.toString("base64");
}
const data = {
  sourceHash: createHash("sha256").update(bytes).digest("hex"),
  origin: area.originLV95,
  minX,
  maxX,
  minZ,
  maxZ,
  step,
  width,
  depth,
  ground: encode(ground),
  roof: encode(roof),
  spawn,
  carts,
  stops: [point(start), point(end)],
  route,
};
const output = new URL(
  "../packages/shared/src/zurich-world.json",
  import.meta.url,
);
mkdirSync(new URL("../packages/shared/src/", import.meta.url), {
  recursive: true,
});
writeFileSync(output, JSON.stringify(data) + "\n");
console.log(
  `World: ${width}x${depth} cells; spawn ${JSON.stringify(spawn)}; ${route.length} shuttle waypoints. Generated from checked-in GLB.`,
);
