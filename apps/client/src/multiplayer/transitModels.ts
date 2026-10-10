import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";
import { hollowBusGeometry } from "./battleBusModel.ts";

// Preserve articulated doors/wheels; batch the cabin and body by material.
function batch(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<boolean, THREE.BufferGeometry[]>(), meshes: THREE.Mesh[] = [], oldMaterials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push(object);
    const g = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const group of g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }]) {
      const part = new THREE.BufferGeometry();
      for (const key of ["position", "normal", "uv"]) {
        const a = g.attributes[key];
        if (a) part.setAttribute(key, new THREE.Float32BufferAttribute(Array.from({ length: group.count * a.itemSize }, (_, i) => a.getComponent(group.start + Math.floor(i / a.itemSize), i % a.itemSize)), a.itemSize));
        else if (key === "uv") part.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(group.count * 2), 2));
      }
      // GLTF single-material primitives can retain their original group index.
      const material = (materials[group.materialIndex ?? 0] ?? materials[0]) as THREE.MeshStandardMaterial;
      oldMaterials.add(material);
      // These prototype assets have flat material colours and no image maps.
      // Bake the palette into vertices to retain appearance in two draw calls.
      const colors = new Float32Array(group.count * 3), sourceColor = g.attributes.color;
      const palette = material.color.toArray();
      for (let i = 0; i < group.count; i++) for (let c = 0; c < 3; c++)
        colors[i * 3 + c] = palette[c] * (sourceColor?.getComponent(group.start + i, c) ?? 1);
      part.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const parts = buckets.get(material.transparent) ?? []; parts.push(part); buckets.set(material.transparent, parts);
    }
    g.dispose();
  });
  for (const m of meshes) { m.geometry.dispose(); m.removeFromParent(); }
  root.clear();
  for (const [transparent, parts] of buckets) {
    const material = new THREE.MeshStandardMaterial({ color: "white", vertexColors: true, roughness: .7, side: THREE.DoubleSide, transparent, opacity: transparent ? .22 : 1, depthWrite: !transparent });
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, material); mesh.castShadow = !transparent; root.add(mesh);
    for (const g of parts) g.dispose();
  }
  return oldMaterials;
}
function interior(car: THREE.Group, tram: boolean) {
  const group = new THREE.Group(); group.name = "Passenger cabin"; car.add(group);
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
  const floor = material("#424c57"), lining = material(tram ? "#e0e4e7" : "#ece6ce"), seats = material(tram ? "#2256a1" : "#a1804b"), metal = material("#bac1c7");
  function box(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); group.add(mesh);
  }
  if (tram) {
    box(0, .64, 0, 2.12, .08, 6.2, floor); box(0, 2.82, 0, 2.12, .035, 6.2, lining);
    for (const side of [-1, 1]) {
      box(side * 1.055, 1.13, 0, .035, .90, 6.1, lining);
      for (const z of [-2.5, -1.3, 1.4, 2.5]) {
        box(side * .76, .98, z, .52, .17, .60, seats); box(side * .76, 1.29, z + .25, .52, .60, .09, seats); box(side * .76, .79, z, .065, .3, .065, metal);
      }
      for (const z of [-.7, .7]) box(side * .44, 1.77, z, .035, 2.16, .035, metal);
      box(side * .44, 2.72, 0, .035, .035, 5.6, metal);
    }
  } else {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) { box(side * (.51 + i * .125), .985, 0, .115, .032, 3.86, seats); box(side * 1.015, 1.02 + i * .09, 0, .032, .075, 3.86, seats); }
      box(side * .96, 1.43, 0, .075, .055, 3.9, lining); box(side * 1.03, 2.17, 0, .08, .14, 4.55, lining);
    }
    for (const z of [-1.65, 0, 1.65]) box(0, 2.2, z, .12, .12, .12, lining);
  }
  // A material with no geometry has no owner after batching.
  if (!tram) { floor.dispose(); metal.dispose(); }
}
async function template(name: "tram" | "polybahn", signal: AbortSignal, baseUrl: string) {
  const response = await fetch(`${baseUrl}models/${name}.glb`, { signal });
  if (!response.ok) throw Error(`${name} download failed (${response.status})`);
  const bytes = await response.arrayBuffer(); signal.throwIfAborted();
  const { scene: source } = await new GLTFLoader().parseAsync(bytes, "");
  if (signal.aborted) { disposeMap(source); signal.throwIfAborted(); }
  const car = new THREE.Group(); car.name = name;
  source.updateMatrixWorld(true);
  if (name === "tram") {
    const volumes = [{ min: [-1.06, .62, -3.10], max: [1.06, 2.83, 3.10] }];
    for (const side of [-1, 1]) for (const z of [-2.42, -1.32, .96, 2.18]) volumes.push({ min: [side < 0 ? -1.18 : 1.04, 1.86, z - .41], max: [side < 0 ? -1.04 : 1.18, 2.54, z + .41] });
    for (const side of [-1, 1]) volumes.push({ min: [side < 0 ? -1.21 : 1.04, 1.58, -.55], max: [side < 0 ? -1.04 : 1.21, 2.49, .39] });
    for (const z of [-1, 1]) volumes.push({ min: [-.95, 1.62, z < 0 ? -3.25 : 3.09], max: [.95, 2.59, z < 0 ? -3.09 : 3.25] });
    source.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m => m.clone());
      car.add(new THREE.Mesh(hollowBusGeometry(g, volumes), mats)); g.dispose();
    });
    disposeMap(source);
  } else car.add(source);
  car.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      mat.side = THREE.DoubleSide;
      if (/glazing|windows/i.test(mat.name) && mat instanceof THREE.MeshStandardMaterial) { mat.transparent = true; mat.opacity = .22; mat.depthWrite = false; mat.metalness = 0; }
    }
  });
  const articulated: THREE.Object3D[] = [];
  if (name === "polybahn") for (const nodeName of ["Axle_front", "Axle_rear", ...[-1, 1].flatMap(side => [-1, 1].map(leaf => `Door_${side}_${leaf}`))]) {
    const o = car.getObjectByName(nodeName); if (o) { car.attach(o); articulated.push(o); o.removeFromParent(); }
  }
  interior(car, name === "tram");
  const oldMaterials = batch(car);
  for (const node of articulated) for (const material of batch(node)) oldMaterials.add(material);
  // Authored map gauge is 1 m; the prototype wheels were spaced 1.6 m apart.
  for (const node of articulated) if (node.name.startsWith("Axle_")) node.scale.x *= 1 / 1.6;
  if (articulated.length) car.add(...articulated);
  oldMaterials.forEach(material => material.dispose());
  return car;
}
function ownedClone(source: THREE.Group) {
  const clone = source.clone(true), materials = new Map<THREE.Material, THREE.Material>(), textures = new Map<THREE.Texture, THREE.Texture>();
  clone.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry = o.geometry.clone();
    const copy = (mat: THREE.Material) => {
      let result = materials.get(mat);
      if (!result) {
        result = mat.clone(); materials.set(mat, result);
        for (const [key, value] of Object.entries(result)) if (value instanceof THREE.Texture) {
          let texture = textures.get(value); if (!texture) { texture = value.clone(); textures.set(value, texture); }
          (result as unknown as Record<string, unknown>)[key] = texture;
        }
      }
      return result;
    };
    o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
  });
  return clone;
}
export async function loadTransitModels(signal: AbortSignal, baseUrl = import.meta.env.BASE_URL) {
  // Settle both loads, even when one fails, to dispose successful templates.
  const results = await Promise.allSettled([template("tram", signal, baseUrl), template("polybahn", signal, baseUrl)]);
  const error = results.find(r => r.status === "rejected");
  if (error || signal.aborted) {
    for (const r of results) if (r.status === "fulfilled") disposeMap(r.value);
    if (error?.status === "rejected") throw error.reason; signal.throwIfAborted();
  }
  const [tram, polybahn] = results.map(r => (r as PromiseFulfilledResult<THREE.Group>).value);
  return { create(tramModel: boolean) { return ownedClone(tramModel ? tram : polybahn); }, dispose() { disposeMap(tram); disposeMap(polybahn); } };
}
