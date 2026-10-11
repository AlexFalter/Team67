import * as THREE from "three";
import { LIME_KIND, WALK_SPEED, SPRINT_SPEED, impactPose, SLIDE_ANIM, TRAM_KIND, POLYBAHN_KIND, type MovementWorld, type PlayerState } from "@race/shared";
import { gaitRate } from "./avatar.ts";

export const PERSPECTIVES = ["First person", "Third person — behind", "Third person — front"];
const SPRING_LENGTH = 4.5;
const POLYBAHN_SPRING_LENGTH = 10;
const TRAM_SPRING_LENGTH = 13;
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
  private vehicleRide = "";
  private footPerspective = 0;
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
  get scriptedRide() { return this.vehicleRide === "npc-limousine"; }
  setVehicle(id: string, heading: number) {
    if (id === this.vehicleRide) return;
    if (id) {
      if (!this.vehicleRide) this.footPerspective = this.perspective;
      this.perspective = 1; this.yaw = heading + Math.PI; this.pitch = -0.12;
      this.springLength = 0;
    } else this.perspective = this.footPerspective;
    this.vehicleRide = id;
  }
  update(p: PlayerState, dt: number, railFrame?: { rotY: number; pitch: number }) {
    const cabinYaw = railFrame?.rotY ?? p.rotY;
    const rail = p.vehicleKind === TRAM_KIND || p.vehicleKind === POLYBAHN_KIND;
    if (rail && p.vehicleId) {
      if (this.railRide === p.vehicleId) this.yaw += Math.atan2(Math.sin(cabinYaw - this.railYaw), Math.cos(cabinYaw - this.railYaw));
      else this.yaw = p.rotY + Math.PI;
      this.railRide = p.vehicleId; this.railYaw = cabinYaw;
    } else this.railRide = "";
    const blend = 1 - Math.exp(-10 * dt), speed = Math.hypot(p.vx, p.vz);
    const down = p.anim === 3 || p.knockdownUntil > p.simTime;
    const impact = impactPose(p);
    const fall = impact.active ? impact.fall : down ? 1 : 0;
    const force = Math.hypot(p.impactX ?? 0, p.impactZ ?? 0);
    const sideHit = force ? ((p.impactX ?? 0) * Math.cos(this.yaw) - (p.impactZ ?? 0) * Math.sin(this.yaw)) / force : 1;
    const sliding = p.anim === SLIDE_ANIM && !down;
    this.slideTilt += ((sliding ? 0.20 : 0) - this.slideTilt) * blend;
    const walking = !p.vehicleId && p.grounded && !down && !sliding;
    // Distance-driven steps, but no bone-driven camera or oscillating horizon.
    if (walking) this.phase += gaitRate(speed) * dt;
    this.amplitude += ((this.bob && walking ? Math.min(0.018, speed * 0.0015) : 0) - this.amplitude) * blend;
    this.eye += ((down ? 1.6 - fall * 1.18 - Math.sin(impact.rise * Math.PI) * 0.2 : sliding ? 0.82 : p.vehicleKind === TRAM_KIND ? 1.65 : rail ? (p.cabinStanding ? 1.42 : 1.4) : p.vehicleId ? (p.vehicleKind===LIME_KIND?1.6:1.05) : 1.6) - this.eye) * blend;
    const strafe = p.vx * Math.cos(this.yaw) - p.vz * Math.sin(this.yaw);
    this.roll += ((down ? sideHit * fall * 0.5 : this.bob && walking ? THREE.MathUtils.clamp(-strafe * 0.001, -0.008, 0.008) : 0) - this.roll) * blend;
    this.landing *= Math.exp(-14 * dt);
    if(rail && p.vehicleId && !down){this.amplitude=0;this.roll=0;this.landing=0;}
    if (this.bob && !down && !p.vehicleId) {
      if (p.grounded && !this.grounded) this.landing = Math.min(0.075, Math.max(0, -this.verticalSpeed) * 0.004);
      else if (!p.grounded && this.grounded && p.vy > 0) this.landing = 0.025;
    }
    this.grounded = p.grounded; this.verticalSpeed = p.vy;
    this.origin.set(p.x, p.y + this.eye, p.z);
    if (railFrame && rail) {
      // Eye offset follows the inclined cabin, while the horizon stays level.
      const forward = this.eye * Math.sin(railFrame.pitch);
      this.origin.set(p.x + Math.sin(railFrame.rotY) * forward, p.y + this.eye * Math.cos(railFrame.pitch), p.z + Math.cos(railFrame.rotY) * forward);
    }
    if (this.perspective === 0) {
      this.camera.position.copy(this.origin);
      // Eyes sit in front of the body, not inside the chest when looking down.
      // Rail look pivots at the seated head; on-foot gaze clears the chest.
      const seated = rail && !!p.vehicleId;
      const headYaw = seated ? p.rotY + Math.PI : this.yaw;
      const headOffset = seated ? 0.07 : 0.15 - this.slideTilt * 0.6 + Math.max(0, -Math.sin(this.pitch)) * 0.24;
      this.camera.position.x -= Math.sin(headYaw) * headOffset;
      this.camera.position.z -= Math.cos(headYaw) * headOffset;
      const sway = Math.sin(this.phase) * this.amplitude * 0.35;
      this.camera.position.x += Math.cos(this.yaw) * sway;
      this.camera.position.z -= Math.sin(this.yaw) * sway;
      this.camera.position.y += Math.sin(this.phase * 2) * this.amplitude - this.landing;
      this.camera.rotation.set(this.pitch - this.slideTilt + (down ? fall * 0.3 - Math.sin(impact.rise * Math.PI) * 0.4 + impact.recoil * 0.12 : 0), this.yaw, this.roll, "YXZ");
    } else {
      this.direction.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      const polybahn = p.vehicleKind === POLYBAHN_KIND && !!p.vehicleId;
      const tram = p.vehicleKind === TRAM_KIND && !!p.vehicleId;
      const limo = p.vehicleId === "npc-limousine";
      const distance = tram ? TRAM_SPRING_LENGTH : polybahn ? POLYBAHN_SPRING_LENGTH : limo ? 8 : p.vehicleId && p.vehicleKind === 0 ? 6 : SPRING_LENGTH;
      if (rail) this.origin.y += .65;
      this.desired.copy(this.direction).multiplyScalar(this.perspective === 1 ? -distance : distance);
      this.desired.y += tram ? 2.6 : polybahn ? 3 : limo ? 1.4 : .3;
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
    this.camera.fov += (((rail && this.perspective === 0 ? 72 : 82) + (!down && !p.vehicleId ? sprint * 6 : 0)) - this.camera.fov) * blend;
    this.camera.updateProjectionMatrix();
  }
}
