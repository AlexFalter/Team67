import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { BRIDGE_COWS, bridgeCowPose, cowMooAge, zurichWorld } from '@race/shared';
import type { GameAudio } from './gameAudio.ts';

// The source's broad skin regions accidentally bind inner rear hooves to the
// tail and leave inner leg faces attached to the torso. Rebind these vertices
// consistently across material seams, without changing the supplied geometry.
function repairLegWeights(model: THREE.Object3D) {
  const smooth = (a: number, b: number, value: number) => THREE.MathUtils.smoothstep(value, a, b);
  model.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const positions = node.geometry.getAttribute('position'), indices = node.geometry.getAttribute('skinIndex'), weights = node.geometry.getAttribute('skinWeight');
    const bone = (name: string) => node.skeleton.bones.findIndex(b => b.name === name);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      if (y < .9 && ['Material.003', 'Material.004'].includes((node.material as THREE.Material).name)) {
        indices.setXYZW(i, bone('body'), 0, 0, 0); weights.setXYZW(i, 1, 0, 0, 0); continue;
      }
      const front = Math.abs(z - .336) < Math.abs(z + 1.21), legZ = front ? .336 : -1.21;
      if (y >= .9 || Math.abs(z - legZ) > .24 || Math.abs(x) < .025 || Math.abs(x) > .34) continue;
      // The actual tail stops above .5 m. Keep it independent of the hind legs.
      if (!front && Math.abs(x) < .075 && y > .5 && z < -1.31) continue;
      const name = `${front ? 'F' : 'H'}${x < 0 ? 'L' : 'R'}`;
      const side = y < .4 ? 1 : smooth(.02, .12, Math.abs(x));
      const torso = 1 - (1 - smooth(.55, .89, y)) * side, lower = 1 - smooth(.36, .5, y), hoof = 1 - smooth(.105, .17, y);
      indices.setXYZW(i, bone(`hoof${name}`), bone(`lower${name}`), bone(`upper${name}`), bone('body'));
      weights.setXYZW(i, hoof * (1 - torso), (1 - hoof) * lower * (1 - torso), (1 - hoof) * (1 - lower) * (1 - torso), torso);
    }
    indices.needsUpdate = weights.needsUpdate = true;
  });
}

// Build a larger four-beat gait from the supplied rig. Two-joint IK keeps
// planted hooves level while the shoulders and hips shift their weight.
function walkingClip(model: THREE.Object3D, idle: THREE.AnimationClip) {
  const bones: THREE.Bone[] = [];
  model.traverse(node => { if (node instanceof THREE.Bone) bones.push(node); });
  const rest = new Map(bones.map(bone => [bone.name, { position: bone.position.clone(), rotation: bone.quaternion.clone() }]));
  model.updateMatrixWorld(true);
  const body = model.getObjectByName('body')!;
  const legs = ['FL', 'FR', 'HL', 'HR'].map((name, i) => {
    const upper = model.getObjectByName(`upper${name}`)!, lower = model.getObjectByName(`lower${name}`)!, hoof = model.getObjectByName(`hoof${name}`)!;
    return { upper, lower, hoof, foot: hoof.getWorldPosition(new THREE.Vector3()), orientation: hoof.getWorldQuaternion(new THREE.Quaternion()), a: lower.position.length(), b: hoof.position.length(), offset: [0, .5, .75, .25][i] };
  });
  const times: number[] = [], values = new Map<string, number[]>();
  const xAxis = new THREE.Vector3(1, 0, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const orient = (bone: THREE.Object3D, world: THREE.Quaternion) => {
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    bone.updateWorldMatrix(false, true);
  };
  for (let frame = 0; frame <= 96; frame++) {
    const phase = frame / 96, angle = phase * Math.PI * 2;
    times.push(phase);
    for (const bone of bones) { const r = rest.get(bone.name)!; bone.position.copy(r.position); bone.quaternion.copy(r.rotation); }
    body.position.y -= .06 + .012 * Math.cos(angle * 2);
    body.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(zAxis, .018 * Math.sin(angle)));
    for (const [name, pitch] of [['neck', .025], ['head', .045]] as const) model.getObjectByName(name)!.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(xAxis, pitch * Math.sin(angle * 2 + .5)));
    model.getObjectByName('tail')!.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, .16 * Math.sin(angle + .8)));
    model.updateMatrixWorld(true);
    for (const leg of legs) {
      const u = (phase + leg.offset) % 1, swing = Math.max(0, (u - .65) / .35);
      const stride = u < .65 ? .26 - .52 * u / .65 : -.26 + .52 * swing;
      const foot = leg.foot.clone(); foot.z += stride;
      foot.y += .13 * Math.sin(Math.PI * swing) ** 2;
      const hip = leg.upper.getWorldPosition(new THREE.Vector3());
      foot.x = hip.x; // keep every leg on its hinge plane; shortest-arc rotations can twist near vertical
      const delta = foot.clone().sub(hip);
      const length = Math.min(delta.length(), leg.a + leg.b - .0001), direction = delta.normalize();
      const along = (leg.a * leg.a - leg.b * leg.b + length * length) / (2 * length);
      const bend = new THREE.Vector3(0, direction.z, -direction.y).normalize().negate();
      const knee = hip.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, leg.a * leg.a - along * along)));
      orient(leg.upper, new THREE.Quaternion().setFromAxisAngle(xAxis, Math.atan2(knee.z - hip.z, knee.y - hip.y)));
      orient(leg.lower, new THREE.Quaternion().setFromAxisAngle(xAxis, Math.atan2(foot.z - knee.z, foot.y - knee.y)));
      orient(leg.hoof, leg.orientation.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(xAxis, -.16 * Math.sin(Math.PI * swing))));
    }
    for (const bone of bones) {
      const key = `${bone.name}.quaternion`, samples = values.get(key) ?? [];
      samples.push(...bone.quaternion.toArray()); values.set(key, samples);
    }
    const samples = values.get('body.position') ?? []; samples.push(...body.position.toArray()); values.set('body.position', samples);
  }
  for (const bone of bones) { const r = rest.get(bone.name)!; bone.position.copy(r.position); bone.quaternion.copy(r.rotation); }
  model.updateMatrixWorld(true);
  const tracks = idle.tracks.filter(track => !values.has(track.name)).map(track => track.clone());
  for (const [name, samples] of values) tracks.push(name.endsWith('.position') ? new THREE.VectorKeyframeTrack(name, times, samples) : new THREE.QuaternionKeyframeTrack(name, times, samples));
  return new THREE.AnimationClip('BridgeWalk', 1, tracks);
}

