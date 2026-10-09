import { Mesh, Texture, type Object3D, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import area from './area.json';

/** Map data stays separate from the viewer so the team can reuse the same asset. */
export async function loadZurichMap(signal: AbortSignal): Promise<Object3D> {
  const response = await fetch(`${import.meta.env.BASE_URL}${area.asset}`, { signal });
  if (!response.ok) throw new Error(`Map download failed (HTTP ${response.status}).`);
  const data = await response.arrayBuffer();
  signal.throwIfAborted();
  const gltf = await new GLTFLoader().parseAsync(data, '');
  if (signal.aborted) { disposeMap(gltf.scene); signal.throwIfAborted(); }
  return gltf.scene;
}

export function disposeMap(root: Object3D) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}
