import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";

// The cabinet is static. Preserve the photographic can labels, batch by material.
export function batchMateModel(source: THREE.Group) {
  source.updateMatrixWorld(true);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(object.matrixWorld);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const group of geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.attributes.position.count, materialIndex: 0 }]) {
      const material = materials[group.materialIndex ?? 0] ?? materials[0];
      const part = new THREE.BufferGeometry();
      for (const key of ["position", "normal", "uv"]) {
        const attribute = geometry.attributes[key];
        if (attribute) part.setAttribute(key, new THREE.Float32BufferAttribute(Array.from({ length: group.count * attribute.itemSize }, (_, i) => attribute.getComponent(group.start + Math.floor(i / attribute.itemSize), i % attribute.itemSize)), attribute.itemSize));
      }
      const bucket = parts.get(material) ?? []; bucket.push(part); parts.set(material, bucket);
    }
    geometry.dispose();
    object.geometry.dispose();
  });
  const root = new THREE.Group(); root.name = source.name;
  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries)!, material); mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh); geometries.forEach(g => g.dispose());
  }
  source.clear(); // Materials/textures now belong to the merged model.
  return root;
}
export async function loadMateModel(name: "mate-machine" | "mate-can-mint", signal: AbortSignal, baseUrl = import.meta.env.BASE_URL) {
  const response = await fetch(`${baseUrl}models/${name}.glb`, { signal });
  if (!response.ok) throw Error(`${name} download failed (${response.status})`);
  const bytes = await response.arrayBuffer(); signal.throwIfAborted();
  const { scene } = await new GLTFLoader().parseAsync(bytes, "");
  if (signal.aborted) { disposeMap(scene); signal.throwIfAborted(); }
  return batchMateModel(scene);
}
