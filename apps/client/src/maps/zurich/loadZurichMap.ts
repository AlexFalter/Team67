import { Mesh, Texture, type Object3D, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import area from './area.json';
import { activeTheme, applyTheme } from './theme';
import { loadTrees } from './loadTrees';

/**
 * Map data stays separate from the viewer so the team can reuse the same asset.
 * The GLB (exported from zurich.blend) carries geometry, UVs and material names only;
 * the pixel textures and colours come from the active theme (themes/*.json).
 */
export async function loadZurichMap(signal: AbortSignal): Promise<Object3D> {
  const response = await fetch(`${import.meta.env.BASE_URL}${area.asset}`, { signal });
  if (!response.ok) throw new Error(`Map download failed (HTTP ${response.status}).`);
  const data = await response.arrayBuffer();
  signal.throwIfAborted();
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, '');
  if (signal.aborted) { disposeMap(gltf.scene); signal.throwIfAborted(); }
  // Exporter min/max can be slightly off; exact bounds keep frustum culling and raycasts correct.
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh) { object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere(); }
  });
  const theme = activeTheme();
  applyTheme(gltf.scene, theme);
  try {
    gltf.scene.add(await loadTrees(signal, theme));
  } catch (error) {
    if (signal.aborted) { disposeMap(gltf.scene); throw error; }
    console.warn('Trees not loaded:', error);
  }
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
