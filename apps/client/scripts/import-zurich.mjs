/** Import the official city surfaces, crop in metres, and produce an offline GLB. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const area = JSON.parse(await readFile(new URL('../src/maps/zurich/area.json', import.meta.url), 'utf8'));
const output = new URL('../public/maps/zurich/', import.meta.url);
const [minE, minN, maxE, maxN] = area.boundsLV95;
const [originE, originN, originH] = area.originLV95;
const bounds = [minE - originE, originN - maxN, maxE - originE, originN - minN];
const buffers = [];
const bufferViews = [];
const accessors = [];
const meshes = [];
const counts = [];
let byteLength = 0;

function clip(points, axis, value, keepGreater) {
  const result = [];
  let previous = points.at(-1);
  if (!previous) return result;
  const inside = (point) => keepGreater ? point[axis] >= value : point[axis] <= value;
  for (const current of points) {
    if (inside(current) !== inside(previous)) {
      const t = (value - previous[axis]) / (current[axis] - previous[axis]);
      result.push(current.map((coordinate, i) => previous[i] + t * (coordinate - previous[i])));
    }
    if (inside(current)) result.push(current);
    previous = current;
  }
  return result;
}

function triangulate(rings, positions) {
  const local = rings.map((ring) => {
    const points = ring.map(([e, n, h]) => {
      if (![e, n, h].every(Number.isFinite)) throw new Error('Expected 3D LV95 coordinates.');
      return [e - originE, h - originH, originN - n];
    });
    if (points.length > 1 && points[0].every((v, i) => v === points.at(-1)[i])) points.pop();
    return points;
  }).filter((ring) => ring.length >= 3);
  if (!local.length) return;
  // Project each planar face onto its strongest plane; this preserves vertical walls.
  const normal = [0, 0, 0];
  const exterior = local[0];
  for (let i = 0; i < exterior.length; i++) {
    const a = exterior[i], b = exterior[(i + 1) % exterior.length];
    normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  if (Math.hypot(...normal) < 1e-8) return;
  const dominant = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  const axes = [0, 1, 2].filter((axis) => axis !== dominant);
  const projected = local.map((ring) => ring.map((p) => new Vector2(p[axes[0]], p[axes[1]])));
  const points = local.flat();
  for (const triangle of ShapeUtils.triangulateShape(projected[0], projected.slice(1))) {
    let polygon = triangle.map((index) => points[index]);
    polygon = clip(polygon, 0, bounds[0], true);
    polygon = clip(polygon, 0, bounds[2], false);
    polygon = clip(polygon, 2, bounds[1], true);
    polygon = clip(polygon, 2, bounds[3], false);
    for (let i = 1; i < polygon.length - 1; i++) {
      let [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
      const ab = b.map((v, k) => v - a[k]), ac = c.map((v, k) => v - a[k]);
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      if (Math.hypot(...cross) < 1e-8) continue;
      if (cross.reduce((sum, v, k) => sum + v * normal[k], 0) < 0) [b, c] = [c, b];
      positions.push(...a, ...b, ...c);
    }
  }
}

function attribute(array, min, max) {
  const data = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const view = bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, target: 34962 }) - 1;
  buffers.push(data); byteLength += data.length;
  return accessors.push({ bufferView: view, componentType: 5126, count: array.length / 3, type: 'VEC3',
    ...(min ? { min, max } : {}) }) - 1;
}

for (const [index, source] of area.sources.entries()) {
  // Optional input files permit repeatable conversion without another download.
  const file = process.argv[index + 2];
  let data;
  const url = new URL(source.service);
  // A little padding catches faces of buildings crossing the final crop boundary.
  url.search = new URLSearchParams({ SERVICE: 'WFS', VERSION: '1.1.0', REQUEST: 'GetFeature',
    TYPENAME: source.typeName, SRSNAME: 'EPSG:2056',
    BBOX: `${minE - 100},${minN - 100},${maxE + 100},${maxN + 100},EPSG:2056`,
    OUTPUTFORMAT: 'application/vnd.geo+json' }).toString();
  if (file) data = JSON.parse(await readFile(file, 'utf8'));
  else {
    console.log(`Fetching official ${source.name.toLowerCase()}…`);
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
    data = await response.json();
  }
  if (!Array.isArray(data.features) || !data.crs?.properties?.name?.endsWith('2056')) throw new Error('Expected an EPSG:2056 feature collection.');
  const positions = [];
  for (const feature of data.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === 'Polygon') triangulate(geometry.coordinates, positions);
    else if (geometry.type === 'MultiPolygon') for (const rings of geometry.coordinates) triangulate(rings, positions);
    else throw new Error(`Unsupported geometry: ${geometry.type}`);
  }
  if (!positions.length) throw new Error(`${source.name} produced no triangles; check the crop and source coordinates.`);
  let geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const original = geometry;
  geometry = mergeVertices(original, 0.001);
  original.dispose();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const position = attribute(geometry.getAttribute('position').array, box.min.toArray(), box.max.toArray());
  const normal = attribute(geometry.getAttribute('normal').array);
  // Always use 32-bit indices so the binary chunk stays four-byte aligned.
  const indices = Uint32Array.from(geometry.index.array);
  const indexData = Buffer.from(indices.buffer);
  const indexView = bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: indexData.length, target: 34963 }) - 1;
  buffers.push(indexData); byteLength += indexData.length;
  const indexAccessor = accessors.push({ bufferView: indexView, componentType: 5125, count: indices.length, type: 'SCALAR' }) - 1;
  meshes.push({ name: source.name, primitives: [{ attributes: { POSITION: position, NORMAL: normal }, indices: indexAccessor, material: index }] });
  counts.push({ name: source.name, sourceFeatures: data.features.length, triangles: positions.length / 9 });
  geometry.dispose();
}

const gltf = {
  asset: { version: '2.0', generator: 'Team67 official Zürich map importer', copyright: 'Stadt Zürich, Geomatik + Vermessung — CC0' },
  scene: 0, scenes: [{ nodes: meshes.map((_, i) => i) }], nodes: meshes.map((mesh, i) => ({ name: mesh.name, mesh: i })),
  meshes, materials: [
    { name: 'Buildings', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.76, 0.78, 0.8, 1], metallicFactor: 0, roughnessFactor: 1 } },
    { name: 'Terrain', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.36, 0.44, 0.39, 1], metallicFactor: 0, roughnessFactor: 1 } },
  ], buffers: [{ byteLength }], bufferViews, accessors,
};
const json = Buffer.from(JSON.stringify(gltf));
const jsonChunk = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(jsonChunk);
const bin = Buffer.concat(buffers);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonChunk.length + bin.length, 8);
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonChunk.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
await mkdir(output, { recursive: true });
await writeFile(new URL('hb-eth.glb', output), Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin]));
await writeFile(new URL('provenance.json', output), JSON.stringify({ importedAt: new Date().toISOString(),
  license: 'CC0-1.0', ...area, layers: counts }, null, 2) + '\n');
console.log(`Saved ${(bin.length / 1024 / 1024).toFixed(1)} MiB map.`, counts);
