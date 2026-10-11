import type { DirectionalLight } from "three";

export type RenderingQuality = "performance" | "medium" | "high";

/** A single sun shadow map; High covers more streets without adding render passes. */
export function applyShadowQuality(sun: DirectionalLight, quality: RenderingQuality) {
  const high = quality === "high", extent = high ? 90 : 30, size = high ? 2048 : 1024;
  const shadow = sun.shadow;
  if (shadow.mapSize.x !== size || shadow.mapSize.y !== size) {
    // Three only allocates a new target when map is null, not when mapSize changes.
    shadow.dispose(); shadow.map = null; shadow.mapPass = null;
    shadow.mapSize.set(size, size);
  }
  Object.assign(shadow.camera, {
    left: -extent, right: extent, top: extent, bottom: -extent,
    near: 1, far: high ? 360 : 120,
  });
  shadow.camera.updateProjectionMatrix();
  shadow.needsUpdate = true;
  return high ? 180 : 50;
}
