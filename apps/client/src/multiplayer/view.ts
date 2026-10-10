import * as THREE from "three";
import { WALK_SPEED, SPRINT_SPEED, SLIDE_ANIM, TRAM_KIND, POLYBAHN_KIND, type MovementWorld, type PlayerState } from "@race/shared";
import { gaitRate } from "./avatar.ts";

export const PERSPECTIVES = ["First person", "Third person — behind", "Third person — front"];
const SPRING_LENGTH = 4.5;
const SPRING_CLEARANCE = 0.2;
const SPRING_RETURN_RATE = 8;
// Presentation only: predicted player positions remain the movement authority.
export class PlayerView {
  yaw = 0;
  pitch = 0;
  perspective = 0;
  bob = true;
  sensitivity = 0.0025;
  private phase = 0;
  private amplitude = 0;
  private eye = 1.6;
  private roll = 0;
  private slideTilt = 0;
  private landing = 0;
  private grounded = true;
  private verticalSpeed = 0;
  private ray = new THREE.Raycaster();
  private origin = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private intersections: THREE.Intersection[] = [];
  private springLength = SPRING_LENGTH;
  private railRide = "";
  private railYaw = 0;
  constructor(readonly camera: THREE.PerspectiveCamera, private walls: THREE.Object3D[], private world?: MovementWorld) {
    this.ray.firstHitOnly = true;
  }
  look(dx: number, dy: number) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.sensitivity, -1.45, 1.45);
  }
  cycle() {
    const previous = this.perspective;
    this.perspective = (this.perspective + 1) % PERSPECTIVES.length;
    if (previous === 0 && this.perspective !== 0) this.springLength = 0;
  }
  update(p: PlayerState, dt: number) {
    const rail = p.vehicleKind === TRAM_KIND || p.vehicleKind === POLYBAHN_KIND;
    if (rail && p.vehicleId) {
      if (this.railRide === p.vehicleId) this.yaw += Math.atan2(Math.sin(p.rotY - this.railYaw), Math.cos(p.rotY - this.railYaw));
      else this.yaw = p.rotY + Math.PI;
      this.railRide = p.vehicleId; this.railYaw = p.rotY;
    } else this.railRide = "";
    const blend = 1 - Math.exp(-10 * dt), speed = Math.hypot(p.vx, p.vz);
    const down = p.anim === 3 || p.knockdownUntil > p.simTime;
    const sliding = p.anim === SLIDE_ANIM && !down;
    this.slideTilt += ((sliding ? 0.20 : 0) - this.slideTilt) * blend;
    const walking = !p.vehicleId && p.grounded && !down && !sliding;
    // Distance-driven steps, but no bone-driven camera or oscillating horizon.
    if (walking) this.phase += gaitRate(speed) * dt;
    this.amplitude += ((this.bob && walking ? Math.min(0.018, speed * 0.0015) : 0) - this.amplitude) * blend;
    this.eye += ((down ? 0.48 : sliding ? 0.82 : rail ? 1.58 : p.vehicleId ? 1.05 : 1.6) - this.eye) * blend;
    const strafe = p.vx * Math.cos(this.yaw) - p.vz * Math.sin(this.yaw);
    this.roll += ((down ? 0.35 : this.bob && walking ? THREE.MathUtils.clamp(-strafe * 0.001, -0.008, 0.008) : 0) - this.roll) * blend;
    this.landing *= Math.exp(-14 * dt);
    if (this.bob && !down && !p.vehicleId) {
      if (p.grounded && !this.grounded) this.landing = Math.min(0.075, Math.max(0, -this.verticalSpeed) * 0.004);
      else if (!p.grounded && this.grounded && p.vy > 0) this.landing = 0.025;
    }
    this.grounded = p.grounded; this.verticalSpeed = p.vy;
    this.origin.set(p.x, p.y + this.eye, p.z);
    if (this.perspective === 0) {
      this.camera.position.copy(this.origin);
      // Eyes sit in front of the body, not inside the chest when looking down.
      const eyeForward = 0.15 - this.slideTilt * 0.6 + Math.max(0, -Math.sin(this.pitch)) * 0.24;
      this.camera.position.x -= Math.sin(this.yaw) * eyeForward;
      this.camera.position.z -= Math.cos(this.yaw) * eyeForward;
      const sway = Math.sin(this.phase) * this.amplitude * 0.35;
      this.camera.position.x += Math.cos(this.yaw) * sway;
      this.camera.position.z -= Math.sin(this.yaw) * sway;
      this.camera.position.y += Math.sin(this.phase * 2) * this.amplitude - this.landing;
      this.camera.rotation.set(this.pitch - this.slideTilt, this.yaw, this.roll, "YXZ");
    } else {
      this.direction.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      this.desired.copy(this.direction).multiplyScalar(this.perspective === 1 ? -SPRING_LENGTH : SPRING_LENGTH);
      this.desired.y += 0.3;
      const desiredLength = this.desired.length();
      this.direction.copy(this.desired).normalize();
      this.ray.set(this.origin, this.direction);
      this.ray.far = desiredLength;
      this.intersections.length = 0;
      const hit = this.ray.intersectObjects(this.walls, true, this.intersections)[0];
      const availableLength = hit
        ? Math.max(0, hit.distance - SPRING_CLEARANCE)
        : desiredLength;
      if (availableLength < this.springLength) this.springLength = availableLength;
      else this.springLength += (availableLength - this.springLength) * (1 - Math.exp(-SPRING_RETURN_RATE * dt));
      this.camera.position.copy(this.origin).addScaledVector(this.direction, this.springLength);
      const ground = this.world?.height(this.camera.position.x, this.camera.position.z);
      if (ground !== undefined) this.camera.position.y = Math.max(this.camera.position.y, ground + 0.25);
      this.camera.lookAt(this.origin);
    }
    const sprint = THREE.MathUtils.clamp((speed - WALK_SPEED) / (SPRINT_SPEED - WALK_SPEED), 0, 1);
    this.camera.fov += ((82 + (!down && !p.vehicleId ? sprint * 6 : 0)) - this.camera.fov) * blend;
    this.camera.updateProjectionMatrix();
  }
}
