import {applyDancePose} from './emotes/dancePose.ts';
import * as THREE from "three";
import { updatePlayerIdentity, disposePlayerIdentity } from "./playerIdentity.ts";
import { CHARACTER_NAMES, LIME_KIND, LIME_SPEED, LIME_BOOST_SPEED, impactPose, ATTACK_COOLDOWN_MS, SLIDE_ANIM, tramDerailFrame, type VehicleState, TRAM_KIND, POLYBAHN_KIND, type PlayerState } from "@race/shared";

// The seated owner can turn through their torso; show the body in third person
// and to other players, while keeping the owning rail camera clear.
export function firstPersonBodyVisible(p: Pick<PlayerState, "anim" | "vehicleId" | "vehicleKind" | "cabinStanding">, perspective: number) {
  return perspective === 0 && !(p.vehicleId && !p.cabinStanding && (p.vehicleKind === TRAM_KIND || p.vehicleKind === POLYBAHN_KIND));
}

// Original articulated models: all outfits share geometry, joints and motion.
export const CHARACTERS = CHARACTER_NAMES;
const cube = new THREE.BoxGeometry(1, 1, 1), facet = new THREE.DodecahedronGeometry(1, 0);
const logShape = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const tapered = new THREE.CylinderGeometry(0.5, 0.42, 1, 8);
const shoeShape = new THREE.CapsuleGeometry(0.5, 0.45, 1, 6).rotateX(Math.PI / 2);
interface Limb { joint: THREE.Group; bend: THREE.Group; tip: THREE.Group; foot?: THREE.Mesh; toe?: THREE.Group }
interface Rig {
  torso: THREE.Group; chest: THREE.Group; head: THREE.Group; neck: THREE.Group; arms: Limb[]; legs: Limb[];
  viewArms?: THREE.Group;
  can?: THREE.Group;
  canFlavor?: number;
  phase: number; fall: number; speed: number; grounded: boolean; landing: number; air: number; firstPerson: boolean; slide: number;
}
const rigs = new WeakMap<THREE.Group, Rig>();
export function avatar(color: string, character = 0, firstPerson = false) {
  const root = new THREE.Group(), torso = new THREE.Group(), chest = new THREE.Group(), head = new THREE.Group();
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
  const female = character === 1, einstein = character === 2, rector = character === 3, sahur = character === 4;
  const skin = sahur ? "#a8713e" : female ? "#e8bea1" : rector ? "#dfb69d" : einstein ? "#e3b797" : "#d9a37a";
  const shirt = sahur ? skin : female ? "#688c82" : rector ? "#343d4a" : einstein ? "#85887e" : "#386889";
  const pants = sahur ? skin : female ? "#344457" : rector ? shirt : einstein ? "#555b5b" : "#263947";
  const hair = female ? "#d8b766" : rector ? "#a9aaa7" : "#302a31";
  if (!sahur) {
  part(torso, [female ? 0.44 : 0.47, 0.48, 0.28], [0, 0.28, 0], shirt, false, tapered);
  part(torso, [0.41, 0.14, 0.27], [0, 0.02, 0], pants, false, tapered);
  if (!firstPerson) part(torso, [0.16, 0.12, 0.15], [0, 0.59, 0], skin);
  part(torso, [rector ? 0.20 : 0.075, 0.26, 0.015], [0, 0.32, 0.151], einstein ? "#292d35" : "#ede9db");
  if (rector) {
    for (const side of [-1, 1]) {
      part(torso, [0.085, 0.27, 0.025], [side * 0.11, 0.38, 0.17], "#505b6a").rotation.z = side * -0.30;
      part(torso, [0.07, 0.07, 0.018], [side * 0.05, 0.48, 0.177], "#faf6ef").rotation.z = side * 0.45;
    }
    part(torso, [0.045, 0.19, 0.02], [0, 0.35, 0.18], "#6b3542");
    part(torso, [0.055, 0.045, 0.02], [0, 0.46, 0.18], "#6b3542");
    for (const y of [0.18, 0.25]) part(torso, [0.018, 0.018, 0.025], [0.025, y, 0.165], "#1f2630");
  }
  part(torso, [rector ? 0.055 : 0.10, rector ? 0.025 : 0.085, 0.018], [-0.14, 0.40, rector ? 0.182 : 0.152], color);
  }
  const neck = new THREE.Group(); neck.name = "neck"; neck.position.y = 0.66;
  torso.add(neck); neck.add(head); head.position.y = 0.16;
  head.visible = !firstPerson; // The owning camera must never see inside its head/hair.
  if (sahur) {
    // Two aligned wooden sections retain the existing neck/chest articulation.
    part(torso,[.52,.7,.46],[0,.29,0],skin,false,logShape);
    part(head,[.52,.55,.46],[0,-.035,0],skin,false,logShape);
    for (const side of [-1,1]) {
      part(head,[.12,.14,.045],[side*.115,.035,.222],"#eee5d2",true);
      part(head,[.045,.06,.025],[side*.115,.035,.248],"#21150f",true);
      part(head,[.13,.025,.025],[side*.115,.14,.225],"#80502b");
    }
    part(head,[.055,.08,.18],[0,-.075,.35],skin,true);
    part(head,[.15,.025,.025],[0,-.18,.228],"#21150f");
    for (const x of [-.17,-.055,.09,.19]) part(torso,[.008,.6,.008],[x,.28,Math.sqrt(.23*.23-x*x)],"#80502b");
  } else {
  part(head, [0.22, 0.265, 0.20], [0, 0, 0], skin, true);
  part(head, [0.045, 0.06, 0.07], [0, -0.03, 0.20], skin, true);
  for (const side of [-1, 1]) {
    part(head, [0.05, 0.075, 0.055], [side * 0.21, -0.02, 0], skin, true);
    part(head, [0.066, 0.043, 0.025], [side * 0.08, 0.028, 0.19], "#faf6ef");
    part(head, [0.025, 0.032, 0.02], [side * 0.08, 0.025, 0.209], "#222a31");
    part(head, [0.072, 0.018, 0.025], [side * 0.08, 0.087, 0.191], einstein ? "#e4e6dc" : rector ? "#777b7b" : female ? "#aa884c" : "#282634");
  }
  part(head, [0.09, 0.016, 0.02], [0, -0.13, 0.18], "#915e54");
  if (einstein) {
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * Math.PI * 2;
      part(head, [0.13, 0.13, 0.13], [Math.cos(a) * 0.21, 0.16 + Math.sin(i * 2) * 0.07, Math.sin(a) * 0.17 - 0.025], "#e8e9dd", true);
    }
    part(head, [0.18, 0.045, 0.045], [0, -0.092, 0.21], "#ecebdf");
  } else {
    if (rector) {
      // A receding, swept-back crown and silver temples distinguish his silhouette.
      part(head, [0.20, 0.09, 0.18], [0, 0.22, -0.07], hair, true);
      for (const side of [-1, 1]) part(head, [0.055, 0.17, 0.16], [side * 0.195, 0.12, -0.035], "#c4c7c4", true);
      for (let i = 0; i < 3; i++) {
        const sweep = part(head, [0.075, 0.055, 0.19], [-0.10 + i * 0.075, 0.27, -0.045], i === 1 ? "#c4c7c4" : hair, true);
        sweep.rotation.z = -0.24; sweep.rotation.x = -0.22;
      }
    } else part(head, [0.21, 0.12, 0.20], [0, 0.22, -0.025], hair, true);
    if (female) {
      part(head, [0.26, 0.30, 0.13], [0, -0.01, -0.19], hair, true).name = "ponytail";
      for (const side of [-1, 1]) part(head, [0.07, 0.28, 0.10], [side * 0.18, 0.04, -0.04], hair);
    }
    if (!female) {
      if (!rector) part(head, [0.20, 0.045, 0.13], [-0.055, 0.21, 0.12], hair);
      for (const x of [-0.09, 0.09]) {
        for (const y of [-0.025, 0.085]) part(head, [0.15, 0.016, 0.02], [x, y, 0.222], "#192530");
        for (const side of [-1, 1]) part(head, [0.016, 0.11, 0.02], [x + side * 0.068, 0.03, 0.222], "#192530");
      }
      part(head, [0.04, 0.016, 0.02], [0, 0.03, 0.222], "#192530");
      if (!rector) {
        part(torso, [0.35, 0.42, 0.17], [0, 0.27, -0.23], "#bc824f");
        for (const x of [-0.16, 0.16]) part(torso, [0.035, 0.43, 0.028], [x, 0.28, 0.153], "#c69760");
      }
    }
  }
  }
  const limb = (x: number, y: number, length: number, width: number, upper: string, lower: string, leg = false): Limb => {
    const joint = new THREE.Group(), bend = new THREE.Group(), tip = new THREE.Group();
    joint.position.set(x, y, 0); torso.add(joint);
    part(joint, [width, length, width], [0, -length / 2, 0], upper, false, tapered);
    bend.position.y = -length; joint.add(bend);
    part(bend, [width * 0.85, length * 0.9, width * 0.9], [0, -length * 0.45, 0], lower, false, tapered);
    tip.position.y = -length * 0.95; bend.add(tip);
    const foot = part(tip, leg ? [0.19, 0.11, 0.22] : [0.055, 0.065, 0.065], [0, 0, leg ? 0.07 : 0], leg ? sahur ? skin : rector ? "#20252b" : "#e8dfcb" : skin, !leg, leg ? shoeShape : facet);
    foot.name = leg ? "shoe" : "hand";
    let toe: THREE.Group | undefined;
    if (leg) { toe = new THREE.Group(); toe.position.z = 0.07; tip.add(toe); toe.add(foot); foot.position.z = 0; }
    return { joint, bend, tip, foot: leg ? foot : undefined, toe };
  };
  const arms = [1, -1].map(side => limb(side * (firstPerson ? 0.25 : female ? 0.28 : 0.30), firstPerson ? 0.56 : 0.50, 0.24, 0.14, shirt, rector ? shirt : skin));
  const legs = [1, -1].map(side => limb(side * 0.13, 0, 0.33, 0.17, pants, pants, true));
  [arms, legs].forEach((pair, i) => pair.forEach((limb, side) => {
    const name = side ? "right" : "left";
    limb.joint.name = `${name}-${i ? "leg" : "arm"}`;
    limb.bend.name = `${name}-${i ? "knee" : "elbow"}`;
    limb.tip.name = `${name}-${i ? "ankle" : "wrist"}`;
    if (limb.toe) limb.toe.name = `${name}-toe`;
  }));
  if (sahur) {
    // Attach his oversized wooden club to the wrist so every existing pose
    // carries it naturally, including the lobby and first-person arms.
    const stick = new THREE.Group(); stick.name = "sahur-stick";
    stick.rotation.x = Math.PI / 2;
    arms[1].tip.add(stick);
    part(stick, [.09, .32, .09], [0, -.08, 0], "#69401f", false, logShape);
    part(stick, [.19, .9, .19], [0, .52, 0], "#a8713e", false, tapered);
    part(stick, [.12, .055, .12], [0, -.25, 0], "#69401f", false, logShape);
  }
  // Split at the waist without changing any of the original mesh pieces.
  chest.name = "chest"; torso.add(chest);
  for (const child of [...torso.children]) {
    if (child === neck || arms.some(arm => arm.joint === child) ||
      (child instanceof THREE.Mesh && child.position.y > 0.1)) chest.add(child);
  }
  let viewArms: THREE.Group | undefined;
  if (firstPerson) {
    // Keep legs in the world; arms follow gaze without a chest filling the screen.
    // The torso and feet remain visible below the eyes; only the head is hidden.
    viewArms = new THREE.Group(); viewArms.name = "view-arms"; viewArms.position.set(0, 1.6, 0.15); root.add(viewArms);
    for (const arm of arms) { arm.joint.position.set(arm.joint.position.x < 0 ? -0.34 : 0.34, -0.32, 0.12); viewArms.add(arm.joint); }
  }
  rigs.set(root, { torso, chest, head, neck, arms, legs, viewArms, slide: 0, phase: 0, fall: 0, speed: 0, grounded: true, landing: 0, air: 0, firstPerson });
  return root;
}

