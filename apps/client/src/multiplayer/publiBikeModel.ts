import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";

// Own each instance's geometry/materials so the existing vehicle cleanup stays safe.
export async function loadPubliBikeModel(signal: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}models/publibike.glb`, { signal });
  if (!response.ok) throw new Error(`PubliBike download failed (${response.status}).`);
  const bytes = await response.arrayBuffer(); signal.throwIfAborted();
  const { scene: source } = await new GLTFLoader().parseAsync(bytes, "");
  if (signal.aborted) { disposeMap(source); signal.throwIfAborted(); }
  source.updateMatrixWorld(true);
  return {
    create(number: number) {
      const root = new THREE.Group(); root.name = "PubliBike"; root.rotation.y = Math.PI; root.scale.setScalar(0.68);
      const buckets = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
      const wheels = new Map<string, THREE.Group>();
      for (const name of ["FrontWheel", "RearWheel"]) {
        const sourceWheel = source.getObjectByName(name);
        if (!sourceWheel) continue;
        const wheel = new THREE.Group(); wheel.name = `PubliBike ${name}`;
        sourceWheel.getWorldPosition(wheel.position); root.add(wheel); wheels.set(name, wheel);
      }
      source.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        let owner: THREE.Object3D = root;
        for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) {
          const wheel = wheels.get(ancestor.name); if (wheel) { owner = wheel; break; }
        }
        const bucketMap = buckets.get(owner) ?? new Map<THREE.Material, THREE.BufferGeometry[]>(); buckets.set(owner, bucketMap);
        const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(object.matrixWorld);
        if (owner !== root) geometry.translate(-owner.position.x, -owner.position.y, -owner.position.z);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const group of geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.attributes.position.count, materialIndex: 0 }]) {
          const part = new THREE.BufferGeometry();
          for (const [key, attribute] of Object.entries(geometry.attributes) as [string, THREE.BufferAttribute][]) {
            const values = Array.from({ length: group.count * attribute.itemSize }, (_, i) => attribute.getComponent(group.start + Math.floor(i / attribute.itemSize), i % attribute.itemSize));
            part.setAttribute(key, new THREE.Float32BufferAttribute(values, attribute.itemSize));
          }
          const mat = materials[group.materialIndex ?? 0], bucket = bucketMap.get(mat) ?? [];
          bucket.push(part); bucketMap.set(mat, bucket);
        }
        geometry.dispose();
      });
      for (const [owner, bucketMap] of buckets) for (const [mat, parts] of bucketMap) {
        const material = mat.clone();
        for (const [key, value] of Object.entries(material)) if (value instanceof THREE.Texture)
          (material as unknown as Record<string, unknown>)[key] = value.clone();
        if (material instanceof THREE.MeshStandardMaterial) material.userData.originalColor = material.color.clone();
        const mesh = new THREE.Mesh(mergeGeometries(parts)!, material); mesh.castShadow = true; owner.add(mesh);
        parts.forEach(p => p.dispose());
      }
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "#15232b";
      for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if ((x * 7 + y * 11 + number + x * y) % 5 < 3) ctx.fillRect(36 + x * 5, 25 + y * 5, 5, 5);
      ctx.font = "bold 20px Arial"; ctx.textAlign = "center"; ctx.fillText(String(number).padStart(2, "0"), 64, 115);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.23), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
      tag.name = "PubliBike QR"; tag.position.set(0, 1.25, 1.35); root.add(tag);
      return root;
    },
    dispose() { disposeMap(source); },
  };
}
