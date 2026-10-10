import {
  BoxGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, MeshStandardMaterial, Object3D,
  type BufferGeometry, type Camera, type Scene,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ANIM_AIR, ANIM_DOWN, CART, SHUTTLE, BIKE } from "@race/shared";

/**
 * Every avatar segment of every player is one instance of a shared InstancedMesh: 8 segments × 3
 * characters = 24 draw calls no matter how many players. A single template skeleton is posed per
 * player and its joint matrices are copied into the instance buffers. Nothing is allocated per frame.
 */
const SEGMENTS = ["torso", "head", "upperArm", "foreArm", "thigh", "shin", "shoe", "badge"] as const;
type Segment = (typeof SEGMENTS)[number];
const TINTED: ReadonlySet<Segment> = new Set(["shoe", "badge"]);
const CAPACITY = 48;

type Part = [w: number, h: number, d: number, x: number, y: number, z: number, color: string];

function build(parts: Part[]): BufferGeometry {
  const color = new Color();
  return mergeGeometries(parts.map(([w, h, d, x, y, z, hex]) => {
    const g = new BoxGeometry(w, h, d).translate(x, y, z);
    color.set(hex);
    const n = g.getAttribute("position").count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[3 * i] = color.r; c[3 * i + 1] = color.g; c[3 * i + 2] = color.b; }
    g.setAttribute("color", new Float32BufferAttribute(c, 3));
    return g;
  }))!;
}

// Characters face -Z. Joint origins: torso/head at the pelvis/neck, limbs hang down from their joint.
function character(index: number): Record<Segment, Part[]> {
  const athlete = index === 1, einstein = index === 2;
  const skin = athlete ? "#8d5a3b" : einstein ? "#e8c2a2" : "#e0b08a";
  const top = athlete ? "#b23a48" : einstein ? "#7d7f78" : "#3f6fa0";
  const legs = athlete ? "#22324a" : einstein ? "#4f5555" : "#2b3440";
  const hair = einstein ? "#efefe6" : athlete ? "#1b1514" : "#3a2a20";
  const head: Part[] = [
    [0.12, 0.08, 0.12, 0, 0.03, 0, skin],
    [0.26, 0.28, 0.26, 0, 0.19, 0, skin],
    [0.05, 0.05, 0.03, -0.065, 0.2, -0.13, "#1b232b"],
    [0.05, 0.05, 0.03, 0.065, 0.2, -0.13, "#1b232b"],
    [0.06, 0.05, 0.04, 0, 0.14, -0.14, skin],
  ];
  const torso: Part[] = [
    [athlete ? 0.5 : 0.46, 0.58, 0.26, 0, 0.29, 0, top],
    [0.44, 0.12, 0.25, 0, 0.0, 0, legs],
  ];
  if (einstein) {
    head.push([0.3, 0.12, 0.3, 0, 0.34, 0.01, hair], [0.34, 0.12, 0.1, 0, 0.27, 0.12, hair],
      [0.07, 0.16, 0.2, -0.16, 0.25, 0.04, hair], [0.07, 0.16, 0.2, 0.16, 0.25, 0.04, hair],
      [0.14, 0.035, 0.03, 0, 0.11, -0.14, hair]);
    torso.push([0.1, 0.3, 0.02, 0, 0.36, -0.135, "#f1efe6"], [0.05, 0.22, 0.025, 0, 0.34, -0.14, "#2a2f3a"]);
  } else if (athlete) {
    head.push([0.28, 0.06, 0.28, 0, 0.33, 0.01, hair], [0.28, 0.05, 0.28, 0, 0.27, 0, "#f2f2f2"]);
    torso.push([0.5, 0.05, 0.27, 0, 0.42, 0, "#f2e6cf"], [0.08, 0.16, 0.02, 0.1, 0.26, -0.135, "#f2e6cf"]);
  } else {
    head.push([0.28, 0.1, 0.28, 0, 0.34, 0.01, hair], [0.2, 0.025, 0.02, 0, 0.2, -0.14, "#1b232b"]);
    torso.push([0.34, 0.4, 0.16, 0, 0.3, 0.2, "#b5793f"], [0.3, 0.12, 0.1, 0, 0.56, 0.12, top]);
  }
  return {
    torso,
    head,
    upperArm: [[0.12, 0.28, 0.12, 0, -0.13, 0, athlete ? skin : top]],
    foreArm: [[0.11, 0.24, 0.11, 0, -0.12, 0, einstein || !athlete ? top : skin], [0.1, 0.1, 0.1, 0, -0.28, 0, skin]],
    thigh: [[0.17, 0.44, 0.17, 0, -0.22, 0, legs]],
    shin: [[0.14, 0.42, 0.15, 0, -0.21, 0, athlete ? skin : legs]],
    shoe: [[0.15, 0.1, 0.27, 0, -0.04, -0.05, "#ffffff"]],
    badge: [[0.11, 0.1, 0.02, -0.12, 0.43, -0.135, "#ffffff"]],
  };
}

