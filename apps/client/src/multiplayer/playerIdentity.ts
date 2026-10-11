import * as THREE from "three";
import type { PlayerState } from "@race/shared";

interface OutlinePart { mesh: THREE.Mesh; offset: number }
interface Identity { label: THREE.Sprite; name: string; outline?: THREE.Mesh; parts: OutlinePart[] }
const identities = new WeakMap<THREE.Group, Identity>();
const relative = new THREE.Matrix4(), inverse = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3();
const point = new THREE.Vector3(), normal = new THREE.Vector3();

function nameTexture(name: string) {
  // Node gameplay tests do not have a canvas; the real browser always does.
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 32px ui-monospace, monospace";
  canvas.width = Math.min(512, Math.max(128, Math.ceil(ctx.measureText(name).width) + 48)); canvas.height = 88;
  ctx.font = "600 32px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#071a2480"; ctx.fillRect(12, 14, canvas.width - 20, 68);
  ctx.fillStyle = "#102731"; ctx.fillRect(6, 6, canvas.width - 20, 68);
  ctx.strokeStyle = "#b9d4cb"; ctx.lineWidth = 3; ctx.strokeRect(7.5, 7.5, canvas.width - 23, 65);
  ctx.fillStyle = "#c3d5cc"; ctx.fillText(name, (canvas.width - 8) / 2, 40, canvas.width - 40);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter;
  return texture;
}

export function decoratePlayer(mesh: THREE.Group, name: string, enemy = false) {
  name = name.slice(0, 24);
  const existing = identities.get(mesh);
  if (existing) {
    if (existing.name !== name) {
      const material = existing.label.material;
      material.map?.dispose(); material.map = nameTexture(name) ?? null; material.needsUpdate = true;
      existing.label.scale.x = (((material.map?.image as { width: number } | undefined)?.width ?? 512) / 88) * .30;
      existing.name = name; existing.label.userData.playerName = name;
    }
    return;
  }
  const parts: OutlinePart[] = []; let count = 0;
  if (enemy) mesh.traverse(child => {
    if (child instanceof THREE.Mesh) {
      parts.push({ mesh: child, offset: count });
      count += child.geometry.index?.count ?? child.geometry.attributes.position.count;
    }
  });
  let outline: THREE.Mesh | undefined;
  if (enemy) {
    // One extra draw per opponent. Reuse original pieces and bake their animated
    // transforms into one inverted hull, rather than drawing an outline per limb.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    outline = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: "#e16b71", side: THREE.BackSide, transparent: true, opacity: 0.38,
      depthWrite: false, depthTest: true, toneMapped: false,
    }));
    outline.name = "opponent-outline"; outline.frustumCulled = false; mesh.add(outline);
  }
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name) ?? null,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false }));
  label.name = "player-name"; label.userData.playerName = name;
  label.scale.set((((label.material.map?.image as { width: number } | undefined)?.width ?? 512) / 88) * .30, .30, 1); label.position.y = 2.15; mesh.add(label);
  identities.set(mesh, { label, name, outline, parts });
}

export function updatePlayerIdentity(mesh: THREE.Group, p: PlayerState) {
  const identity = identities.get(mesh); if (!identity) return;
  identity.label.position.y = p.anim === 3 ? 0.65 : p.anim === 4 ? 1.3 : p.vehicleId ? 1.65 : 2.15;
  if (!identity.outline) return;
  mesh.updateMatrixWorld(true); inverse.copy(mesh.matrixWorld).invert();
  const positions = identity.outline.geometry.attributes.position as THREE.BufferAttribute;
  for (const part of identity.parts) {
    relative.multiplyMatrices(inverse, part.mesh.matrixWorld); normalMatrix.getNormalMatrix(relative);
    const geometry = part.mesh.geometry, source = geometry.attributes.position, normals = geometry.attributes.normal;
    const index = geometry.index, count = index?.count ?? source.count;
    for (let i = 0; i < count; i++) {
      const vertex = index ? index.getX(i) : i;
      point.fromBufferAttribute(source, vertex).multiplyScalar(1.055).applyMatrix4(relative);
      normal.fromBufferAttribute(normals, vertex).applyMatrix3(normalMatrix).normalize();
      point.addScaledVector(normal, 0.002);
      positions.setXYZ(part.offset + i, point.x, point.y, point.z);
    }
  }
  positions.needsUpdate = true;
}

export function disposePlayerIdentity(mesh: THREE.Group) {
  const identity = identities.get(mesh); if (!identity) return;
  identity.label.material.map?.dispose(); identity.label.material.dispose(); identity.label.removeFromParent();
  if (identity.outline) {
    identity.outline.geometry.dispose(); (identity.outline.material as THREE.Material).dispose(); identity.outline.removeFromParent();
  }
  identities.delete(mesh);
}
