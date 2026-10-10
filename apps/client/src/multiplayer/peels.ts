import * as THREE from "three";
import { flatWorld, type MovementWorld, type WorldState, type PeelState } from "@race/shared";

export function peelFlight(p: PeelState, now: number, world: MovementWorld = flatWorld) {
  if (p.landingAt <= p.bornAt) return { x: p.x, y: p.y, z: p.z };
  const f = Math.max(0, Math.min(1, (now - p.bornAt) / (p.landingAt - p.bornAt)));
  const x = p.fromX + (p.toX - p.fromX) * f, z = p.fromZ + (p.toZ - p.fromZ) * f;
  return { x, y: (world.height(x, z) ?? p.y) + 4 * f * (1 - f), z };
}

export class Peels {
  private items = new Map<string, THREE.Group>();
  private geometry = new THREE.BoxGeometry(0.15, 0.06, 0.65);
  private material = new THREE.MeshStandardMaterial({ color: "#ffdc4d" });
  constructor(private scene: THREE.Scene, private world: MovementWorld = flatWorld) {}
  render(state?: WorldState, now = state?.serverTime ?? 0) {
    for (const [id, p] of state?.peels ?? []) {
      let root = this.items.get(id);
      if (!root) {
        root = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const leaf = new THREE.Mesh(this.geometry, this.material), angle = i * Math.PI * 2 / 3;
          leaf.position.set(Math.sin(angle) * 0.22, 0, Math.cos(angle) * 0.22);
          leaf.rotation.set(0.15, angle, 0); root.add(leaf);
        }
        this.items.set(id, root); this.scene.add(root);
      }
      const pos = peelFlight(p, now, this.world);
      root.position.set(pos.x, pos.y + 0.06, pos.z);
    }
    for (const [id, root] of this.items) if (!state?.peels.has(id)) { root.removeFromParent(); this.items.delete(id); }
  }
  dispose() { for (const root of this.items.values()) root.removeFromParent(); this.items.clear(); this.geometry.dispose(); this.material.dispose(); }
}
