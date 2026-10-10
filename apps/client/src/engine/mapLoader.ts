import { InstancedMesh, Mesh, Texture, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import area from "../maps/zurich/area.json";
import { applyTheme, type MapTheme } from "../maps/zurich/theme";
import { loadTrees } from "../maps/zurich/loadTrees";

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
    applyTheme(map, theme);
    progress(0.92, "Planting trees");
    try { map.add(await loadTrees(signal, theme)); } catch (error) { signal.throwIfAborted(); console.warn("Trees not loaded:", error); }
    progress(0.96, "Preparing collision");
    await new Promise(r => setTimeout(r, 0)); // let the progress bar paint
    const colliders: Mesh[] = [];
    map.traverse(o => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = o.receiveShadow = true;
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