export function bagCarryPose(mesh:THREE.Group,p:PlayerState){const r=rigs.get(mesh);if(!r||r.firstPerson||p.knockdownUntil>p.simTime)return;const arm=r.arms[0];arm.joint.rotation.set(-.65,0,-.12);arm.bend.rotation.set(-.6,0,0);arm.tip.rotation.set(0,0,0);}
export function dancePose(mesh:THREE.Group,id:string,time:number){const rig=rigs.get(mesh);if(rig&&!rig.firstPerson)applyDancePose(rig,id,time);}

// Roughly 3–4 alternating footfalls per second, not six tiny sprint steps.
// Can clones share immutable resources owned by MateFeature, never by the rig.
export function equipMateCan(mesh: THREE.Group, source: THREE.Group, flavor: number) {
  const r = rigs.get(mesh);
  if (!r || r.canFlavor === flavor) return;
  r.can?.removeFromParent();
  const can = new THREE.Group(), model = source.clone(true);
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
  const scale = .16 / Math.max(.001, bounds.max.y - bounds.min.y);
  model.position.sub(center); can.add(model); can.scale.setScalar(scale);
  can.position.set(0, -.015, .045); can.visible = false; can.name = `held-mate-${flavor}`;
  r.arms[1].tip.add(can); r.can = can; r.canFlavor = flavor;
}
export function gaitRate(speed: number) { return Math.PI * 2 * (1.15 + Math.min(speed, 16.5) * 0.055) * Math.min(1, speed / 2); }
export function pose(mesh: THREE.Group, p: PlayerState, dt = 1 / 60, pitch = 0, camera?: THREE.PerspectiveCamera, knifeEquipped = false) {
  const r = rigs.get(mesh)!;
  const blend = 1 - Math.exp(-14 * Math.min(dt, 0.1));
  const down = p.anim === 3 || p.knockdownUntil > p.simTime;
  const impact = impactPose(p);
  const sliding = p.anim === SLIDE_ANIM && !down;
  r.slide += ((sliding ? 1 : 0) - r.slide) * blend;
  const drinkAge = (p.simTime - (p.mateDrinkStartedAt ?? 0)) / 1000;
  const drinking = !down && !p.vehicleId && (p.mateDrinkStartedAt ?? 0) > 0 && drinkAge >= 0 && drinkAge < 1.3;
  const sip = drinking ? THREE.MathUtils.smoothstep(drinkAge, 0, .3) * (1 - THREE.MathUtils.smoothstep(drinkAge, .95, 1.3)) : 0;
  if (r.can) r.can.visible = drinking;
  mesh.scale.setScalar(p.vehicleId && p.cabinStanding ? .85 : 1);
  const riding = !!p.vehicleId && !p.cabinStanding, bike = riding && p.vehicleKind === 2, scooter=riding&&p.vehicleKind===LIME_KIND;
  r.speed += ((down || riding ? 0 : Math.hypot(p.vx, p.vz)) - r.speed) * blend;
  if ((p.grounded && !sliding) || bike) r.phase += (bike ? Math.hypot(p.vx, p.vz) * 0.85 : gaitRate(r.speed)) * dt;
  r.fall += ((impact.active ? impact.fall : down ? 1 : 0) - r.fall) * (1 - Math.exp(-(down ? 9 : 5) * dt));
  if (p.grounded && !r.grounded && !down && !riding) r.landing = 1;
  r.grounded = p.grounded; r.landing *= Math.exp(-10 * dt);
  const run = Math.min(1, r.speed / 9), airborne = !p.grounded && !riding && !down;
  r.air += ((airborne ? 1 : 0) - r.air) * blend;
  const scooterSpeed = scooter ? Math.hypot(p.vx, p.vz) : 0;
  const scooterBoost = THREE.MathUtils.clamp((scooterSpeed - LIME_SPEED) / (LIME_BOOST_SPEED - LIME_SPEED), 0, 1);
  const scooterLean = scooter && p.seat === 0 ? .08 + scooterBoost * .10 : 0;
  const stride = run * (1 - r.air) * (1 - r.slide);
  const forward = (p.vx * Math.sin(p.rotY) + p.vz * Math.cos(p.rotY)) / Math.max(0.1, Math.hypot(p.vx, p.vz));
  const sideways = (p.vx * Math.cos(p.rotY) - p.vz * Math.sin(p.rotY)) / Math.max(0.1, Math.hypot(p.vx, p.vz));
  const attack = Math.max(0, p.attackReadyAt - p.simTime - ATTACK_COOLDOWN_MS + 420) / 420;
  const punch = !knifeEquipped && !down && !riding ? Math.sin(Math.min(1, attack) * Math.PI) : 0;
  const hookSweep = THREE.MathUtils.clamp((1 - attack - 0.15) / 0.55, 0, 1);
  mesh.position.set(p.x, p.y, p.z); mesh.rotation.set(0, p.rotY, 0);
  if (r.viewArms) {
    r.viewArms.rotation.x = -(camera?.rotation.x ?? pitch);
    r.viewArms.rotation.z = camera?.rotation.z ?? 0;
    if (camera) {
      mesh.updateMatrixWorld(true);
      r.viewArms.position.copy(camera.position);
      mesh.worldToLocal(r.viewArms.position);
    } else r.viewArms.position.set(0, 1.6 - r.slide * 0.78, 0.15);
  }
  r.torso.position.y = (scooter ? .70 : riding ? 0.25 : 0.75) - r.fall * 0.47 - r.slide * 0.49 - r.landing * 0.09 + Math.sin(r.phase * 2) * stride * 0.025;
  r.torso.position.z = scooter ? (p.seat === 0 ? .30 : -.08) : 0;
  r.torso.rotation.set(-r.fall * 1.52 + stride * forward * 0.14 - r.slide * 0.42 + (bike ? 0.30 : scooterLean), 0, Math.cos(r.phase) * (bike ? Math.min(1, Math.hypot(p.vx, p.vz) / 8) * 0.025 : stride * 0.025));
  r.chest.rotation.set(r.landing * 0.12, Math.sin(r.phase) * stride * 0.06 + punch * (-0.20 + hookSweep * 0.55), 0);
  r.head.rotation.set(0, punch * -0.15, Math.sin(p.simTime / 1100) * 0.018);
  r.arms.forEach((arm, i) => {
    const swing = Math.sin(r.phase + i * Math.PI);
    const gait = -swing * stride * (r.firstPerson ? 0.16 : 0.72);
    let upper = scooter ? (p.seat===0?-1.22 - scooterLean:.35) : bike ? -1.05 : riding ? -0.8 : r.firstPerson ? gait - 0.62 - run * 0.22 : gait;
    let elbow = bike ? -0.42 : r.firstPerson ? -(0.85 + run * 0.25 + swing * stride * 0.12) : -(0.20 + run * 0.85 + Math.max(0, swing) * stride * 0.25);
    if(scooter)elbow=p.seat===0?-.24:-.95;
    upper = upper * (1 - r.slide) + (r.firstPerson ? -0.55 : -0.4) * r.slide;
    elbow = elbow * (1 - r.slide) - r.slide * 0.85;
    if (r.firstPerson) {
      const side = i ? -1 : 1;
      const spread = camera ? THREE.MathUtils.clamp(camera.aspect, 0.65, 1.6) : 1;
      arm.joint.position.x = side * (0.43 + Math.sin(r.phase + i * Math.PI) * stride * 0.055) * spread;
      arm.joint.position.y = -0.40;
    }
    const action = i ? punch : 0;
    if (r.firstPerson) {
      arm.joint.position.y += punch * (i ? 0.30 : 0.14);
      if (i) arm.joint.position.x += action * 0.12 * (camera ? THREE.MathUtils.clamp(camera.aspect, 0.65, 1.6) : 1);
    }
    // Raise the right elbow, sweep the shoulder across the chest and keep
    // the forearm bent sideways instead of extending a straight jab.
    upper += (-1.4 - upper) * action;
    elbow += (-0.20 - elbow) * action;
    if (i === 0) { upper -= punch * 0.45; elbow -= punch * 0.35; }
    if (i === 1) {
      upper += (-1.15 - upper) * sip; elbow += (-2.1 - elbow) * sip;
      if (r.firstPerson) { arm.joint.position.x += .28 * sip; arm.joint.position.y += .16 * sip; }
    }
    const swayYaw = r.firstPerson ? (i ? -1 : 1) * Math.sin(r.phase + i * Math.PI) * stride * 0.16 : 0;
    arm.joint.rotation.y += (swayYaw + action * (-0.9 + hookSweep * 1.9) + (i === 1 ? .32 * sip : 0) - arm.joint.rotation.y) * blend;
    arm.bend.rotation.z += (action * 1.35 - arm.bend.rotation.z) * blend;
    arm.joint.rotation.x += (upper - arm.joint.rotation.x) * blend;
    arm.joint.rotation.z += ((i === 0 ? 1 : -1) * (-0.10 + r.fall * 0.55 - (r.firstPerson ? 0.12 + Math.cos(r.phase + i * Math.PI) * stride * 0.08 : 0)) - arm.joint.rotation.z) * blend;
    arm.bend.rotation.x += (elbow - arm.bend.rotation.x) * blend;
    arm.tip.rotation.x += ((-0.08 - stride * 0.12) - arm.tip.rotation.x) * blend;
  });
  r.legs.forEach((leg, i) => {
    const swing = Math.sin(r.phase + i * Math.PI);
    const upper = scooter ? (i?.26:.12) : bike ? -0.85 + swing * 0.48 : riding ? -1.35 : swing * stride * forward * 0.85 - r.slide * (i ? 1.5 : 0.98);
    const knee = scooter ? (i?.32:.18) : bike ? 1.35 - swing * 0.62 : riding ? 1.3 : Math.pow(Math.max(0, -swing * forward), 1.5) * stride * 1.55 + r.landing * 0.45 + r.slide * (i ? 1.6 : 0.18);
    leg.joint.rotation.x += (upper - leg.joint.rotation.x) * blend;
    leg.joint.rotation.z += (swing * stride * sideways * 0.3 - leg.joint.rotation.z) * blend;
    leg.bend.rotation.x += (knee - leg.bend.rotation.x) * blend;
    leg.tip.rotation.x += ((scooter ? -upper - knee - scooterLean : bike ? -upper - knee - 0.30 : -knee * 0.3 + Math.max(0, swing * forward) * stride * 0.22) - leg.tip.rotation.x) * blend;
  });
  if (impact.active || r.fall > 0.015) {
    const force = Math.hypot(p.impactX ?? 0, p.impactZ ?? 0);
    const forwardHit = force ? ((p.impactX ?? 0) * Math.sin(p.rotY) + (p.impactZ ?? 0) * Math.cos(p.rotY)) / force : -1;
    const sideHit = force ? ((p.impactX ?? 0) * Math.cos(p.rotY) - (p.impactZ ?? 0) * Math.sin(p.rotY)) / force : 0;
    const support = Math.sin(impact.rise * Math.PI), f = r.fall;
    const tilt = f * 1.52;
    r.torso.rotation.x = Math.atan2(forwardHit * Math.sin(tilt), Math.cos(tilt));
    r.torso.rotation.z = -Math.asin(sideHit * Math.sin(tilt));
    r.torso.position.y = 0.75 - f * 0.43 - support * 0.14;
    r.chest.rotation.x = support * 0.55 - impact.recoil * 0.18;
    r.neck.rotation.x = -support * 0.35 + impact.recoil * 0.20;
    r.arms.forEach((arm, i) => {
      const reach = r.firstPerson ? -1.2 - support * 0.4 : -0.3 - support * 1.1;
      if (r.firstPerson) {
        const spread = camera ? THREE.MathUtils.clamp(camera.aspect, 0.65, 1.6) : 1;
        arm.joint.position.x = (i ? -1 : 1) * (0.43 - f * 0.14) * spread;
        arm.joint.position.y = -0.40 + f * 0.18;
      }
      arm.joint.rotation.x += (reach - arm.joint.rotation.x) * blend * f;
      arm.joint.rotation.z += (((i ? -1 : 1) * (0.38 * f + 0.25 * impact.recoil)) - arm.joint.rotation.z) * blend;
      arm.bend.rotation.x += ((-0.5 - support * 0.75) - arm.bend.rotation.x) * blend;
      arm.tip.rotation.x += ((support * 0.5) - arm.tip.rotation.x) * blend;
    });
    r.legs.forEach((leg, i) => {
      leg.joint.rotation.x += ((-support * (i ? 1.1 : 0.6) - f * 0.12) - leg.joint.rotation.x) * blend;
      leg.bend.rotation.x += ((support * (i ? 1.6 : 1.1) + f * 0.15) - leg.bend.rotation.x) * blend;
      leg.tip.rotation.x += ((-support * 0.4) - leg.tip.rotation.x) * blend;
      if (leg.toe) leg.toe.rotation.x = support * 0.45;
    });
  } else {
    r.neck.rotation.x *= 1 - blend;
    for (const leg of r.legs) if (leg.toe) leg.toe.rotation.x *= 1 - blend;
  }
  if((p.moodleSitUntil??0)>p.simTime&&!p.vehicleId){
    r.torso.position.y=.31;r.torso.rotation.set(.12,0,0);r.head.rotation.x=.2;
    for(const leg of r.legs){leg.joint.rotation.set(-1.45,0,0);leg.bend.rotation.x=1.45;}
    for(const arm of r.arms){arm.joint.rotation.x=-.55;arm.bend.rotation.x=-.65;}
  }
  updatePlayerIdentity(mesh, p);
}
export function disposeAvatar(mesh: THREE.Group) {
  rigs.get(mesh)?.can?.removeFromParent();
  disposePlayerIdentity(mesh);
  const materials = new Set<THREE.Material>();
  mesh.traverse(child => { if (child instanceof THREE.Mesh) materials.add(child.material as THREE.Material); });
  materials.forEach(m => m.dispose()); mesh.removeFromParent(); rigs.delete(mesh);
}

// Keep walking feet and body aligned with the sloped cabin floor.
export function alignCabinAvatar(mesh: THREE.Group, p: PlayerState, v?: VehicleState) {
  if (!v || v.kind !== POLYBAHN_KIND || !p.cabinStanding) return;
  const f = tramDerailFrame(v, 0);
  mesh.quaternion.setFromEuler(new THREE.Euler(f.pitch, f.rotY, 0, "YXZ"));
  mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.cabinYaw ?? 0));
}
