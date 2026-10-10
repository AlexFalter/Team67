import * as THREE from "three";
import { SLIDE_ANIM, SLIDE_MIN_SPEED, type Body, type Bump, type PlayerState } from "@race/shared";
interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  gravity?: number;
}
// Twelve faint, short-lived streaks at the edge of the owning view.
// Shared geometry/material avoid allocating a particle every animation frame.
export class SpeedParticles {
  readonly mesh: THREE.LineSegments;
  private positions = new Float32Array(12 * 6);
  private phase = 0;
  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: "#d4e7dc", transparent: true, opacity: 0.32, depthWrite: false, depthTest: false,
    }));
    this.mesh.name = "first-person-speed-particles";
    this.mesh.renderOrder = 10;
    this.mesh.visible = false; this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  update(p: Body, camera: THREE.PerspectiveCamera, dt: number, enabled: boolean) {
    this.mesh.visible = enabled && !p.vehicleId && p.anim !== 3 && p.knockdownUntil <= p.simTime &&
      (p.anim === SLIDE_ANIM || (!p.grounded && p.anim === 2 && p.sprintJump === true));
    if (!this.mesh.visible) { this.phase = 0; return; }
    this.phase += dt * 5;
    this.mesh.position.copy(camera.position); this.mesh.quaternion.copy(camera.quaternion);
    const spread = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (let i = 0; i < 12; i++) {
      const age = (this.phase + i * 0.618) % 1;
      const depth = 1.8 - age * 1.2;
      const side = i % 2 ? -1 : 1, height = ((i * 0.37) % 1 - 0.5) * 1.5;
      const jump = p.anim === 2;
      const x = side * (0.76 + age * 0.10 + (i % 3) * 0.025) * spread * camera.aspect;
      const y = (jump ? -0.8 + age * 1.6 : height) * spread;
      if (jump) {
        // Rise vertically at the view edges instead of radial slide streaks.
        this.positions.set([x * depth, y * depth, -depth, x * depth, (y + 0.12 * spread) * depth, -depth], i * 6);
        continue;
      }
      this.positions.set([x * depth, y * depth, -depth, x * (depth + 0.06), y * (depth + 0.06), -depth - 0.26], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

export class Effects {
  private queue: Bump[] = [];
  private speedParticles: SpeedParticles;
  private particles: Particle[] = [];
  private audio?: AudioContext;
  private motion = new Map<string, { grounded: boolean; sprintJump: boolean; nextDust: number; seen: number }>();
  private geometry = new THREE.SphereGeometry(0.07, 6, 4);
  private abort = new AbortController();
  constructor(private scene: THREE.Scene) {
    this.speedParticles = new SpeedParticles(scene);
    const resume = () => {
      this.audio ??= new AudioContext();
      void this.audio.resume();
    };
    window.addEventListener("pointerdown", resume, {
      signal: this.abort.signal,
    });
    window.addEventListener("keydown", resume, { signal: this.abort.signal });
  }
  speed(p: Body, camera: THREE.PerspectiveCamera, dt: number, enabled: boolean) {
    this.speedParticles.update(p, camera, dt, enabled);
  }
  enqueue(b: Bump) {
    this.queue.push(b);
    this.queue.sort((a, b) => a.t - b.t);
  }
  trail(id: string, p: PlayerState, now: number) {
    let last = this.motion.get(id);
    if (!last) { last = { grounded: p.grounded, sprintJump: false, nextDust: now, seen: now }; this.motion.set(id, last); }
    const landing = !last.grounded && p.grounded;
    const takeoff = last.grounded && !p.grounded && p.vy > 2 &&
      ((p as Body).sprintJump ?? Math.hypot(p.vx, p.vz) >= SLIDE_MIN_SPEED);
    if (takeoff) last.sprintJump = true;
    const slide = p.grounded && p.anim === SLIDE_ANIM && now > last.nextDust;
    if (!p.vehicleId && p.anim !== 3 && ((landing && last.sprintJump) || takeoff || slide)) {
      last.nextDust = now + 90;
      for (let i = 0; i < (slide ? 3 : 9) && this.particles.length < 400; i++) {
        const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: "#d1d9bc", transparent: true, opacity: 0.55, depthWrite: false }));
        mesh.position.set(p.x + (Math.random() - 0.5) * 0.35, p.y + 0.08, p.z + (Math.random() - 0.5) * 0.35);
        mesh.scale.setScalar(slide ? 0.8 : 1.0); this.scene.add(mesh);
        this.particles.push({ mesh, age: 0, gravity: takeoff ? 6 : 12, velocity: new THREE.Vector3((Math.random() - 0.5) * 2 - p.vx * 0.08, takeoff ? 3 + Math.random() * 2 : slide ? 0.3 + Math.random() * 0.4 : 1.5 + Math.random(), (Math.random() - 0.5) * 2 - p.vz * 0.08) });
      }
    }
    if (p.grounded) last.sprintJump = false;
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
      p.velocity.y -= (p.gravity ?? 12) * dt;
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
    const a = this.audio;
    if (a?.state === "running") {
      const o = a.createOscillator(),
        g = a.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(220, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(60, a.currentTime + 0.1);
      g.gain.setValueAtTime(0.12, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.12);
      o.connect(g);
      g.connect(a.destination);
      o.start();
      o.stop(a.currentTime + 0.13);
    }
  }
  explosion(origin:{x:number;y:number;z:number},listener:{x:number;y:number;z:number}) {
    const a=this.audio, distance=Math.hypot(origin.x-listener.x,origin.y-listener.y,origin.z-listener.z);
    if(!a||a.state!=="running"||distance>80)return;
    const buffer=a.createBuffer(1,Math.floor(a.sampleRate*.8),a.sampleRate),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/a.sampleRate*7);
    const source=a.createBufferSource(),filter=a.createBiquadFilter(),gain=a.createGain();
    source.buffer=buffer;filter.type="lowpass";filter.frequency.value=420;gain.gain.value=.35/(1+distance/15);
    source.connect(filter);filter.connect(gain);gain.connect(a.destination);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();
  }
  dispose() {
    this.abort.abort();
    this.queue = [];
    for (const p of this.particles) {
      p.mesh.removeFromParent();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.geometry.dispose();
    this.speedParticles.dispose();
    if (this.audio) void this.audio.close();
  }
}