interface Cow {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  walk: THREE.AnimationAction;
  idle: THREE.AnimationAction;
  moo: THREE.AnimationAction;
}
// One loaded model, shared geometry/materials, independent skeletons and mixers.
export class BridgeCows {
  readonly ready: Promise<void>;
  private cows: Cow[] = [];
  private source?: THREE.Group;
  private previousNow?: number;
  private abort = new AbortController();
  constructor(private scene: THREE.Scene, private audio: GameAudio) {
    this.ready = this.load().catch(error => {
      if (!this.abort.signal.aborted) console.warn('Bridge cow model could not load', error);
    });
  }
  private async load() {
    const response = await fetch(`${(import.meta.env?.BASE_URL ?? "/")}models/animals/cow.glb`, { signal: this.abort.signal });
    if (!response.ok) throw Error(`Cow model: ${response.status}`);
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    this.source = gltf.scene;
    if (this.abort.signal.aborted) { this.disposeSource(); return; }
    repairLegWeights(gltf.scene);
    const suppliedMoo = gltf.animations.find(clip => clip.name === 'Moo')!;
    const idleClip = new THREE.AnimationClip('BridgeIdle', 1, suppliedMoo.tracks.map(track => {
      const rest = track.clone(); rest.times = new Float32Array([0]);
      rest.values = track.values.slice(0, track.getValueSize()); return rest;
    }));
    const walkClip = walkingClip(gltf.scene, idleClip);
    const tail = gltf.scene.getObjectByName('tail')!, tailRest = tail.quaternion.clone();
    const times = Array.from({ length: 97 }, (_, i) => i * 6 / 96), values: number[] = [];
    for (const time of times) values.push(...tailRest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .1 * Math.sin(time / 6 * Math.PI * 2))).toArray());
    idleClip.tracks = idleClip.tracks.filter(track => track.name !== 'tail.quaternion');
    idleClip.tracks.push(new THREE.QuaternionKeyframeTrack('tail.quaternion', times, values));
    idleClip.duration = 6;
    // Moo head/jaw motion layers over walking instead of stopping the legs.
    const mooClip = new THREE.AnimationClip('BridgeMoo', suppliedMoo.duration,
      suppliedMoo.tracks.filter(track => /^(head|neck|jaw)\.quaternion$/.test(track.name)).map(track => track.clone()));
    THREE.AnimationUtils.makeClipAdditive(mooClip, 0);
    for (const { id } of BRIDGE_COWS) {
      const root = new THREE.Group(), model = clone(gltf.scene);
      root.name = `Bridge cow ${id + 1}`;
      // Both the supplied rig and gameplay heading face +Z.
      root.add(model); this.scene.add(root);
      model.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } });
      const mixer = new THREE.AnimationMixer(model);
      const walk = mixer.clipAction(walkClip).play(), idle = mixer.clipAction(idleClip).play(), moo = mixer.clipAction(mooClip).play();
      this.cows.push({ root, model, mixer, walk, idle, moo });
    }
  }
  update(now: number, listener: THREE.Vector3, audible: boolean) {
    for (let id = 0; id < this.cows.length; id++) {
      const cow = this.cows[id], pose = bridgeCowPose(id, now, zurichWorld), call = cowMooAge(id, now);
      cow.root.position.set(pose.x, pose.y, pose.z); cow.root.rotation.y = pose.rotY;
      const mooing = call.age < 4000;
      const walking = Math.min(1, Math.max(pose.speed, pose.turnSpeed * .12) / .25);
      cow.walk.setEffectiveWeight(walking);
      cow.idle.setEffectiveWeight(1 - walking);
      cow.moo.setEffectiveWeight(mooing ? 1 : 0);
      // Sample shared time directly: late joins, pauses and frame rate cannot drift animation.
      cow.walk.time = pose.phase % cow.walk.getClip().duration;
      cow.idle.time = (now / 1000 + id) % cow.idle.getClip().duration;
      cow.moo.time = call.age / 1000;
      cow.mixer.update(0);
      const cue = now - call.age + 800;
      if (this.previousNow !== undefined && this.previousNow < cue && now >= cue && call.age < 1800 && audible) {
        this.audio.moo(id, listener.distanceTo(cow.root.position));
      }

    }
    this.previousNow = now;
  }
  private disposeSource() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.source?.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    this.source = undefined;
  }
  dispose() {
    this.abort.abort();
    for (const cow of this.cows) { cow.root.removeFromParent(); cow.mixer.stopAllAction(); cow.mixer.uncacheRoot(cow.model); cow.model.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); }); }
    this.cows = []; this.disposeSource();
  }
}
