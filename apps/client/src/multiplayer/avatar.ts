import * as THREE from "three";
import { ATTACK_COOLDOWN_MS, PEEL_COOLDOWN_MS, type PlayerState } from "@race/shared";

// Original articulated models: all outfits share geometry, joints and motion.
export const CHARACTERS = ["CS Student", "Student Athlete", "Albert Einstein"];
const cube = new THREE.BoxGeometry(1, 1, 1), facet = new THREE.DodecahedronGeometry(1, 0);
const tapered = new THREE.CylinderGeometry(0.5, 0.42, 1, 8);
const shoeShape = new THREE.CapsuleGeometry(0.5, 0.45, 1, 6).rotateX(Math.PI / 2);
interface Limb { joint: THREE.Group; bend: THREE.Group; foot?: THREE.Mesh }
interface Rig {
  torso: THREE.Group; head: THREE.Group; arms: Limb[]; legs: Limb[];
  viewArms?: THREE.Group;
  phase: number; fall: number; speed: number; grounded: boolean; landing: number; air: number; firstPerson: boolean;
}
const rigs = new WeakMap<THREE.Group, Rig>();
export function avatar(color: string, character = 0, firstPerson = false) {
  const root = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group();
  root.name = CHARACTERS[character] ?? CHARACTERS[0];
  torso.name = "torso"; head.name = "head";
  root.add(torso); torso.position.y = 0.75;
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const part = (parent: THREE.Object3D, size: number[], at: number[], color: string, rounded = false, geometry: THREE.BufferGeometry = rounded ? facet : cube) => {
    let material = materials.get(color);
    if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }); materials.set(color, material); }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(size[0], size[1], size[2]); mesh.position.set(at[0], at[1], at[2]);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const athlete = character === 1, einstein = character === 2;
  const skin = athlete ? "#955e40" : einstein ? "#e3b797" : "#d9a37a";
  const shirt = athlete ? "#a63851" : einstein ? "#85887e" : "#386889";
  const pants = athlete ? "#263449" : einstein ? "#555b5b" : "#263947";
  part(torso, [athlete ? 0.57 : 0.47, 0.48, 0.28], [0, 0.28, 0], shirt, false, tapered);
  part(torso, [0.41, 0.14, 0.27], [0, 0.02, 0], pants, false, tapered);
  if (!firstPerson) part(torso, [0.16, 0.12, 0.15], [0, 0.59, 0], skin);
  if (athlete) {
    part(torso, [0.16, 0.035, 0.016], [0, 0.43, 0.15], "#f1e4ce");
    part(torso, [0.035, 0.19, 0.016], [0.055, 0.33, 0.15], "#f1e4ce");
  } else part(torso, [0.075, 0.26, 0.015], [0, 0.32, 0.151], einstein ? "#292d35" : "#ede9db");
  part(torso, [0.10, 0.085, 0.018], [-0.14, 0.40, 0.152], color);
  torso.add(head); head.position.y = 0.82;
  head.visible = !firstPerson; // The owning camera must never see inside its head/hair.
  part(head, [0.22, 0.265, 0.20], [0, 0, 0], skin, true);
  part(head, [0.045, 0.06, 0.07], [0, -0.03, 0.20], skin, true);
  for (const side of [-1, 1]) {
    part(head, [0.05, 0.075, 0.055], [side * 0.21, -0.02, 0], skin, true);
    part(head, [0.066, 0.043, 0.025], [side * 0.08, 0.028, 0.19], "#faf6ef");
    part(head, [0.025, 0.032, 0.02], [side * 0.08, 0.025, 0.209], "#222a31");
    part(head, [0.072, 0.018, 0.025], [side * 0.08, 0.087, 0.191], einstein ? "#e4e6dc" : "#282634");
  }
  part(head, [0.09, 0.016, 0.02], [0, -0.13, 0.18], "#915e54");
  if (einstein) {
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * Math.PI * 2;
      part(head, [0.13, 0.13, 0.13], [Math.cos(a) * 0.21, 0.16 + Math.sin(i * 2) * 0.07, Math.sin(a) * 0.17 - 0.025], "#e8e9dd", true);
    }
    part(head, [0.18, 0.045, 0.045], [0, -0.092, 0.21], "#ecebdf");
  } else {
    part(head, [0.21, athlete ? 0.09 : 0.12, 0.20], [0, 0.22, -0.025], "#302a31", true);
    if (!athlete) {
      part(head, [0.20, 0.045, 0.13], [-0.055, 0.21, 0.12], "#302a31");
      for (const x of [-0.09, 0.09]) {
        for (const y of [-0.025, 0.085]) part(head, [0.15, 0.016, 0.02], [x, y, 0.222], "#192530");
        for (const side of [-1, 1]) part(head, [0.016, 0.11, 0.02], [x + side * 0.068, 0.03, 0.222], "#192530");
      }
      part(head, [0.04, 0.016, 0.02], [0, 0.03, 0.222], "#192530");
      part(torso, [0.35, 0.42, 0.17], [0, 0.27, -0.23], "#bc824f");
      for (const x of [-0.16, 0.16]) part(torso, [0.035, 0.43, 0.028], [x, 0.28, 0.153], "#c69760");
    }
  }
  const limb = (x: number, y: number, length: number, width: number, upper: string, lower: string, leg = false): Limb => {
    const joint = new THREE.Group(), bend = new THREE.Group();
    joint.position.set(x, y, 0); torso.add(joint);
    part(joint, [width, length, width], [0, -length / 2, 0], upper, false, tapered);
    bend.position.y = -length; joint.add(bend);
    part(bend, [width * 0.85, length * 0.9, width * 0.9], [0, -length * 0.45, 0], lower, false, tapered);
    const foot = part(bend, leg ? [0.19, 0.11, 0.22] : [0.055, 0.065, 0.065], [0, -length * 0.95, leg ? 0.07 : 0], leg ? "#e8dfcb" : skin, !leg, leg ? shoeShape : facet);
    foot.name = leg ? "shoe" : "hand";
    return { joint, bend, foot: leg ? foot : undefined };
  };
  const arms = [1, -1].map(side => limb(side * (firstPerson ? 0.25 : athlete ? 0.35 : 0.30), firstPerson ? 0.56 : 0.50, 0.24, 0.14, athlete ? "#f1e4ce" : shirt, skin));
  const legs = [1, -1].map(side => limb(side * 0.13, 0, 0.33, 0.17, pants, athlete ? skin : pants, true));
  [arms, legs].forEach((pair, i) => pair.forEach((limb, side) => { limb.joint.name = `${side ? "right" : "left"}-${i ? "leg" : "arm"}`; }));
  let viewArms: THREE.Group | undefined;
  if (firstPerson) {
    // Keep legs in the world; arms follow gaze without a chest filling the screen.
    torso.children.forEach(child => { if (child instanceof THREE.Mesh) child.visible = false; });
    viewArms = new THREE.Group(); viewArms.position.set(0, 1.6, 0.15); root.add(viewArms);
    for (const arm of arms) { arm.joint.position.y -= 0.85; arm.joint.position.z = -0.03; viewArms.add(arm.joint); }
  }
  rigs.set(root, { torso, head, arms, legs, viewArms, phase: 0, fall: 0, speed: 0, grounded: true, landing: 0, air: 0, firstPerson });
  return root;
}

