import * as THREE from "three";
import { LIME_KIND, LIME_SPEED, LIME_BOOST_SPEED, SLIDE_ANIM, SLIDE_MIN_SPEED, type Body, type Bump, type PlayerState } from "@race/shared";
interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  gravity?: number;
}
// Peripheral speed streaks shared by first- and third-person riding views.
// Shared geometry/material avoid allocating a particle every animation frame.
export class SpeedParticles {
  readonly mesh: THREE.LineSegments;
  readonly sparks: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private sparkPositions = new Float32Array(20 * 3);
  private positions = new Float32Array(24 * 6);
  private phase = 0;
  private neon = new THREE.Color("#66ffb0");
  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: "#d4e7dc", transparent: true, opacity: 0.32, depthWrite: false, depthTest: false,
    }));
    this.mesh.name = "riding-speed-particles";
    this.mesh.renderOrder = 10;
    this.mesh.visible = false; this.mesh.frustumCulled = false; scene.add(this.mesh);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute("position", new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparks = new THREE.Points(sparkGeometry, new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, strength: { value: 0 } },
      vertexShader: `uniform float time; varying float flicker;
        void main() {
          flicker = .7 + .3 * sin(time * 16. + position.y * 28.);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          gl_PointSize = 3. + 2. * flicker;
        }`,
      fragmentShader: `uniform float strength; varying float flicker;
        void main() {
          float radius = length(gl_PointCoord - .5);
          float glow = 1. - smoothstep(.08, .5, radius);
          gl_FragColor = vec4(.4, 1., .68, glow * flicker * strength);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    this.sparks.name = "lime-boost-sparks";
    this.sparks.visible = false; this.sparks.frustumCulled = false; this.sparks.renderOrder = 11;
    scene.add(this.sparks);
  }
  update(p: Body, camera: THREE.PerspectiveCamera, dt: number, enabled: boolean) {
    // Bikes at speed and slides; no sprint-jump streaks (they looked jagged).
    this.mesh.visible = enabled && p.anim !== 3 && p.knockdownUntil <= p.simTime &&
      ((!!p.vehicleId && (p.vehicleKind === 2 || p.vehicleKind === LIME_KIND) && Math.hypot(p.vx, p.vz) >= SLIDE_MIN_SPEED) || (!p.vehicleId && p.anim === SLIDE_ANIM));
    this.sparks.visible = false;
    if (!this.mesh.visible) { this.phase = 0; return; }
    const boost = p.vehicleId && p.vehicleKind === LIME_KIND ? THREE.MathUtils.clamp((Math.hypot(p.vx, p.vz) - LIME_SPEED) / (LIME_BOOST_SPEED - LIME_SPEED), 0, 1) : 0;
    const count = 12 + Math.round(boost * 12);
    this.mesh.geometry.setDrawRange(0, count * 2);
    const material = this.mesh.material as THREE.LineBasicMaterial;
    material.opacity = .32 + boost * .20;
    material.color.set("#d4e7dc").lerp(this.neon, boost);
    material.blending = boost > .05 ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.phase += dt * (5 + boost * 4);
    this.mesh.position.copy(camera.position); this.mesh.quaternion.copy(camera.quaternion);
    const spread = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (let i = 0; i < count; i++) {
      const age = (this.phase + i * 0.618) % 1;
      const depth = 1.8 - age * 1.2;
      const side = i % 2 ? -1 : 1, height = ((i * 0.37) % 1 - 0.5) * 1.5;
      const x = side * (0.76 + age * 0.10 + (i % 3) * 0.025) * spread * camera.aspect;
      const y = height * spread;
      this.positions.set([x * depth, y * depth, -depth, x * (depth + 0.06), y * (depth + 0.06), -depth - (0.26 + boost * .24)], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.sparks.visible = boost > .05;
    if (this.sparks.visible) {
      this.sparks.position.copy(camera.position); this.sparks.quaternion.copy(camera.quaternion);
      this.sparks.material.uniforms.time.value += dt;
      this.sparks.material.uniforms.strength.value = boost * .8;
      for (let i = 0; i < 20; i++) {
        const age = (this.phase * 1.3 + i * .618) % 1, depth = 1.8 - age * 1.2;
        const x = (i % 2 ? -1 : 1) * (.78 + age * .1) * spread * camera.aspect;
        const y = ((i * .37) % 1 - .5) * 1.5 * spread;
        this.sparkPositions.set([x * depth, y * depth, -depth], i * 3);
      }
      this.sparks.geometry.attributes.position.needsUpdate = true;
    }
  }
  dispose() {
    this.mesh.removeFromParent(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose();
    this.sparks.removeFromParent(); this.sparks.geometry.dispose(); this.sparks.material.dispose();
  }
}

export class HitFeedback {
  private element: HTMLDivElement;
  constructor() {
    this.element = document.createElement("div");
    this.element.setAttribute("aria-hidden", "true"); this.element.className = "hit-feedback";
    Object.assign(this.element.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "30", opacity: "0", background: "radial-gradient(ellipse at center, transparent 55%, rgba(170, 20, 25, 0.28) 100%)", boxShadow: "inset 0 0 28px rgba(190, 25, 30, 0.25)" });
    document.body.append(this.element);
  }
  update(p: PlayerState, enabled: boolean) {
    const age = p.simTime - (p.impactStartedAt ?? 0);
    this.element.style.opacity = enabled && p.impactStrength && age >= 0 ? String(Math.max(0, 1 - age / 700)) : "0";
  }
  dispose() { this.element.remove(); }
}

export class Effects {
  private queue: (Bump & { localVictim: boolean })[] = [];
  private listener?: Body;
  private feedback = new HitFeedback();
  private lastImpact = -1;
  private floorSound = false;
  private speedParticles: SpeedParticles;
  private particles: Particle[] = [];
  private batteries = new Map<string, number>();
  private nextBatterySpark = new Map<string, number>();
  private audio?: AudioContext;
  private motion = new Map<string, { nextDust: number; seen: number }>();
  private geometry = new THREE.SphereGeometry(0.07, 6, 4);
  private abort = new AbortController();
  // Bump sounds use the recorded collision thud from GameAudio (mini-games-2); explosions keep their own sound.
  constructor(private scene: THREE.Scene, private onBurst: (b: Bump) => void = () => {}) {
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
    this.feedback.update(p, enabled);
    this.listener = p;
    if (p.impactStrength && p.impactStartedAt !== undefined && p.simTime >= p.impactStartedAt && p.impactStartedAt !== this.lastImpact) {
      this.lastImpact = p.impactStartedAt; this.floorSound = false;
      this.impactSound(p.impactStrength ?? 8, false);
    }
    if (this.lastImpact >= 0 && !this.floorSound && p.grounded && p.simTime - this.lastImpact >= 300) {
      this.floorSound = true; this.impactSound(p.impactStrength ?? 8, true);
    }
  }
  battery(id: string, remaining: number, at: { x: number; y: number; z: number }, now = performance.now()) {
    const previous = this.batteries.get(id); this.batteries.set(id, remaining);
    if (remaining > 0) { this.nextBatterySpark.delete(id); return; }
    const depleted = previous !== undefined && previous > 0;
    if (!depleted && now < (this.nextBatterySpark.get(id) ?? 0)) return;
    this.nextBatterySpark.set(id, now + 150);
    for (let i = 0; i < (depleted ? 18 : 3) && this.particles.length < 400; i++) {
      const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: i % 2 ? "#8cdbff" : "#fff5b0", transparent: true, depthWrite: false }));
      mesh.scale.set(.3, .3, 1.6); mesh.position.set(at.x, at.y + .6, at.z);
      const velocity = new THREE.Vector3((Math.random() - .5) * 4, 1 + Math.random() * 3, (Math.random() - .5) * 4);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), velocity.clone().normalize());
      this.scene.add(mesh); this.particles.push({ mesh, velocity, age: 0, gravity: 8 });
    }
  }
  enqueue(b: Bump, localId = "") {
    this.queue.push({ ...b, localVictim: b.b === localId });
    this.queue.sort((a, b) => a.t - b.t);
  }
  trail(id: string, p: PlayerState, now: number) {
    let last = this.motion.get(id);
    if (!last) { last = { nextDust: now, seen: now }; this.motion.set(id, last); }
    const slide = p.grounded && p.anim === SLIDE_ANIM && now > last.nextDust;
    if (!p.vehicleId && p.anim !== 3 && slide) {
      last.nextDust = now + 90;
      for (let i = 0; i < 3 && this.particles.length < 400; i++) {
        const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: "#d1d9bc", transparent: true, opacity: 0.55, depthWrite: false }));
        mesh.position.set(p.x + (Math.random() - 0.5) * 0.35, p.y + 0.08, p.z + (Math.random() - 0.5) * 0.35);
        mesh.scale.setScalar(0.8); this.scene.add(mesh);
        this.particles.push({ mesh, age: 0, gravity: 12, velocity: new THREE.Vector3((Math.random() - 0.5) * 2 - p.vx * 0.08, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 2 - p.vz * 0.08) });
      }
    }
    last.seen = now;
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
  private burst(b: Bump & { localVictim: boolean }) {
    if (!b.localVictim && this.listener) {
      const distance = Math.hypot(b.x - this.listener.x, b.y - this.listener.y, b.z - this.listener.z);
      if (distance < 30) this.impactSound(8, false, 1 / (1 + distance / 6));
    }
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
  private impactSound(strength: number, floor: boolean, volume = 1) {
    const a = this.audio;
    if (!a || a.state !== "running") return;
    const duration = floor ? 0.22 : 0.14, at = a.currentTime;
    const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * duration), a.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / a.sampleRate * 28);
    const noise = a.createBufferSource(), filter = a.createBiquadFilter(), gain = a.createGain(), thud = a.createOscillator();
    noise.buffer = buffer; filter.type = "lowpass"; filter.frequency.value = floor ? 350 : 1000;
    gain.gain.setValueAtTime(Math.min(0.24, 0.07 + strength * 0.006) * volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    thud.frequency.setValueAtTime(floor ? 100 : 160, at); thud.frequency.exponentialRampToValueAtTime(45, at + duration);
    noise.connect(filter); filter.connect(gain); thud.connect(gain); gain.connect(a.destination);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); };
    thud.onended = () => { thud.disconnect(); gain.disconnect(); };
    noise.start(at); thud.start(at); thud.stop(at + duration);
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
    this.feedback.dispose();
    this.queue = [];
    for (const p of this.particles) {
      p.mesh.removeFromParent();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = []; this.batteries.clear(); this.nextBatterySpark.clear();
    this.geometry.dispose();
    this.speedParticles.dispose();
    if (this.audio) void this.audio.close();
  }
}
