import * as THREE from 'three';
import { MAX_TRAFFIC_CARS, type TrafficCarState, type WorldState } from '@race/shared';
import type { TrafficRoadSurface } from './trafficRoadSurface.ts';
interface Frame extends TrafficCarState { t: number }
/** Instanced bodies, cabins and wheels; shares the existing server clock and render loop. */
export class TrafficRenderer {
  private frames = new Map<string, Frame[]>();
  private body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.85, 4.4), new THREE.MeshStandardMaterial({ roughness: 0.85 }), MAX_TRAFFIC_CARS);
  private cabin = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.7, 2.2), new THREE.MeshStandardMaterial({ color: '#b6d9e9', roughness: 0.5 }), MAX_TRAFFIC_CARS);
  private wheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.35, 0.22, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#20252b' }), MAX_TRAFFIC_CARS * 4);
  private transform = new THREE.Object3D();
  private ground = new THREE.Vector3();
  private offset = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private surface?: Pick<TrafficRoadSurface, 'height'>) {
    this.body.count = this.cabin.count = this.wheels.count = 0;
    this.body.castShadow = this.cabin.castShadow = true;
    this.body.frustumCulled = this.cabin.frustumCulled = this.wheels.frustumCulled = false;
    scene.add(this.body, this.cabin, this.wheels);
  }
  patch(state: WorldState) {
    for (const [id, p] of state.trafficCars ?? []) {
      let frames = this.frames.get(id);
      if (!frames) { frames = []; this.frames.set(id, frames); }
      const frame = { x: p.x, y: p.y, z: p.z, rotY: p.rotY, speed: p.speed, t: state.serverTime };
      if (frames.at(-1)?.t === frame.t) frames[frames.length - 1] = frame;
      else frames.push(frame);
      while (frames.length > 2 && frames[1].t < frame.t - 1000) frames.shift();
    }
    for (const id of this.frames.keys()) if (!state.trafficCars?.has(id)) this.frames.delete(id);
  }
  render(t: number) {
    let index = 0;
    for (const [id, frames] of this.frames) {
      if (index >= MAX_TRAFFIC_CARS) break;
      let a = frames[0], b = a;
      for (let i = 1; i < frames.length; i++) { b = frames[i]; if (b.t >= t) break; a = b; }
      const f = a === b ? 0 : THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
      const x = THREE.MathUtils.lerp(a.x, b.x, f), y = THREE.MathUtils.lerp(a.y, b.y, f), z = THREE.MathUtils.lerp(a.z, b.z, f);
      const yaw = a.rotY + Math.atan2(Math.sin(b.rotY - a.rotY), Math.cos(b.rotY - a.rotY)) * f;
      const height = (localX: number, localZ: number) => {
        const h = this.surface?.height(x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
          z - Math.sin(yaw) * localX + Math.cos(yaw) * localZ, y);
        // Preserve the authored bridge level when asphalt is missing or on another deck.
        return h !== undefined && Math.abs(h - y) < 3 ? h : undefined;
      };
      const groundY = height(0, 0) ?? y;
      const front = height(0, 1.4) ?? groundY, rear = height(0, -1.4) ?? groundY;
      const left = height(-0.98, 0) ?? groundY, right = height(0.98, 0) ?? groundY;
      this.ground.set(x, groundY, z);
      this.transform.rotation.set(-Math.atan2(front - rear, 2.8), yaw, Math.atan2(right - left, 1.96), 'YXZ');
      this.place(0, 0.65, 0); this.body.setMatrixAt(index, this.transform.matrix);
      this.place(0, 1.4, 0); this.cabin.setMatrixAt(index, this.transform.matrix);
      for (let wheel = 0; wheel < 4; wheel++) {
        this.place(wheel % 2 ? 0.98 : -0.98, 0.35, wheel < 2 ? -1.4 : 1.4);
        this.wheels.setMatrixAt(index * 4 + wheel, this.transform.matrix);
      }
      const hue = Number(id.replace('traffic-', '')) * 0.618 % 1;
      this.body.setColorAt(index, new THREE.Color().setHSL(hue, 0.5, 0.5)); index++;
    }
    this.body.count = this.cabin.count = index; this.wheels.count = index * 4;
    this.body.instanceMatrix.needsUpdate = this.cabin.instanceMatrix.needsUpdate = this.wheels.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }
  private place(x: number, y: number, z: number) {
    this.offset.set(x, y, z).applyEuler(this.transform.rotation);
    this.transform.position.copy(this.ground).add(this.offset); this.transform.updateMatrix();
  }
  clear() { this.frames.clear(); this.render(0); }
  dispose() {
    for (const mesh of [this.body, this.cabin, this.wheels]) { this.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }
    this.frames.clear();
  }
}
