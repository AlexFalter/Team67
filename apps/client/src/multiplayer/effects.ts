import * as THREE from "three";
import type { Bump, PlayerState } from "@race/shared";
interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
}
export class Effects {
  private queue: Bump[] = [];
  private particles: Particle[] = [];
  private motion = new Map<string, { grounded: boolean; nextDust: number; seen: number }>();
  private geometry = new THREE.SphereGeometry(0.07, 6, 4);
  // Bump sounds now use the recorded collision thud from GameAudio (mini-games-2).
  constructor(private scene: THREE.Scene, private onBurst: (b: Bump) => void = () => {}) {}
  enqueue(b: Bump) {
    this.queue.push(b);
    this.queue.sort((a, b) => a.t - b.t);
  }
  trail(id: string, p: PlayerState, now: number) {
    let last = this.motion.get(id);
    if (!last) { last = { grounded: p.grounded, nextDust: now, seen: now }; this.motion.set(id, last); }
    const landing = !last.grounded && p.grounded;
    const takeoff = last.grounded && !p.grounded && p.vy > 2;
    const sprint = p.grounded && Math.hypot(p.vx, p.vz) > 7 && now > last.nextDust;
    if (!p.vehicleId && p.anim !== 3 && (landing || takeoff || sprint)) {
      last.nextDust = now + 90;
      for (let i = 0; i < (sprint ? 2 : 7) && this.particles.length < 400; i++) {
        const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: p.shoes ? "#91e5b9" : "#d1d9bc", transparent: true, opacity: 0.55, depthWrite: false }));
        mesh.position.set(p.x + (Math.random() - 0.5) * 0.35, p.y + 0.08, p.z + (Math.random() - 0.5) * 0.35);
        mesh.scale.setScalar(sprint ? 0.8 : 1.2); this.scene.add(mesh);
        this.particles.push({ mesh, age: 0, velocity: new THREE.Vector3((Math.random() - 0.5) * 2 - p.vx * 0.08, 1.5 + Math.random(), (Math.random() - 0.5) * 2 - p.vz * 0.08) });
      }
    }
    last.grounded = p.grounded; last.seen = now;
  }
  update(renderTime: number, dt: number) {
    for (const [id, last] of this.motion) if (performance.now() - last.seen > 2000) this.motion.delete(id);
    while (this.queue.length && this.queue[0].t <= renderTime)
      this.burst(this.queue.shift()!);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= 0.4) {
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= 12 * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - p.age / 0.4;
    }
  }
  private burst(b: Bump) {
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(
        this.geometry,
        new THREE.MeshBasicMaterial({ color: "#ffe6a0", transparent: true }),
      );
      mesh.position.set(b.x, b.y, b.z);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          Math.random() * 4,
          (Math.random() - 0.5) * 5,
        ),
        age: 0,
      });
    }
    this.onBurst(b);
  }
  dispose() {
    this.queue = [];
    for (const p of this.particles) {
      p.mesh.removeFromParent();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.geometry.dispose();
  }
}