/** Per-player animation memory. */
export class Rig {
  phase = 0;
  speed = 0;
  fall = 0;
  air = 0;
  landing = 0;
  punch = 1; // seconds since the last punch started
  grounded = true;
}

/** What a frame needs to pose one avatar. */
export interface AvatarState {
  x: number; y: number; z: number; yaw: number;
  vx: number; vz: number;
  anim: number;
  riding: number; // -1 on foot, else the vehicle kind
  shoes: boolean;
  character: number;
  color: Color;
}

const SHOE = new Color("#ece6d6"), SHOE_BOOST = new Color("#5ee08f");
const PUNCH_TIME = 0.35;

export class Avatars {
  private meshes: Record<Segment, InstancedMesh>[] = [];
  private counts: Record<Segment, number>[] = [];
  private material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  // Template skeleton
  private root = new Group();
  private hips = new Object3D();
  private torso = new Object3D();
  private head = new Object3D();
  private shoulders = [new Object3D(), new Object3D()];
  private elbows = [new Object3D(), new Object3D()];
  private hipJoints = [new Object3D(), new Object3D()];
  private knees = [new Object3D(), new Object3D()];
  private ankles = [new Object3D(), new Object3D()];
  private badge = new Object3D();
  // First-person arms hang off the camera.
  private view = new Group();
  private viewShoulders = [new Object3D(), new Object3D()];
  private viewElbows = [new Object3D(), new Object3D()];