// Roughly 3–4 alternating footfalls per second, not six tiny sprint steps.
export function gaitRate(speed: number) { return Math.PI * 2 * (1.15 + Math.min(speed, 16.5) * 0.055) * Math.min(1, speed / 2); }
export function pose(mesh: THREE.Group, p: PlayerState, dt = 1 / 60, pitch = 0) {
  const r = rigs.get(mesh)!;
  const blend = 1 - Math.exp(-14 * Math.min(dt, 0.1));
  const down = p.anim === 3 || p.knockdownUntil > p.simTime;
  const riding = !!p.vehicleId, bike = riding && p.vehicleKind === 2;
  r.speed += ((down || riding ? 0 : Math.hypot(p.vx, p.vz)) - r.speed) * blend;
  if (p.grounded || bike) r.phase += (bike ? Math.hypot(p.vx, p.vz) * 2 : gaitRate(r.speed)) * dt;
  r.fall += ((down ? 1 : 0) - r.fall) * (1 - Math.exp(-(down ? 9 : 5) * dt));
  if (p.grounded && !r.grounded && !down && !riding) r.landing = 1;
  r.grounded = p.grounded; r.landing *= Math.exp(-10 * dt);
  const run = Math.min(1, r.speed / 9), airborne = !p.grounded && !riding && !down;
  r.air += ((airborne ? 1 : 0) - r.air) * blend;
  const forward = (p.vx * Math.sin(p.rotY) + p.vz * Math.cos(p.rotY)) / Math.max(0.1, Math.hypot(p.vx, p.vz));
  const sideways = (p.vx * Math.cos(p.rotY) - p.vz * Math.sin(p.rotY)) / Math.max(0.1, Math.hypot(p.vx, p.vz));
  const attack = Math.max(0, p.attackReadyAt - p.simTime - ATTACK_COOLDOWN_MS + 420) / 420;
  const punch = Math.sin(Math.min(1, attack) * Math.PI);
  const throwing = Math.sin(Math.max(0, Math.min(1, (p.peelReadyAt - p.simTime - PEEL_COOLDOWN_MS + 420) / 420)) * Math.PI);
  mesh.position.set(p.x, p.y, p.z); mesh.rotation.set(0, p.rotY, 0);
  if (r.viewArms) r.viewArms.rotation.x = -pitch;
  r.torso.position.y = (riding ? 0.25 : 0.75) - r.fall * 0.47 - r.landing * 0.09 + Math.sin(r.phase * 2) * run * (1 - r.air) * 0.025;
  r.torso.rotation.set(-r.fall * 1.52 + run * forward * 0.12 + (bike ? 0.25 : 0), 0, Math.cos(r.phase) * run * (1 - r.air) * 0.025);
  r.head.rotation.set(0, punch * -0.15, Math.sin(p.simTime / 1100) * 0.018);
  r.arms.forEach((arm, i) => {
    const swing = Math.sin(r.phase + i * Math.PI);
    const gait = -swing * run * (1 - r.air) * (r.firstPerson ? 0.28 : 0.65);
    let upper = bike ? -0.95 : riding ? -0.8 : r.firstPerson ? (gait - 0.25 - run) * (1 - r.air) - r.air * 1.2 : gait - r.air * 0.65;
    let elbow = r.firstPerson ? -(0.25 + run * 1.05) * (1 - r.air) - r.air : -(0.25 + run * 0.75 + r.air * 0.45);
    const action = i ? punch : throwing;
    if (!down && !riding) { upper -= action * 1.5; elbow *= 1 - action; }
    arm.joint.rotation.x += (upper - arm.joint.rotation.x) * blend;
    arm.joint.rotation.z += ((i === 0 ? 1 : -1) * (-0.10 + r.fall * 0.55) - arm.joint.rotation.z) * blend;
    arm.bend.rotation.x += (elbow - arm.bend.rotation.x) * blend;
  });
  r.legs.forEach((leg, i) => {
    const swing = Math.sin(r.phase + i * Math.PI);
    const upper = bike ? -0.8 + swing * 0.35 : riding ? -1.35 : swing * run * forward * 0.75 * (1 - r.air) - r.air * (0.35 + i * 0.25);
    const knee = bike ? 1.2 - swing * 0.45 : riding ? 1.3 : Math.max(0, -swing * forward) * run * 1.1 * (1 - r.air) + r.air * 0.65 + r.landing * 0.35;
    leg.joint.rotation.x += (upper - leg.joint.rotation.x) * blend;
    leg.joint.rotation.z += (swing * run * sideways * 0.3 * (1 - r.air) - leg.joint.rotation.z) * blend;
    leg.bend.rotation.x += (knee - leg.bend.rotation.x) * blend;
    (leg.foot!.material as THREE.MeshStandardMaterial).color.set(p.shoes ? "#86efad" : "#e8dfcb");
  });
}
export function disposeAvatar(mesh: THREE.Group) {
  const materials = new Set<THREE.Material>();
  mesh.traverse(child => { if (child instanceof THREE.Mesh) materials.add(child.material as THREE.Material); });
  materials.forEach(m => m.dispose()); mesh.removeFromParent(); rigs.delete(mesh);
}
