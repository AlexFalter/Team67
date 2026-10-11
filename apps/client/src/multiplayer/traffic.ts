import * as THREE from 'three';
import { MAX_TRAFFIC_CARS, TRAFFIC_PALETTES, type TrafficCarState, type TrafficCarKind, type WorldState } from '@race/shared';
import type { TrafficRoadSurface } from './trafficRoadSurface.ts';
import { createTrafficModel, type TrafficWheel } from './trafficModels.ts';

interface Frame extends TrafficCarState { t: number; kind: TrafficCarKind; color: number }
interface Batch {
  body: THREE.InstancedMesh;
  details: THREE.InstancedMesh;
  wheels: THREE.InstancedMesh;
  wheelLayout: TrafficWheel[];
}

export class TrafficRenderer {
  private frames = new Map<string, Frame[]>();
  private travel = new Map<string, { x: number; z: number; distance: number }>();
  private batches: Batch[];
  private paintMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .65, metalness: .12 });
  private detailMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .8 });
  private transform = new THREE.Object3D();
  private ground = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private orientation = new THREE.Quaternion();
  private wheelRotation = new THREE.Quaternion();
  private axle = new THREE.Vector3(1, 0, 0);
  private color = new THREE.Color();

  constructor(private scene: THREE.Scene, private surface?: Pick<TrafficRoadSurface, 'height'>) {
    this.batches = ([0, 1, 2] as const).map(kind => {
      const model = createTrafficModel(kind);
      const body = new THREE.InstancedMesh(model.paint, this.paintMaterial, MAX_TRAFFIC_CARS);
      const details = new THREE.InstancedMesh(model.details, this.detailMaterial, MAX_TRAFFIC_CARS);
      const wheels = new THREE.InstancedMesh(model.tire, this.detailMaterial, MAX_TRAFFIC_CARS * 4);
      for (const mesh of [body, details, wheels]) {
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      }
      scene.add(body, details, wheels);
      return { body, details, wheels, wheelLayout: model.wheels };
    });
  }

  patch(state: WorldState) {
    for (const [id, pose] of state.trafficCars ?? []) {
      let frames = this.frames.get(id);
      if (!frames) { frames = []; this.frames.set(id, frames); }
      const kind = pose.kind === 1 || pose.kind === 2 ? pose.kind : 0;
      const color = Number.isInteger(pose.color) && pose.color! >= 0 && pose.color! < TRAFFIC_PALETTES[kind].length ? pose.color! : 0;
      const frame: Frame = { x: pose.x, y: pose.y, z: pose.z, rotY: pose.rotY, speed: pose.speed, kind, color, t: state.serverTime };
      if (frames.at(-1)?.t === frame.t) frames[frames.length - 1] = frame;
      else frames.push(frame);
      while (frames.length > 2 && frames[1].t < frame.t - 1000) frames.shift();
    }
    for (const id of this.frames.keys()) {
      if (!state.trafficCars?.has(id)) { this.frames.delete(id); this.travel.delete(id); }
    }
  }

  render(time: number) {
    const counts = [0, 0, 0];
    let total = 0;
    for (const [id, frames] of this.frames) {
      if (total >= MAX_TRAFFIC_CARS) break;
      let previous = frames[0], next = previous;
      for (let frame = 1; frame < frames.length; frame++) {
        next = frames[frame];
        if (next.t >= time) break;
        previous = next;
      }
      const fraction = previous === next ? 0 : THREE.MathUtils.clamp((time - previous.t) / (next.t - previous.t), 0, 1);
      const positionX = THREE.MathUtils.lerp(previous.x, next.x, fraction);
      const positionY = THREE.MathUtils.lerp(previous.y, next.y, fraction);
      const positionZ = THREE.MathUtils.lerp(previous.z, next.z, fraction);
      const yaw = previous.rotY + Math.atan2(Math.sin(next.rotY - previous.rotY), Math.cos(next.rotY - previous.rotY)) * fraction;
      const kind = previous.kind, batch = this.batches[kind], index = counts[kind]++;
      const height = (localX: number, localZ: number) => {
        const roadY = this.surface?.height(positionX + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
          positionZ - Math.sin(yaw) * localX + Math.cos(yaw) * localZ, positionY);
        return roadY !== undefined && Math.abs(roadY - positionY) < 3 ? roadY : undefined;
      };
      const groundY = height(0, 0) ?? positionY;
      const rearZ = batch.wheelLayout[0].z, frontZ = batch.wheelLayout[1].z;
      const track = Math.abs(batch.wheelLayout[0].x);
      const front = height(0, frontZ) ?? groundY, rear = height(0, rearZ) ?? groundY;
      const left = height(-track, 0) ?? groundY, right = height(track, 0) ?? groundY;
      this.ground.set(positionX, groundY, positionZ);
      this.transform.rotation.set(-Math.atan2(front - rear, frontZ - rearZ), yaw, Math.atan2(right - left, track * 2), 'YXZ');
      this.orientation.copy(this.transform.quaternion);
      this.transform.scale.set(1, 1, 1);
      this.place(0, 0, 0);
      batch.body.setMatrixAt(index, this.transform.matrix);
      batch.details.setMatrixAt(index, this.transform.matrix);
      batch.body.setColorAt(index, this.color.set(TRAFFIC_PALETTES[kind][previous.color]));
      const travel = this.travel.get(id) ?? { x: positionX, z: positionZ, distance: 0 };
      travel.distance += Math.hypot(positionX - travel.x, positionZ - travel.z);
      travel.x = positionX; travel.z = positionZ;
      this.travel.set(id, travel);
      for (const [wheelIndex, wheel] of batch.wheelLayout.entries()) {
        this.transform.scale.set(wheel.width, wheel.radius, wheel.radius);
        this.wheelRotation.setFromAxisAngle(this.axle, travel.distance / wheel.radius);
        this.transform.quaternion.copy(this.orientation).multiply(this.wheelRotation);
        this.place(wheel.x, wheel.radius, wheel.z);
        batch.wheels.setMatrixAt(index * 4 + wheelIndex, this.transform.matrix);
      }
      total++;
    }
    for (const [kind, batch] of this.batches.entries()) {
      batch.body.count = batch.details.count = counts[kind];
      batch.wheels.count = counts[kind] * 4;
      for (const mesh of [batch.body, batch.details, batch.wheels]) mesh.instanceMatrix.needsUpdate = true;
      if (batch.body.instanceColor) batch.body.instanceColor.needsUpdate = true;
    }
  }

  private place(positionX: number, positionY: number, positionZ: number) {
    this.offset.set(positionX, positionY, positionZ).applyQuaternion(this.orientation);
    this.transform.position.copy(this.ground).add(this.offset);
    this.transform.updateMatrix();
  }

  clear() { this.frames.clear(); this.travel.clear(); this.render(0); }

  dispose() {
    for (const batch of this.batches) {
      for (const mesh of [batch.body, batch.details, batch.wheels]) {
        this.scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose();
      }
    }
    this.paintMaterial.dispose(); this.detailMaterial.dispose();
    this.frames.clear(); this.travel.clear();
  }
}
