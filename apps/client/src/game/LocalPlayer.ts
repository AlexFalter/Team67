import { Vector3 } from "three";
import {
  DT, copyBody, createBody, createInput, seatPosition, step, stepVehicle, type Body, type VehicleBody, type World,
} from "@race/shared";
import type { Input } from "./input";

const CORRECTION_TAU = 0.05; // s; a correction is ~95% blended out after 150 ms

/**
 * Fixed 60 Hz simulation of the local player (on foot, or driving a cart/bike) with render interpolation
 * between the last two ticks. The local player is never interpolated toward network data and never
 * snaps: server corrections move the simulation at once but leave a render offset that decays to zero.
 */
export class LocalPlayer {
  readonly body: Body;
  private prev: Body;
  private input = createInput();
  private acc = 0;
  /** Interpolated, correction-offset position to draw and to put the camera on. */
  readonly render = new Vector3();
  private offset = new Vector3();
  /** The cart/bike I drive (simulated here like my body), and its interpolated pose. */
  vehicle?: VehicleBody;
  private prevVehicle: VehicleBody = { kind: 0, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 };
  readonly vehicleRender: VehicleBody = { kind: 0, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 };
  /** Called after every foot tick (separation against other players etc.). */
  afterTick?: (body: Body) => void;
  /** Biggest landing speed / vehicle wall impact during the last frame. */
  landedSpeed = 0;
  impact = 0;

  constructor(private world: World, x: number, y: number, z: number) {
    this.body = createBody(x, y, z);
    this.prev = createBody(x, y, z);
    this.render.set(x, y, z);
  }

  /** Simulation time not yet stepped (s): the latest tick state is this far in the past. */
  get pending() { return this.acc; }

  frame(dt: number, input: Input | undefined) {
    this.acc += dt;
    this.landedSpeed = this.impact = 0;
    const v = this.vehicle;
    while (this.acc >= DT) {
      if (input) input.fill(this.input);
      else { this.input.forward = this.input.right = 0; this.input.jump = this.input.sprint = false; }
      if (v) {
        Object.assign(this.prevVehicle, v);
        this.impact = Math.max(this.impact, stepVehicle(v, this.input, DT, this.world));
      } else {
        copyBody(this.body, this.prev);
        const vy = this.body.vy;
        step(this.body, this.input, DT, this.world);
        if (this.body.landed) this.landedSpeed = Math.max(this.landedSpeed, -vy);
        this.afterTick?.(this.body);
      }
      this.acc -= DT;
    }
    const a = this.acc / DT;
    this.offset.multiplyScalar(Math.exp(-dt / CORRECTION_TAU));
    if (v) {
      const p = this.prevVehicle, r = this.vehicleRender;
      r.kind = v.kind;
      r.x = p.x + (v.x - p.x) * a; r.y = p.y + (v.y - p.y) * a; r.z = p.z + (v.z - p.z) * a;
      r.yaw = p.yaw + Math.atan2(Math.sin(v.yaw - p.yaw), Math.cos(v.yaw - p.yaw)) * a;
      r.vx = v.vx; r.vz = v.vz;
      r.x += this.offset.x; r.y += this.offset.y; r.z += this.offset.z;
      seatPosition(r, 0, this.render);
      seatPosition(v, 0, this.body);
      this.body.vx = v.vx; this.body.vz = v.vz; this.body.vy = 0;
      return;
    }
    const p = this.prev, b = this.body;
    this.render.set(p.x + (b.x - p.x) * a, p.y + (b.y - p.y) * a, p.z + (b.z - p.z) * a).add(this.offset);
  }

  /** Start (a pose) or stop (undefined) driving. */
  drive(pose: VehicleBody | undefined) {
    if (pose) {
      this.vehicle = { ...pose };
      Object.assign(this.prevVehicle, pose);
      Object.assign(this.vehicleRender, pose);
    } else this.vehicle = undefined;
    this.offset.set(0, 0, 0);
  }

  /** Move the simulation to an authoritative position without a visible jump. */
  correct(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const v = this.vehicle;
    const from = v ? this.vehicleRender : this.render;
    this.offset.set(from.x - x, from.y - y, from.z - z);
    if (this.offset.lengthSq() > 25 * 25) this.offset.set(0, 0, 0); // teleports cut instead of gliding
    if (v) {
      v.x = x; v.y = y; v.z = z; v.vx = vx; v.vz = vz;
      Object.assign(this.prevVehicle, v);
      return;
    }
    this.place(x, y, z);
    const b = this.body;
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.grounded = Math.abs(y - this.world.height(x, z)) < 0.05 && vy <= 0;
    copyBody(b, this.prev);
  }

  /** Hard placement, no blending (spawn, getting off a seat). */
  place(x: number, y: number, z: number) {
    const b = this.body;
    b.x = x; b.y = y; b.z = z;
    b.vx = b.vy = b.vz = 0;
    b.grounded = true;
    b.airTime = 0;
    copyBody(b, this.prev);
  }

  /** Render exactly at the simulation (clears blending). */
  snapRender() {
    this.offset.set(0, 0, 0);
    this.render.set(this.body.x, this.body.y, this.body.z);
  }
}