  constructor(scene: Scene) {
    for (let c = 0; c < 3; c++) {
      const parts = character(c);
      const meshes = {} as Record<Segment, InstancedMesh>, counts = {} as Record<Segment, number>;
      for (const s of SEGMENTS) {
        const limb = s !== "torso" && s !== "head" && s !== "badge";
        const mesh = new InstancedMesh(build(parts[s]), this.material, limb ? CAPACITY * 2 : CAPACITY);
        mesh.frustumCulled = false; // instances span the whole map
        mesh.castShadow = true;
        mesh.count = 0;
        if (TINTED.has(s)) mesh.setColorAt(0, SHOE);
        scene.add(mesh);
        meshes[s] = mesh;
        counts[s] = 0;
      }
      this.meshes.push(meshes);
      this.counts.push(counts);
    }
    const { root, hips, torso, head, badge } = this;
    root.add(hips);
    hips.add(torso);
    torso.add(head, badge);
    head.position.y = 0.6;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      torso.add(this.shoulders[i]);
      this.shoulders[i].position.set(side * 0.3, 0.52, 0);
      this.shoulders[i].add(this.elbows[i]);
      this.elbows[i].position.y = -0.27;
      hips.add(this.hipJoints[i]);
      this.hipJoints[i].position.set(side * 0.12, 0, 0);
      this.hipJoints[i].add(this.knees[i]);
      this.knees[i].position.y = -0.44;
      this.knees[i].add(this.ankles[i]);
      this.ankles[i].position.y = -0.42;
      this.view.add(this.viewShoulders[i]);
      this.viewShoulders[i].position.set(side * 0.3, -0.42, 0.12);
      this.viewShoulders[i].add(this.viewElbows[i]);
      this.viewElbows[i].position.y = -0.27;
    }
  }

  begin() {
    for (const counts of this.counts) for (const s of SEGMENTS) counts[s] = 0;
  }

  /** Pose and queue one avatar. firstPerson: hide head and torso, draw arms from the camera. */
  draw(p: AvatarState, rig: Rig, dt: number, firstPerson?: Camera) {
    this.pose(p, rig, dt);
    const c = Math.min(2, Math.max(0, p.character | 0));
    this.root.updateMatrixWorld(true);
    if (!firstPerson) {
      this.add(c, "torso", this.torso);
      this.add(c, "head", this.head);
      this.add(c, "badge", this.badge, p.color);
      for (let i = 0; i < 2; i++) {
        this.add(c, "upperArm", this.shoulders[i]);
        this.add(c, "foreArm", this.elbows[i]);
      }
    } else if (p.anim !== ANIM_DOWN) {
      this.view.position.copy(firstPerson.position);
      this.view.quaternion.copy(firstPerson.quaternion);
      const punch = rig.punch < PUNCH_TIME ? Math.sin((Math.PI * rig.punch) / PUNCH_TIME) : 0;
      const sway = Math.sin(rig.phase) * Math.min(1, rig.speed / 8) * 0.06;
      for (let i = 0; i < 2; i++) {
        const right = i === 1;
        this.viewShoulders[i].rotation.set(1.25 + (right ? punch * 0.35 + sway : -sway) - rig.air * 0.25, 0, (right ? -1 : 1) * (0.25 - (right ? punch * 0.2 : 0)));
        this.viewElbows[i].rotation.set(right ? 0.9 * (1 - punch) : 0.9, 0, 0);
        this.viewShoulders[i].position.z = right ? 0.05 - punch * 0.3 : 0.05;
      }
      this.view.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        this.add(c, "upperArm", this.viewShoulders[i]);
        this.add(c, "foreArm", this.viewElbows[i]);
      }
    }
    for (let i = 0; i < 2; i++) {
      this.add(c, "thigh", this.hipJoints[i]);
      this.add(c, "shin", this.knees[i]);
      this.add(c, "shoe", this.ankles[i], p.shoes ? SHOE_BOOST : SHOE);
    }
  }

  end() {
    for (let c = 0; c < 3; c++)
      for (const s of SEGMENTS) {
        const mesh = this.meshes[c][s], n = this.counts[c][s];
        mesh.count = n;
        mesh.visible = n > 0;
        if (n) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
  }

  private add(c: number, s: Segment, node: Object3D, color?: Color) {
    const mesh = this.meshes[c][s], i = this.counts[c][s];
    if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, node.matrixWorld);
    if (color) mesh.setColorAt(i, color);
    this.counts[c][s] = i + 1;
  }

  private pose(p: AvatarState, r: Rig, dt: number) {
    const k = 1 - Math.exp(-14 * dt);
    const down = p.anim === ANIM_DOWN, riding = p.riding >= 0, bike = p.riding === BIKE;
    const seated = p.riding === CART || p.riding === SHUTTLE;
    const speed = down || seated ? 0 : Math.hypot(p.vx, p.vz);
    r.speed += (speed - r.speed) * k;
    const grounded = p.anim !== ANIM_AIR || riding;
    if (grounded && !r.grounded && !riding) r.landing = 1;
    r.grounded = grounded;
    r.landing *= Math.exp(-9 * dt);
    r.air += ((!grounded && !down ? 1 : 0) - r.air) * k;
    // Recovery is slower than falling, so getting up reads as an animation.
    r.fall += ((down ? 1 : 0) - r.fall) * (1 - Math.exp(-(down ? 10 : 3.5) * dt));
    r.phase += (bike ? speed * 1.1 : grounded ? r.speed * 1.6 : 0) * dt;
    r.punch += dt;
    const run = Math.min(1, r.speed / 7) * (1 - r.air), s = Math.sin(r.phase), cphase = Math.cos(r.phase);
    const punch = r.punch < PUNCH_TIME ? Math.sin((Math.PI * r.punch) / PUNCH_TIME) : 0;

    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.set(0, p.yaw, 0);
    const hipY = seated ? 0.2 : bike ? 0.3 : 0.88 - r.landing * 0.1 + Math.abs(cphase) * run * 0.04;
    this.hips.position.set(0, hipY + (0.22 - hipY) * r.fall, 0);
    this.hips.rotation.set(r.fall * 1.5 - run * 0.12 - (bike ? 0.35 : 0), 0, 0);
    this.torso.rotation.set(0, punch * -0.35 + s * run * 0.08, 0);
    this.head.rotation.set(-r.fall * 0.3, 0, 0);
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, swing = i ? -s : s; // opposite legs and arms
      let shoulder = -swing * run * 0.9 + r.air * 0.4, elbow = 0.35 + run * 0.7, spread = 0.1 + r.air * 0.35 + r.fall * 1.1;
      if (riding) { shoulder = bike ? 1.1 : 0.9; elbow = 0.6; spread = 0.12; }
      if (i === 1 && punch > 0) { shoulder += (1.55 - shoulder) * punch; elbow *= 1 - punch; }
      this.shoulders[i].rotation.set(shoulder, 0, -side * spread);
      this.elbows[i].rotation.set(elbow, 0, 0);
      let thigh = swing * run * 0.85 + r.air * (i ? 0.25 : 0.7);
      let knee = -(Math.max(0, i ? cphase : -cphase) * run * 1.1 + r.air * 0.9 + r.landing * 0.5);
      if (seated) { thigh = 1.5; knee = -1.5; }
      if (bike) { thigh = 1.0 + swing * 0.45; knee = -1.1 - (i ? cphase : -cphase) * 0.4; }
      thigh *= 1 - r.fall;
      knee *= 1 - r.fall;
      this.hipJoints[i].rotation.set(thigh, 0, side * r.fall * 0.15);
      this.knees[i].rotation.set(knee, 0, 0);
      this.ankles[i].rotation.set(-thigh - knee, 0, 0);
    }
  }

  dispose() {
    for (const meshes of this.meshes)
      for (const s of SEGMENTS) {
        meshes[s].removeFromParent();
        meshes[s].geometry.dispose();
        meshes[s].dispose();
      }
    this.material.dispose();
  }
}
