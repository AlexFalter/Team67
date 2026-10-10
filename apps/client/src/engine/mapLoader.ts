import { InstancedMesh, Mesh, Texture, type BufferGeometry, type Material, type Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import area from "../maps/zurich/area.json";
import { applyTheme, type MapTheme } from "../maps/zurich/theme";
import { loadTrees } from "../maps/zurich/loadTrees";
import { loadProps } from "../maps/zurich/loadProps";

// The download survives React StrictMode's mount/unmount/mount and inspect ↔ play switches.
let bytes: Promise<ArrayBuffer> | undefined;
const listeners = new Set<(fraction: number) => void>();

function download() {
  bytes ??= (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}${area.asset}`);
    if (!response.ok || !response.body) throw new Error(`Map download failed (HTTP ${response.status}).`);
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (total) for (const l of listeners) l(received / total);
    }
    const out = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
    return out.buffer;
  })().catch(error => { bytes = undefined; throw error; });
  return bytes;
}

/** Load map + trees, theme them, and BVH-index the map meshes for camera raycasts. */
export async function loadMap(theme: MapTheme, signal: AbortSignal, progress: (fraction: number, label: string) => void) {
  const onDownload = (f: number) => progress(f * 0.85, "Downloading Zürich");
  listeners.add(onDownload);
  let data: ArrayBuffer;
  try { data = await download(); } finally { listeners.delete(onDownload); }
  signal.throwIfAborted();
  progress(0.87, "Building the city");
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, "");
  const map = gltf.scene;
  try {
    signal.throwIfAborted();
    // Exporter min/max can be slightly off; exact bounds keep frustum culling and raycasts correct.
    map.traverse(o => { if (o instanceof Mesh) { o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); } });
    applyTheme(map, theme);
    progress(0.92, "Planting trees");
    // Trees and street props are instanced decoration: no collision, no raycasts.
    for (const [label, load] of [["Trees", loadTrees], ["Props", loadProps]] as const) {
      try { map.add(await load(signal, theme)); } catch (error) { signal.throwIfAborted(); console.warn(`${label} not loaded:`, error); }
    }
    progress(0.96, "Preparing collision");
    await new Promise(r => setTimeout(r, 0)); // let the progress bar paint
    mergeTiles(map);
    const colliders: Mesh[] = [];
    map.traverse(o => {
      if (!(o instanceof Mesh)) return;
      o.receiveShadow = true;
      // Ground and trees only receive shadows: trees span the whole map, so they would cast all of it.
      o.castShadow = !(o instanceof InstancedMesh) && o.name !== "Ground" && o.parent?.name !== "Ground";
      if (o instanceof InstancedMesh) return;
      o.geometry.boundsTree = new MeshBVH(o.geometry, { indirect: true });
      o.raycast = acceleratedRaycast;
      colliders.push(o);
    });
    signal.throwIfAborted();
    return { map, colliders };
  } catch (error) {
    disposeObject(map);
    throw error;
  }
}

/**
 * Each 200 m City tile is split per material (~600 meshes). Merge tiles in pairs (400 × 200 m) per
 * material at load time: ~40% fewer draw calls while blocks stay small enough for frustum and shadow
 * culling to keep the triangle count in budget. Runtime only; the GLB stays as exported.
 */
function mergeTiles(map: Object3D) {
  map.updateMatrixWorld(true);
  const groups = new Map<string, Mesh[]>();
  map.traverse(o => {
    const tile = o.parent?.name.match(/^City_(-?\d+)_(-?\d+)$/) ?? o.name.match(/^City_(-?\d+)_(-?\d+)$/);
    if (!(o instanceof Mesh) || !tile || Array.isArray(o.material)) return;
    const key = `${Math.floor(+tile[1] / 2)},${+tile[2]},${o.material.uuid}`;
    const list = groups.get(key);
    if (list) list.push(o); else groups.set(key, [o]);
  });
  for (const [key, meshes] of groups) {
    if (meshes.length < 2) continue;
    const parts: BufferGeometry[] = meshes.map(m => m.geometry.clone().applyMatrix4(m.matrixWorld));
    const merged = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    if (!merged) continue; // attribute mismatch: keep the originals
    const mesh = new Mesh(merged, meshes[0].material);
    mesh.name = `City_${key.split(",", 2).join("_")}`;
    for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); }
    map.add(mesh);
  }
}

export function disposeObject(root: Object3D) {
  const materials = new Set<Material>(), textures = new Set<Texture>();
  root.traverse(o => {
    if (!(o instanceof Mesh)) return;
    o.geometry.boundsTree = undefined;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      for (const v of Object.values(m)) if (v instanceof Texture) textures.add(v);
    }
  });
  textures.forEach(t => t.dispose());
  materials.forEach(m => m.dispose());
}
