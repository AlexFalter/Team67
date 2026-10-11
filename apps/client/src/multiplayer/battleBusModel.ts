import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";
import { avatar, pose } from "./avatar.ts";
import { createBody } from "@race/shared";

type Vertex = Record<string, number[]>;
type Volume = { min: number[]; max: number[] };

// Adapted from mini-games/src/vehicles/shuttle/eth-link-cabin.js.
// Clip the exterior to retain the prototype's hollow passenger cabin and doorway.
export function hollowBusGeometry(source: THREE.BufferGeometry, volumes: Volume[]) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const attributes = geometry.attributes;
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: attributes.position.count, materialIndex: 0 }];
  const buckets = new Map<number, Record<string, number[]>>();
  const interpolate = (a: Vertex, b: Vertex, t: number): Vertex => Object.fromEntries(
    Object.keys(a).map(key => [key, a[key].map((value, i) => value + (b[key][i] - value) * t)]));
  function split(poly: Vertex[], axis: number, limit: number, sign: number) {
    const inside: Vertex[] = [], outside: Vertex[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a.position[axis] - limit) * sign, db = (b.position[axis] - limit) * sign;
      (da >= 0 ? inside : outside).push(a);
      if ((da >= 0) !== (db >= 0)) {
        const vertex = interpolate(a, b, da / (da - db)); inside.push(vertex); outside.push(vertex);
      }
    }
    return { inside, outside };
  }
  function subtract(poly: Vertex[], box: Volume) {
    const result: Vertex[][] = []; let inside = poly;
    for (let axis = 0; axis < 3 && inside.length >= 3; axis++) {
      for (const [limit, sign] of [[box.min[axis], 1], [box.max[axis], -1]]) {
        if (inside.length < 3) break;
        const parts = split(inside, axis, limit, sign);
        if (parts.outside.length >= 3) result.push(parts.outside);
        inside = parts.inside;
      }
    }
    return result;
  }
  for (const group of groups) {
    const materialIndex = group.materialIndex ?? 0;
    const bucket = buckets.get(materialIndex) ?? Object.fromEntries(Object.keys(attributes).map(key => [key, [] as number[]]));
    buckets.set(materialIndex, bucket);
    for (let i = group.start; i < group.start + group.count; i += 3) {
      let polygons = [Array.from({ length: 3 }, (_, j): Vertex => Object.fromEntries(Object.entries(attributes).map(([key, a]) =>
        [key, Array.from({ length: a.itemSize }, (_, component) => a.getComponent(i + j, component))])))];
      for (const volume of volumes) polygons = polygons.flatMap(poly => subtract(poly, volume));
      for (const poly of polygons) for (let j = 1; j < poly.length - 1; j++) {
        for (const vertex of [poly[0], poly[j], poly[j + 1]]) for (const key of Object.keys(attributes)) bucket[key].push(...vertex[key]);
      }
    }
  }
  const result = new THREE.BufferGeometry();
  const joined = Object.fromEntries(Object.keys(attributes).map(key => [key, [] as number[]]));
  let start = 0;
  for (const [materialIndex, bucket] of buckets) {
    const count = bucket.position.length / 3; result.addGroup(start, count, materialIndex); start += count;
    for (const key of Object.keys(attributes)) for (const value of bucket[key]) joined[key].push(value);
  }
  for (const [key, values] of Object.entries(joined)) result.setAttribute(key, new THREE.Float32BufferAttribute(values, attributes[key].itemSize));
  result.normalizeNormals(); result.computeBoundingBox(); geometry.dispose();
  return result;
}

export async function loadBattleBusModel(signal: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}models/battle-bus.glb`, { signal });
  if (!response.ok) throw new Error(`Battle bus download failed (HTTP ${response.status}).`);
  const data = await response.arrayBuffer(); signal.throwIfAborted();
  const { scene: source } = await new GLTFLoader().parseAsync(data, "");
  if (signal.aborted) { disposeMap(source); signal.throwIfAborted(); }
  const bus = new THREE.Group(); bus.name = "Battle bus / ETH Link";
  source.updateMatrixWorld(true);
  const inverse = source.matrixWorld.clone().invert();
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    const materials = (Array.isArray(object.material) ? object.material : [object.material]).map((material: THREE.MeshStandardMaterial) => {
      const copy = material.clone(); copy.side = THREE.DoubleSide;
      if (copy.name.includes("Tinted glazing")) { copy.transparent = true; copy.opacity = 0.6; copy.depthWrite = false; copy.metalness = 0; }
      return copy;
    });
    const exterior = new THREE.Mesh(hollowBusGeometry(geometry, [
      { min: [-1.17, 0.74, -8.3], max: [1.17, 2.79, 8.3] },
      { min: [1.1, 0.74, -3.18], max: [1.7, 2.78, -2.02] },
    ]), materials);
    geometry.dispose(); exterior.castShadow = true; bus.add(exterior);
  });
  disposeMap(source);
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
  const floor = material("#414b50"), seat = material("#254858"), lining = material("#e3e8e9"), metal = material("#a0aeb4");
  const glass = new THREE.MeshStandardMaterial({ color: "#557b89", transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function box(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
    const geometry = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const bucket = batches.get(mat) ?? []; bucket.push(geometry); batches.set(mat, bucket);
  }
  box(0, 0.74, 0, 2.34, 0.08, 17.1, floor);
  for (const side of [-1, 1]) for (const z of [-5.7, -4.45, -0.85, 0.4, 3.9, 5.2, 6.5, 7.8]) {
    box(side * 0.82, 1.12, z, 0.61, 0.17, 0.66, seat);
    box(side * 0.82, 1.45, z + 0.3, 0.61, 0.65, 0.1, seat);
    box(side * 0.82, 0.93, z, 0.08, 0.28, 0.08, metal);
  }
  for (const side of [-1, 1]) for (const [z, length] of side === 1 ? [[-5.74, 5.08], [3.13, 10.3]] : [[0, 17.1]]) box(side * 1.19, 1.11, z, 0.055, 0.65, length, lining);
  for (const z of [-5.7, -0.85, 3.9, 6.5]) for (const x of [-0.46, 0.46]) box(x, 1.79, z, 0.035, 1.94, 0.035, metal);
  box(0, 2.79, 0, 2.34, 0.03, 17.1, lining);
  box(1.46, 0.46, -2.6, 0.3, 0.11, 1.12, metal);
  box(-0.72, 1.1, -7.75, 0.62, 0.15, 0.65, seat);
  box(0, 1.2, -8.2, 2.2, 0.3, 0.35, floor);
  for (const [mat, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries)!, mat); mesh.castShadow = true; bus.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  const doors = [-1, 1].map(side => {
    const leaf = new THREE.Group(); leaf.position.set(1.325, 0, -2.6 + side * 0.28);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.94, 0.56), glass); panel.position.y = 1.76; leaf.add(panel);
    for (const z of [-0.28, 0.28]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.98, 0.025), metal); frame.position.set(0, 1.76, z); leaf.add(frame);
    }
    bus.add(leaf); return { leaf, side, closedZ: leaf.position.z };
  });
  const driver = avatar("#254858");
  pose(driver, Object.assign(createBody(), { x: -0.72, y: 0.68, z: -7.75, rotY: Math.PI, vehicleId: "intro", vehicleKind: 1 }), 1);
  bus.add(driver);
  return { bus, driver, setDoor(amount: number) { for (const door of doors) door.leaf.position.z = door.closedZ + door.side * amount * 0.61; } };
}
